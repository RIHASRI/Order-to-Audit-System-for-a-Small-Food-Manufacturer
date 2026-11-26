import Decimal from 'decimal.js';
import { PurchaseOrder } from '../models/PurchaseOrder';
import { Supplier } from '../models/Supplier';
import { Material } from '../models/Material';
import { withTransaction } from '../config/db';
import { getNextSequence } from '../utils/sequence';
import { roundMoney, roundQty } from '../utils/decimal';
import { AppError, NotFoundError } from '../utils/errors';
import { postStockMovement } from './inventoryService';
import { recordAuditLog } from './auditService';
import { AuthUser } from '../middleware/auth';

export interface CreatePurchaseInput {
  supplierId: string;
  purchaseDate?: string | Date;
  items: Array<{
    materialId: string;
    quantity: number;
    rate: number;
    gstRate?: number;
  }>;
  receiveImmediately?: boolean;
  paymentStatus?: 'UNPAID' | 'PARTIAL' | 'PAID';
  paidAmount?: number;
  notes?: string;
}

export async function listPurchases(filters: {
  supplierId?: string;
  receiptStatus?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}) {
  const query: Record<string, unknown> = {};
  if (filters.supplierId) query.supplier = filters.supplierId;
  if (filters.receiptStatus) query.receiptStatus = filters.receiptStatus;
  if (filters.search) {
    query.$or = [
      { poNumber: { $regex: filters.search, $options: 'i' } },
      { supplierName: { $regex: filters.search, $options: 'i' } },
      { 'items.materialName': { $regex: filters.search, $options: 'i' } },
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
    query.purchaseDate = range;
  }
  return PurchaseOrder.find(query).sort({ purchaseDate: -1, createdAt: -1 }).lean();
}

export async function createPurchaseOrder(
  input: CreatePurchaseInput,
  actor: AuthUser
) {
  return withTransaction(async (session) => {
    const supplier = await Supplier.findById(input.supplierId).session(session);
    if (!supplier) throw new NotFoundError('Supplier not found');

    const poNumber = await getNextSequence('purchase_order', 'PO-2026-', 4, session);
    const items = [];
    let subtotal = new Decimal(0);
    let taxTotal = new Decimal(0);

    for (const line of input.items) {
      const material = await Material.findById(line.materialId).session(session);
      if (!material) throw new NotFoundError(`Material ${line.materialId} not found`);

      const qty = roundQty(line.quantity);
      const lineSub = new Decimal(qty).mul(line.rate);
      const gstRate = line.gstRate ?? 0;
      const tax = lineSub.mul(gstRate).div(100);
      const total = lineSub.plus(tax);

      subtotal = subtotal.plus(lineSub);
      taxTotal = taxTotal.plus(tax);

      items.push({
        material: material._id,
        materialName: material.name,
        materialCode: material.code,
        quantity: qty,
        unit: material.unit,
        rate: roundMoney(line.rate),
        gstRate,
        taxAmount: roundMoney(tax),
        totalAmount: roundMoney(total),
      });
    }

    const grandTotal = roundMoney(subtotal.plus(taxTotal));
    const paidAmount = roundMoney(input.paidAmount || 0);
    const paymentStatus =
      paidAmount >= grandTotal && grandTotal > 0
        ? 'PAID'
        : paidAmount > 0
        ? 'PARTIAL'
        : input.paymentStatus || 'UNPAID';

    const [po] = await PurchaseOrder.create(
      [
        {
          poNumber,
          supplier: supplier._id,
          supplierName: supplier.name,
          purchaseDate: input.purchaseDate ? new Date(input.purchaseDate) : new Date(),
          items,
          subtotal: roundMoney(subtotal),
          taxTotal: roundMoney(taxTotal),
          grandTotal,
          receiptStatus: input.receiveImmediately ? 'RECEIVED' : 'PENDING',
          paymentStatus,
          paidAmount,
          receivedAt: input.receiveImmediately ? new Date() : undefined,
          notes: input.notes,
          createdBy: actor.id,
        },
      ],
      { session }
    );

    if (input.receiveImmediately) {
      for (const item of po.items) {
        await postStockMovement({
          date: po.purchaseDate,
          itemType: 'RAW_MATERIAL', // postStockMovement uses material.category internally
          itemId: String(item.material),
          movementType: 'PURCHASE_RECEIPT',
          direction: 'IN',
          quantity: item.quantity,
          unitCost: item.rate,
          sourceDocType: 'PURCHASE_ORDER',
          sourceDocId: String(po._id),
          sourceDocNumber: po.poNumber,
          userId: actor.id,
          userName: actor.name,
          notes: `Purchase receipt from ${supplier.name}`,
          session,
        });
      }
    }

    await recordAuditLog({
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: input.receiveImmediately ? 'CREATE_AND_RECEIVE_PO' : 'CREATE_PO',
      entityType: 'PURCHASE_ORDER',
      entityId: String(po._id),
      entityRef: po.poNumber,
      summary: `Created PO ${po.poNumber} for ${supplier.name} (₹${grandTotal})`,
      session,
    });

    return po.toObject();
  });
}

export async function receivePurchaseOrder(poId: string, actor: AuthUser) {
  return withTransaction(async (session) => {
    const po = await PurchaseOrder.findById(poId).session(session);
    if (!po) throw new NotFoundError('Purchase order not found');
    if (po.receiptStatus === 'RECEIVED') {
      throw new AppError('Purchase order has already been received', 409, 'ALREADY_RECEIVED');
    }
    if (po.receiptStatus === 'CANCELLED') {
      throw new AppError('Cannot receive a cancelled purchase order');
    }

    for (const item of po.items) {
      await postStockMovement({
        date: new Date(),
        itemType: 'RAW_MATERIAL',
        itemId: String(item.material),
        movementType: 'PURCHASE_RECEIPT',
        direction: 'IN',
        quantity: item.quantity,
        unitCost: item.rate,
        sourceDocType: 'PURCHASE_ORDER',
        sourceDocId: String(po._id),
        sourceDocNumber: po.poNumber,
        userId: actor.id,
        userName: actor.name,
        notes: `Goods received against ${po.poNumber} (${po.supplierName})`,
        session,
      });
    }

    po.receiptStatus = 'RECEIVED';
    po.receivedAt = new Date();
    await po.save({ session });

    await recordAuditLog({
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: 'RECEIVE_PO',
      entityType: 'PURCHASE_ORDER',
      entityId: String(po._id),
      entityRef: po.poNumber,
      summary: `Received stock for PO ${po.poNumber}`,
      session,
    });

    return po.toObject();
  });
}

export async function updatePurchasePayment(
  poId: string,
  paidAmount: number,
  actor: AuthUser
) {
  const po = await PurchaseOrder.findById(poId);
  if (!po) throw new NotFoundError('Purchase order not found');
  po.paidAmount = roundMoney(paidAmount);
  po.paymentStatus =
    po.paidAmount >= po.grandTotal
      ? 'PAID'
      : po.paidAmount > 0
      ? 'PARTIAL'
      : 'UNPAID';
  await po.save();

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'UPDATE_PO_PAYMENT',
    entityType: 'PURCHASE_ORDER',
    entityId: poId,
    entityRef: po.poNumber,
    summary: `Updated PO ${po.poNumber} payment to ₹${po.paidAmount} (${po.paymentStatus})`,
  });

  return po.toObject();
}
