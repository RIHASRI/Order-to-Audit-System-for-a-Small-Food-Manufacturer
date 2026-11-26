import { SalesOrder, OrderStatus } from '../models/SalesOrder';
import { Customer } from '../models/Customer';
import { Product } from '../models/Product';
import { getNextSequence } from '../utils/sequence';
import { calculateGstLine } from '../utils/gst';
import { env } from '../config/env';
import { roundMoney } from '../utils/decimal';
import { AppError, ForbiddenError, NotFoundError } from '../utils/errors';
import { createNotification, recordAuditLog } from './auditService';
import { AuthUser } from '../middleware/auth';

export interface OrderLineInput {
  productId: string;
  quantity: number;
  unitPrice?: number;
}

export interface CreateOrderInput {
  customerId: string;
  orderDate?: string | Date;
  items: OrderLineInput[];
  status?: 'DRAFT' | 'SUBMITTED';
  notes?: string;
  offlineId?: string;
}

async function enrichOrderWithStockCheck<T extends Record<string, unknown>>(order: T) {
  const items = (order.items as Array<Record<string, unknown>>) || [];
  const productIds = items.map((i) => i.product);
  const products = await Product.find({ _id: { $in: productIds } })
    .select('currentStock unit name')
    .lean();
  const stockMap = new Map(products.map((p) => [String(p._id), p.currentStock]));

  const enrichedItems = items.map((item) => {
    const availableStock = stockMap.get(String(item.product)) ?? 0;
    const targetQty = Number(item.approvedQty || item.requestedQty || 0);
    const remainingToDispatch = Math.max(0, targetQty - Number(item.dispatchedQty || 0));
    const shortage = Math.max(0, remainingToDispatch - availableStock);
    return {
      ...item,
      availableStock,
      remainingToDispatch,
      shortage,
    };
  });

  const totalShortage = enrichedItems.reduce((s, i) => s + i.shortage, 0);
  return {
    ...order,
    items: enrichedItems,
    hasStockShortage: totalShortage > 0,
    totalShortage,
  };
}

export async function listSalesOrders(
  filters: {
    status?: string;
    customerId?: string;
    salesmanId?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
  },
  actor: AuthUser
) {
  const query: Record<string, unknown> = {};
  if (actor.role === 'SALESMAN') {
    query.salesman = actor.id;
  } else if (filters.salesmanId) {
    query.salesman = filters.salesmanId;
  }

  if (filters.status) query.status = filters.status;
  if (filters.customerId) query.customer = filters.customerId;
  if (filters.search) {
    query.$or = [
      { orderNumber: { $regex: filters.search, $options: 'i' } },
      { customerName: { $regex: filters.search, $options: 'i' } },
      { salesmanName: { $regex: filters.search, $options: 'i' } },
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
    query.orderDate = range;
  }

  const orders = await SalesOrder.find(query)
    .sort({ orderDate: -1, createdAt: -1 })
    .lean();

  return Promise.all(orders.map((o) => enrichOrderWithStockCheck(o as unknown as Record<string, unknown>)));
}

export async function getSalesOrderById(id: string, actor: AuthUser) {
  const order = await SalesOrder.findById(id).lean();
  if (!order) throw new NotFoundError('Sales order not found');
  if (actor.role === 'SALESMAN' && String(order.salesman) !== actor.id) {
    throw new ForbiddenError('Salesmen can only view their own orders');
  }
  return enrichOrderWithStockCheck(order as unknown as Record<string, unknown>);
}

export async function createSalesOrder(input: CreateOrderInput, actor: AuthUser) {
  // Idempotent offline sync support
  if (input.offlineId) {
    const existing = await SalesOrder.findOne({ offlineId: input.offlineId }).lean();
    if (existing) {
      return enrichOrderWithStockCheck(existing as unknown as Record<string, unknown>);
    }
  }

  const customer = await Customer.findById(input.customerId).lean();
  if (!customer) throw new NotFoundError('Customer not found');

  const items = [];
  let subtotal = 0;
  let taxTotal = 0;
  let grandTotal = 0;

  for (const line of input.items) {
    const product = await Product.findById(line.productId).lean();
    if (!product) throw new NotFoundError(`Product ${line.productId} not found`);

    const unitPrice = roundMoney(line.unitPrice ?? product.sellingPrice);
    const gst = calculateGstLine(
      { quantity: line.quantity, unitPrice, gstRate: product.gstRate },
      env.company.stateCode,
      customer.stateCode
    );
    const taxAmount = roundMoney(gst.cgstAmount + gst.sgstAmount + gst.igstAmount);

    subtotal = roundMoney(subtotal + gst.taxableValue);
    taxTotal = roundMoney(taxTotal + taxAmount);
    grandTotal = roundMoney(grandTotal + gst.lineTotal);

    items.push({
      product: product._id,
      productName: product.name,
      sku: product.sku,
      hsnCode: product.hsnCode,
      unit: product.unit,
      requestedQty: line.quantity,
      approvedQty: line.quantity,
      dispatchedQty: 0,
      unitPrice,
      gstRate: product.gstRate,
      taxableValue: gst.taxableValue,
      taxAmount,
      lineTotal: gst.lineTotal,
    });
  }

  const orderNumber = await getNextSequence('sales_order', 'SO-2026-', 4);
  const status: OrderStatus = input.status === 'DRAFT' ? 'DRAFT' : 'SUBMITTED';

  const order = await SalesOrder.create({
    orderNumber,
    customer: customer._id,
    customerName: customer.name,
    customerState: customer.state,
    customerStateCode: customer.stateCode,
    salesman: actor.id,
    salesmanName: actor.name,
    orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
    status,
    items,
    subtotal,
    taxTotal,
    grandTotal,
    notes: input.notes,
    offlineId: input.offlineId || undefined,
    syncedAt: input.offlineId ? new Date() : undefined,
  });

  if (status === 'SUBMITTED') {
    await createNotification({
      title: `New Sales Order ${order.orderNumber}`,
      message: `${actor.name} submitted order for ${customer.name} (₹${grandTotal}).`,
      severity: 'INFO',
      category: 'ORDER',
      targetRoles: ['OWNER', 'ADMIN'],
      link: '/orders',
    });
  }

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'CREATE_SALES_ORDER',
    entityType: 'SALES_ORDER',
    entityId: String(order._id),
    entityRef: order.orderNumber,
    summary: `Created order ${order.orderNumber} for ${customer.name} (₹${grandTotal}, status ${status})`,
  });

  return enrichOrderWithStockCheck(order.toObject() as unknown as Record<string, unknown>);
}

