import mongoose from 'mongoose';
import Decimal from 'decimal.js';
import { Material, IMaterial } from '../models/Material';
import { Product, IProduct } from '../models/Product';
import {
  StockLedger,
  StockItemType,
  MovementType,
} from '../models/StockLedger';
import { AppError, NotFoundError } from '../utils/errors';
import { roundQty, roundRate, roundMoney } from '../utils/decimal';
import { createNotification, recordAuditLog } from './auditService';
import { withTransaction } from '../config/db';

export interface PostStockMovementInput {
  date?: Date;
  itemType: StockItemType;
  itemId: string;
  movementType: MovementType;
  direction: 'IN' | 'OUT';
  quantity: number;
  unitCost?: number; // For IN receipts with a purchase/production cost; OUT uses weightedAvgRate
  sourceDocType: string;
  sourceDocId?: string;
  sourceDocNumber: string;
  userId?: string;
  userName: string;
  notes?: string;
  allowNegative?: boolean;
  session: mongoose.ClientSession;
}

/**
 * Single authoritative entry point for ALL stock changes.
 * Updates balance & weighted-average valuation inside a MongoDB transaction
 * and writes an immutable StockLedger record.
 */
export async function postStockMovement(input: PostStockMovementInput) {
  if (input.quantity <= 0) {
    throw new AppError('Stock movement quantity must be greater than zero');
  }

  const isProduct = input.itemType === 'FINISHED_GOOD';
  const session = input.session;

  if (isProduct) {
    const product = await Product.findById(input.itemId).session(session);
    if (!product) throw new NotFoundError('Product not found for stock movement');

    const prevBalance = roundQty(product.currentStock);
    const qty = roundQty(input.quantity);
    const signedQty = input.direction === 'IN' ? qty : -qty;
    const newBalance = roundQty(new Decimal(prevBalance).plus(signedQty));

    if (!input.allowNegative && newBalance < 0) {
      throw new AppError(
        `Insufficient stock for ${product.name}. Available: ${prevBalance} ${product.unit}, Requested: ${qty} ${product.unit}`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }

    const effectiveUnitCost = roundRate(
      input.unitCost !== undefined ? input.unitCost : product.weightedAvgCost
    );
    const totalValue = roundMoney(new Decimal(qty).mul(effectiveUnitCost));

    // Update weighted average cost on IN movements when unitCost is provided
    if (input.direction === 'IN' && input.unitCost !== undefined && newBalance > 0) {
      const existingVal = new Decimal(Math.max(prevBalance, 0)).mul(product.weightedAvgCost);
      const addedVal = new Decimal(qty).mul(effectiveUnitCost);
      product.weightedAvgCost = roundRate(existingVal.plus(addedVal).div(newBalance));
    }

    product.currentStock = newBalance;
    await product.save({ session });

    const [ledger] = await StockLedger.create(
      [
        {
          date: input.date || new Date(),
          itemType: input.itemType,
          itemId: product._id,
          itemModel: 'Product',
          itemName: product.name,
          itemCode: product.sku,
          movementType: input.movementType,
          direction: input.direction,
          quantity: qty,
          signedQuantity: signedQty,
          unit: product.unit,
          unitCost: effectiveUnitCost,
          totalValue,
          sourceDocType: input.sourceDocType,
          sourceDocId: input.sourceDocId,
          sourceDocNumber: input.sourceDocNumber,
          userId: input.userId,
          userName: input.userName,
          previousBalance: prevBalance,
          newBalance,
          notes: input.notes,
        },
      ],
      { session }
    );

    if (newBalance <= product.reorderLevel) {
      await createNotification({
        title: `Low Finished Goods Stock: ${product.name}`,
        message: `${product.name} (${product.sku}) dropped to ${newBalance} ${product.unit} (reorder level: ${product.reorderLevel}).`,
        severity: newBalance === 0 ? 'CRITICAL' : 'WARNING',
        category: 'STOCK',
        targetRoles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR'],
        link: '/inventory',
        session,
      });
    }

    return { item: product, ledger, previousBalance: prevBalance, newBalance, unitCost: effectiveUnitCost };
  } else {
    const material = await Material.findById(input.itemId).session(session);
    if (!material) throw new NotFoundError('Material not found for stock movement');

    const prevBalance = roundQty(material.currentStock);
    const qty = roundQty(input.quantity);
    const signedQty = input.direction === 'IN' ? qty : -qty;
    const newBalance = roundQty(new Decimal(prevBalance).plus(signedQty));

    if (!input.allowNegative && newBalance < 0) {
      throw new AppError(
        `Insufficient stock for ${material.name}. Available: ${prevBalance} ${material.unit}, Requested: ${qty} ${material.unit}`,
        400,
        'INSUFFICIENT_STOCK'
      );
    }

    const effectiveUnitCost = roundRate(
      input.direction === 'IN' && input.unitCost !== undefined
        ? input.unitCost
        : material.weightedAvgRate
    );
    const totalValue = roundMoney(new Decimal(qty).mul(effectiveUnitCost));

    // Weighted-average valuation update on stock IN
    if (input.direction === 'IN' && input.unitCost !== undefined && newBalance > 0) {
      const existingVal = new Decimal(Math.max(prevBalance, 0)).mul(material.weightedAvgRate);
      const addedVal = new Decimal(qty).mul(effectiveUnitCost);
      material.weightedAvgRate = roundRate(existingVal.plus(addedVal).div(newBalance));
    }

    material.currentStock = newBalance;
    await material.save({ session });

    const [ledger] = await StockLedger.create(
      [
        {
          date: input.date || new Date(),
          itemType: material.category,
          itemId: material._id,
          itemModel: 'Material',
          itemName: material.name,
          itemCode: material.code,
          movementType: input.movementType,
          direction: input.direction,
          quantity: qty,
          signedQuantity: signedQty,
          unit: material.unit,
          unitCost: effectiveUnitCost,
          totalValue,
          sourceDocType: input.sourceDocType,
          sourceDocId: input.sourceDocId,
          sourceDocNumber: input.sourceDocNumber,
          userId: input.userId,
          userName: input.userName,
          previousBalance: prevBalance,
          newBalance,
          notes: input.notes,
        },
      ],
      { session }
    );

    if (newBalance <= material.reorderLevel) {
      await createNotification({
        title: `Low Material Stock: ${material.name}`,
        message: `${material.name} (${material.code}) dropped to ${newBalance} ${material.unit} (reorder level: ${material.reorderLevel}).`,
        severity: newBalance === 0 ? 'CRITICAL' : 'WARNING',
        category: 'STOCK',
        targetRoles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR'],
        link: '/inventory',
        session,
      });
    }

    return { item: material, ledger, previousBalance: prevBalance, newBalance, unitCost: effectiveUnitCost };
  }
}

export async function getInventorySummary() {
  const [materials, products, ledgerTotals] = await Promise.all([
    Material.find({ isActive: true }).sort({ category: 1, name: 1 }).lean(),
    Product.find({ isActive: true }).sort({ name: 1 }).lean(),
    StockLedger.aggregate([
      {
        $group: {
          _id: { itemId: '$itemId', movementType: '$movementType' },
          totalQty: { $sum: '$quantity' },
        },
      },
    ]),
  ]);

  const movementMap = new Map<string, Record<string, number>>();
  for (const row of ledgerTotals) {
    const key = String(row._id.itemId);
    if (!movementMap.has(key)) movementMap.set(key, {});
    movementMap.get(key)![row._id.movementType] = roundQty(row.totalQty);
  }

  const formatMaterial = (m: (typeof materials)[number]) => {
    const stats = movementMap.get(String(m._id)) || {};
    const opening = stats.OPENING_STOCK || 0;
    const receipts = (stats.PURCHASE_RECEIPT || 0) + (stats.PRODUCTION_RECEIPT || 0);
    const issues = (stats.PRODUCTION_ISSUE || 0) + (stats.DAMAGE || 0);
    const sales = stats.SALES_DISPATCH || 0;
    const returns = stats.CUSTOMER_RETURN || 0;
    const adjustments = stats.ADJUSTMENT || 0;
    const computedClosing = roundQty(opening + receipts - issues - sales + returns + adjustments);

    return {
      ...m,
      stockValue: roundMoney(new Decimal(m.currentStock).mul(m.weightedAvgRate)),
      isLowStock: m.currentStock <= m.reorderLevel,
      reconciliation: {
        opening,
        receipts,
        issues,
        sales,
        returns,
        adjustments,
        computedClosing,
      },
    };
  };

  const rawMaterials = materials.filter((m) => m.category === 'RAW_MATERIAL').map(formatMaterial);
  const packagingMaterials = materials.filter((m) => m.category === 'PACKAGING').map(formatMaterial);

  const finishedGoods = products.map((p) => {
    const stats = movementMap.get(String(p._id)) || {};
    const opening = stats.OPENING_STOCK || 0;
    const receipts = stats.PRODUCTION_RECEIPT || 0;
    const issues = stats.DAMAGE || 0;
    const sales = stats.SALES_DISPATCH || 0;
    const returns = stats.CUSTOMER_RETURN || 0;
    const adjustments = stats.ADJUSTMENT || 0;
    const computedClosing = roundQty(opening + receipts - issues - sales + returns + adjustments);

    return {
      ...p,
      stockValue: roundMoney(new Decimal(p.currentStock).mul(p.weightedAvgCost || p.sellingPrice)),
      retailValue: roundMoney(new Decimal(p.currentStock).mul(p.sellingPrice)),
      isLowStock: p.currentStock <= p.reorderLevel,
      reconciliation: {
        opening,
        receipts,
        issues,
        sales,
        returns,
        adjustments,
        computedClosing,
      },
    };
  });

  const rawMaterialValue = roundMoney(rawMaterials.reduce((s, m) => s + m.stockValue, 0));
  const packagingValue = roundMoney(packagingMaterials.reduce((s, m) => s + m.stockValue, 0));
  const finishedGoodsValue = roundMoney(finishedGoods.reduce((s, p) => s + p.retailValue, 0));

  return {
    rawMaterials,
    packagingMaterials,
    finishedGoods,
    totals: {
      rawMaterialValue,
      packagingValue,
      finishedGoodsValue,
      lowStockCount:
        rawMaterials.filter((m) => m.isLowStock).length +
        packagingMaterials.filter((m) => m.isLowStock).length +
        finishedGoods.filter((p) => p.isLowStock).length,
    },
  };
}

export async function getStockLedger(filters: {
  itemType?: string;
  itemId?: string;
  movementType?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
}) {
  const query: Record<string, unknown> = {};
  if (filters.itemType) query.itemType = filters.itemType;
  if (filters.itemId) query.itemId = filters.itemId;
  if (filters.movementType) query.movementType = filters.movementType;
  if (filters.search) {
    query.$or = [
      { itemName: { $regex: filters.search, $options: 'i' } },
      { itemCode: { $regex: filters.search, $options: 'i' } },
      { sourceDocNumber: { $regex: filters.search, $options: 'i' } },
      { notes: { $regex: filters.search, $options: 'i' } },
    ];
  }
  if (filters.startDate || filters.endDate) {
    const dateRange: Record<string, Date> = {};
    if (filters.startDate) dateRange.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      dateRange.$lte = end;
    }
    query.date = dateRange;
  }

  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(200, Math.max(1, filters.limit || 25));

  const [items, total] = await Promise.all([
    StockLedger.find(query)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    StockLedger.countDocuments(query),
  ]);

  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function recordManualAdjustment(input: {
  itemType: StockItemType;
  itemId: string;
  movementType: 'ADJUSTMENT' | 'DAMAGE' | 'CUSTOMER_RETURN' | 'OPENING_STOCK';
  direction: 'IN' | 'OUT';
  quantity: number;
  unitCost?: number;
  notes: string;
  userId: string;
  userName: string;
  userRole: string;
}) {
  return withTransaction(async (session) => {
    const ref = `ADJ-${Date.now().toString().slice(-6)}`;
    const result = await postStockMovement({
      itemType: input.itemType,
      itemId: input.itemId,
      movementType: input.movementType,
      direction: input.direction,
      quantity: input.quantity,
      unitCost: input.unitCost,
      sourceDocType: 'STOCK_ADJUSTMENT',
      sourceDocNumber: ref,
      userId: input.userId,
      userName: input.userName,
      notes: input.notes,
      session,
    });

    await recordAuditLog({
      userId: input.userId,
      userName: input.userName,
      userRole: input.userRole,
      action: 'STOCK_ADJUSTMENT',
      entityType: input.itemType,
      entityId: input.itemId,
      entityRef: ref,
      summary: `${input.movementType} (${input.direction} ${input.quantity}) on ${result.ledger.itemName}: ${input.notes}`,
      afterData: {
        previousBalance: result.previousBalance,
        newBalance: result.newBalance,
      },
      session,
    });

    return result.ledger;
  });
}
