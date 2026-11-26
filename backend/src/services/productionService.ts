import Decimal from 'decimal.js';
import { BOM } from '../models/BOM';
import { Product } from '../models/Product';
import { Material } from '../models/Material';
import { ProductionRun, IProductionMaterialLine } from '../models/ProductionRun';
import { withTransaction } from '../config/db';
import { getNextSequence } from '../utils/sequence';
import { roundMoney, roundQty, roundRate } from '../utils/decimal';
import { AppError, NotFoundError } from '../utils/errors';
import { calculateScaledBomRequirements } from './bomService';
import { postStockMovement } from './inventoryService';
import { createNotification, recordAuditLog } from './auditService';
import { AuthUser } from '../middleware/auth';

export interface CreateProductionRunInput {
  productId: string;
  bomId?: string;
  productionDate?: string | Date;
  batchSize: number;
  actualRawMaterials?: Array<{ materialId: string; actualQty: number }>;
  actualPackaging?: Array<{ materialId: string; actualQty: number }>;
  actualGoodOutput: number;
  damagedQuantity?: number;
  damagedPouches?: number;
  cartonsUsed?: number;
  wastageQty?: number;
  wastageNotes?: string;
  labourCost: number;
  powerCost: number;
  otherOverheads?: number;
  notes?: string;
}

export async function listProductionRuns(filters: {
  productId?: string;
  hasVarianceAlert?: boolean;
  startDate?: string;
  endDate?: string;
  search?: string;
}) {
  const query: Record<string, unknown> = {};
  if (filters.productId) query.product = filters.productId;
  if (filters.hasVarianceAlert !== undefined) {
    query.hasVarianceAlert = filters.hasVarianceAlert;
  }
  if (filters.search) {
    query.$or = [
      { productionNumber: { $regex: filters.search, $options: 'i' } },
      { productName: { $regex: filters.search, $options: 'i' } },
      { supervisorName: { $regex: filters.search, $options: 'i' } },
    ];
  }
  if (filters.startDate || filters.endDate) {
    const range: Record<string, Date> = {};
    if (filters.startDate) range.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    query.productionDate = range;
  }

  return ProductionRun.find(query)
    .sort({ productionDate: -1, createdAt: -1 })
    .lean();
}

export async function getProductionRunById(id: string) {
  const run = await ProductionRun.findById(id).lean();
  if (!run) throw new NotFoundError('Production run not found');
  return run;
}

/**
 * Posts a production run atomically inside a MongoDB transaction:
 * 1. Scales BOM for batchSize & snapshots BOM.
 * 2. Reconciles packaging consumption (pouches = goodOutput + damagedPouches; cartons = cartonsUsed or floor(goodOutput/20)).
 * 3. Computes material consumption variance & yield variance (flags > 3%).
 * 4. Deducts raw & packaging materials from inventory using weighted-average rates.
 * 5. Credits finished goods stock by actualGoodOutput at calculated costPerPacket.
 * 6. Creates immutable StockLedger, AuditLog, and variance alert Notification entries.
 */