export async function reviewOrUpdateOrder(
  orderId: string,
  input: {
    status?: OrderStatus;
    items?: Array<{ productId: string; approvedQty: number; unitPrice: number }>;
    rejectionReason?: string;
    notes?: string;
  },
  actor: AuthUser
) {
  const order = await SalesOrder.findById(orderId);
  if (!order) throw new NotFoundError('Sales order not found');

  if (actor.role === 'SALESMAN') {
    if (String(order.salesman) !== actor.id) {
      throw new ForbiddenError('Cannot modify another salesman’s order');
    }
    if (!['DRAFT', 'SUBMITTED'].includes(order.status)) {
      throw new AppError('Only Draft or Submitted orders can be edited by salesman');
    }
  }

  const before = order.toObject() as unknown as Record<string, unknown>;

  if (input.items && input.items.length > 0) {
    if (['DISPATCHED', 'PARTIALLY_DISPATCHED'].includes(order.status)) {
      throw new AppError('Cannot edit quantities/prices after dispatch has started');
    }
    const updateMap = new Map(input.items.map((i) => [i.productId, i]));
    let subtotal = 0;
    let taxTotal = 0;
    let grandTotal = 0;

    for (const item of order.items) {
      const upd = updateMap.get(String(item.product));
      if (upd) {
        item.approvedQty = upd.approvedQty;
        item.unitPrice = roundMoney(upd.unitPrice);
      }
      const gst = calculateGstLine(
        { quantity: item.approvedQty, unitPrice: item.unitPrice, gstRate: item.gstRate },
        env.company.stateCode,
        order.customerStateCode
      );
      item.taxableValue = gst.taxableValue;
      item.taxAmount = roundMoney(gst.cgstAmount + gst.sgstAmount + gst.igstAmount);
      item.lineTotal = gst.lineTotal;

      subtotal = roundMoney(subtotal + gst.taxableValue);
      taxTotal = roundMoney(taxTotal + item.taxAmount);
      grandTotal = roundMoney(grandTotal + gst.lineTotal);
    }
    order.subtotal = subtotal;
    order.taxTotal = taxTotal;
    order.grandTotal = grandTotal;
  }

  if (input.status) {
    if (input.status === 'REJECTED' && !input.rejectionReason) {
      throw new AppError('Rejection reason is required when rejecting an order');
    }
    order.status = input.status;
    if (input.status === 'APPROVED') {
      order.approvedBy = actor.id as unknown as typeof order.approvedBy;
      order.approvedAt = new Date();
    }
    if (input.rejectionReason) {
      order.rejectionReason = input.rejectionReason;
    }
  }

  if (input.notes !== undefined) order.notes = input.notes;
  await order.save();

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'UPDATE_SALES_ORDER',
    entityType: 'SALES_ORDER',
    entityId: orderId,
    entityRef: order.orderNumber,
    summary: `Updated order ${order.orderNumber} -> status: ${order.status}`,
    beforeData: { status: before.status, grandTotal: before.grandTotal },
    afterData: { status: order.status, grandTotal: order.grandTotal },
  });

  return enrichOrderWithStockCheck(order.toObject() as unknown as Record<string, unknown>);
}
