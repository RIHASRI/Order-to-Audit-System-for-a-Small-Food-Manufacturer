import Decimal from 'decimal.js';
import { BOM } from '../models/BOM';
import { Product } from '../models/Product';
import { Material } from '../models/Material';
import { NotFoundError } from '../utils/errors';
import { convertUnit } from '../utils/unitConverter';
import { roundQty } from '../utils/decimal';
import { recordAuditLog } from './auditService';
import { AuthUser } from '../middleware/auth';

export interface BomLineInput {
  materialId: string;
  quantity: number;
  unit: string;
}

export interface CreateBomInput {
  productId: string;
  batchSize: number;
  expectedOutput: number;
  outputUnit?: string;
  rawMaterials: BomLineInput[];
  packagingMaterials: BomLineInput[];
  standardLabourCost?: number;
  standardPowerCost?: number;
  notes?: string;
}

export async function listBoms(productId?: string) {
  const query: Record<string, unknown> = {};
  if (productId) query.product = productId;
  return BOM.find(query).sort({ productName: 1, version: -1 }).lean();
}

export async function getBomById(id: string) {
  const bom = await BOM.findById(id).lean();
  if (!bom) throw new NotFoundError('BOM not found');
  return bom;
}

export async function createBomVersion(input: CreateBomInput, actor: AuthUser) {
  const product = await Product.findById(input.productId);
  if (!product) throw new NotFoundError('Product not found');

  const latestBom = await BOM.findOne({ product: product._id })
    .sort({ version: -1 })
    .lean();
  const nextVersion = latestBom ? latestBom.version + 1 : 1;

  // Deactivate previous versions for this product
  await BOM.updateMany({ product: product._id }, { $set: { isActive: false } });

  const resolveItems = async (lines: BomLineInput[]) => {
    const resolved = [];
    for (const line of lines) {
      const mat = await Material.findById(line.materialId).lean();
      if (!mat) throw new NotFoundError(`Material ${line.materialId} not found`);
      resolved.push({
        material: mat._id,
        materialName: mat.name,
        materialCode: mat.code,
        quantity: line.quantity,
        unit: line.unit,
        materialUnit: mat.unit,
      });
    }
    return resolved;
  };

  const [rawMaterials, packagingMaterials] = await Promise.all([
    resolveItems(input.rawMaterials),
    resolveItems(input.packagingMaterials),
  ]);

  const bom = await BOM.create({
    product: product._id,
    productName: product.name,
    bomCode: `BOM-${product.sku}-V${nextVersion}`,
    version: nextVersion,
    isActive: true,
    batchSize: input.batchSize,
    expectedOutput: input.expectedOutput,
    outputUnit: input.outputUnit || product.unit,
    rawMaterials,
    packagingMaterials,
    standardLabourCost: input.standardLabourCost ?? 0,
    standardPowerCost: input.standardPowerCost ?? 0,
    notes: input.notes,
    createdBy: actor.id,
  });

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'CREATE_BOM',
    entityType: 'BOM',
    entityId: String(bom._id),
    entityRef: bom.bomCode,
    summary: `Created BOM ${bom.bomCode} (v${nextVersion}) for ${product.name}`,
    afterData: bom.toObject() as unknown as Record<string, unknown>,
  });

  return bom.toObject();
}

/**
 * Scales a BOM for any requested batch size (e.g. 0.5, 1, 2.5 batches)
 * and converts material quantities into their canonical inventory storage units.
 */
export function calculateScaledBomRequirements(
  bom: {
    batchSize: number;
    expectedOutput: number;
    rawMaterials: Array<{
      material: unknown;
      materialName: string;
      materialCode: string;
      quantity: number;
      unit: string;
      materialUnit: string;
    }>;
    packagingMaterials: Array<{
      material: unknown;
      materialName: string;
      materialCode: string;
      quantity: number;
      unit: string;
      materialUnit: string;
    }>;
    standardLabourCost: number;
    standardPowerCost: number;
  },
  requestedBatchSize: number
) {
  const factor = new Decimal(requestedBatchSize).div(bom.batchSize);
  const expectedOutput = roundQty(new Decimal(bom.expectedOutput).mul(factor));

  const scaleItem = (
    item: {
      material: unknown;
      materialName: string;
      materialCode: string;
      quantity: number;
      unit: string;
      materialUnit: string;
    },
    category: 'RAW_MATERIAL' | 'PACKAGING'
  ) => {
    const scaledInBomUnit = new Decimal(item.quantity).mul(factor).toNumber();
    const plannedQtyInStorageUnit = roundQty(
      convertUnit(scaledInBomUnit, item.unit, item.materialUnit, {
        packetsPerCarton: 20,
        piecesPerPacket: 1,
      })
    );
    return {
      materialId: String(item.material),
      materialName: item.materialName,
      materialCode: item.materialCode,
      category,
      plannedQty: plannedQtyInStorageUnit,
      unit: item.materialUnit,
    };
  };

  return {
    expectedOutput,
    plannedMaterials: [
      ...bom.rawMaterials.map((r) => scaleItem(r, 'RAW_MATERIAL')),
      ...bom.packagingMaterials.map((p) => scaleItem(p, 'PACKAGING')),
    ],
    standardLabourCost: new Decimal(bom.standardLabourCost || 0).mul(factor).toDecimalPlaces(2).toNumber(),
    standardPowerCost: new Decimal(bom.standardPowerCost || 0).mul(factor).toDecimalPlaces(2).toNumber(),
  };
}