export async function postProductionRun(
  input: CreateProductionRunInput,
  actor: AuthUser
) {
  return withTransaction(async (session) => {
    const product = await Product.findById(input.productId).session(session);
    if (!product) throw new NotFoundError('Product not found');

    const bom = input.bomId
      ? await BOM.findById(input.bomId).session(session)
      : await BOM.findOne({ product: product._id, isActive: true })
          .sort({ version: -1 })
          .session(session);

    if (!bom) {
      throw new NotFoundError('Active Bill of Materials (BOM) not found for this product');
    }

    const scaled = calculateScaledBomRequirements(bom, input.batchSize);
    const productionNumber = await getNextSequence(
      'production_run',
      'PROD-2026-',
      4,
      session
    );

    const rawOverrideMap = new Map(
      (input.actualRawMaterials || []).map((r) => [r.materialId, r.actualQty])
    );
    const pkgOverrideMap = new Map(
      (input.actualPackaging || []).map((p) => [p.materialId, p.actualQty])
    );

    const damagedPouches = roundQty(input.damagedPouches ?? 0);
    const actualGoodOutput = roundQty(input.actualGoodOutput);

    const materialLines: IProductionMaterialLine[] = [];
    let materialCost = new Decimal(0);
    let packagingCost = new Decimal(0);
    let hasMaterialAlert = false;

    for (const planned of scaled.plannedMaterials) {
      const mat = await Material.findById(planned.materialId).session(session);
      if (!mat) throw new NotFoundError(`Material ${planned.materialName} not found`);

      let actualQty: number;
      if (planned.category === 'RAW_MATERIAL') {
        actualQty = roundQty(
          rawOverrideMap.has(planned.materialId)
            ? rawOverrideMap.get(planned.materialId)!
            : planned.plannedQty
        );
      } else {
        if (pkgOverrideMap.has(planned.materialId)) {
          actualQty = roundQty(pkgOverrideMap.get(planned.materialId)!);
        } else if (mat.subCategory.toUpperCase() === 'POUCH') {
          // Each good packet consumes 1 pouch + any damaged pouches during sealing/filling
          actualQty = roundQty(new Decimal(actualGoodOutput).plus(damagedPouches));
        } else if (mat.subCategory.toUpperCase() === 'CARTON') {
          if (input.cartonsUsed !== undefined) {
            actualQty = roundQty(input.cartonsUsed);
          } else {
            const packetsPerCarton =
              planned.plannedQty > 0
                ? new Decimal(scaled.expectedOutput).div(planned.plannedQty)
                : new Decimal(20);
            actualQty = Math.floor(
              new Decimal(actualGoodOutput).div(packetsPerCarton).toNumber()
            );
          }
        } else {
          actualQty = planned.plannedQty;
        }
      }

      const varianceQty = roundQty(new Decimal(actualQty).minus(planned.plannedQty));
      const variancePct =
        planned.plannedQty > 0
          ? new Decimal(varianceQty)
              .div(planned.plannedQty)
              .mul(100)
              .toDecimalPlaces(2)
              .toNumber()
          : 0;
      const isAlert = Math.abs(variancePct) > 3;
      if (isAlert) hasMaterialAlert = true;

      const unitCost = roundRate(mat.weightedAvgRate);
      const lineCost = roundMoney(new Decimal(actualQty).mul(unitCost));

      if (planned.category === 'RAW_MATERIAL') {
        materialCost = materialCost.plus(lineCost);
      } else {
        packagingCost = packagingCost.plus(lineCost);
      }

      if (actualQty > 0) {
        await postStockMovement({
          date: input.productionDate ? new Date(input.productionDate) : new Date(),
          itemType: planned.category,
          itemId: String(mat._id),
          movementType: 'PRODUCTION_ISSUE',
          direction: 'OUT',
          quantity: actualQty,
          sourceDocType: 'PRODUCTION_RUN',
          sourceDocNumber: productionNumber,
          userId: actor.id,
          userName: actor.name,
          notes: `Issued for ${productionNumber} (${product.name})`,
          session,
        });
      }

      materialLines.push({
        material: mat._id,
        materialName: mat.name,
        materialCode: mat.code,
        category: planned.category,
        plannedQty: planned.plannedQty,
        actualQty,
        unit: mat.unit,
        unitCost,
        totalCost: lineCost,
        varianceQty,
        variancePct,
        isAlert,
      });
    }

    const yieldVariancePct =
      scaled.expectedOutput > 0
        ? new Decimal(actualGoodOutput)
            .minus(scaled.expectedOutput)
            .div(scaled.expectedOutput)
            .mul(100)
            .toDecimalPlaces(2)
            .toNumber()
        : 0;

    const hasVarianceAlert = hasMaterialAlert || Math.abs(yieldVariancePct) > 3;

    const labourCost = roundMoney(input.labourCost);
    const powerCost = roundMoney(input.powerCost);
    const otherOverheads = roundMoney(input.otherOverheads || 0);
    const totalProductionCost = roundMoney(
      materialCost
        .plus(packagingCost)
        .plus(labourCost)
        .plus(powerCost)
        .plus(otherOverheads)
    );
    const costPerPacket =
      actualGoodOutput > 0
        ? new Decimal(totalProductionCost)
            .div(actualGoodOutput)
            .toDecimalPlaces(4)
            .toNumber()
        : 0;

    const damagedQuantity = roundQty(
      input.damagedQuantity ?? Math.max(0, scaled.expectedOutput - actualGoodOutput)
    );

    const cartonsLine = materialLines.find(
      (l) => l.category === 'PACKAGING' && l.materialName.toLowerCase().includes('carton')
    );

    const [run] = await ProductionRun.create(
      [
        {
          productionNumber,
          product: product._id,
          productName: product.name,
          bom: bom._id,
          bomVersion: bom.version,
          bomSnapshot: bom.toObject(),
          productionDate: input.productionDate
            ? new Date(input.productionDate)
            : new Date(),
          batchSize: input.batchSize,
          materials: materialLines,
          expectedOutput: scaled.expectedOutput,
          actualGoodOutput,
          damagedQuantity,
          damagedPouches,
          cartonsUsed: input.cartonsUsed ?? cartonsLine?.actualQty ?? 0,
          wastageQty: roundQty(input.wastageQty ?? damagedQuantity),
          wastageNotes: input.wastageNotes,
          labourCost,
          powerCost,
          otherOverheads,
          yieldVariancePct,
          hasVarianceAlert,
          materialCost: roundMoney(materialCost),
          packagingCost: roundMoney(packagingCost),
          totalProductionCost,
          costPerPacket,
          supervisor: actor.id,
          supervisorName: actor.name,
          status: 'POSTED',
          postedAt: new Date(),
          notes: input.notes,
        },
      ],
      { session }
    );

    if (actualGoodOutput > 0) {
      await postStockMovement({
        date: run.productionDate,
        itemType: 'FINISHED_GOOD',
        itemId: String(product._id),
        movementType: 'PRODUCTION_RECEIPT',
        direction: 'IN',
        quantity: actualGoodOutput,
        unitCost: costPerPacket,
        sourceDocType: 'PRODUCTION_RUN',
        sourceDocId: String(run._id),
        sourceDocNumber: productionNumber,
        userId: actor.id,
        userName: actor.name,
        notes: `Good output from ${productionNumber}`,
        session,
      });
    }

    if (hasVarianceAlert) {
      const flaggedItems = materialLines
        .filter((l) => l.isAlert)
        .map((l) => `${l.materialName}: ${l.variancePct > 0 ? '+' : ''}${l.variancePct}%`);
      const parts = [
        Math.abs(yieldVariancePct) > 3 ? `Yield variance: ${yieldVariancePct}%` : '',
        ...flaggedItems,
      ].filter(Boolean);

      await createNotification({
        title: `Production Variance Alert (${productionNumber})`,
        message: `${product.name} exceeded 3% tolerance — ${parts.join(', ')}`,
        severity: 'CRITICAL',
        category: 'PRODUCTION',
        targetRoles: ['OWNER', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
        link: '/production',
        session,
      });
    }

    await recordAuditLog({
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: 'POST_PRODUCTION_RUN',
      entityType: 'PRODUCTION_RUN',
      entityId: String(run._id),
      entityRef: productionNumber,
      summary: `Posted ${productionNumber} for ${product.name}: output ${actualGoodOutput}/${scaled.expectedOutput} (Yield ${yieldVariancePct}%, Cost ₹${totalProductionCost})`,
      afterData: {
        productionNumber,
        actualGoodOutput,
        yieldVariancePct,
        totalProductionCost,
        costPerPacket,
      },
      session,
    });

    return run.toObject();
  });
}
