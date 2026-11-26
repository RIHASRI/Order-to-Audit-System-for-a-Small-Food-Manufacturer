import { Dispatch } from '../models/Dispatch';
import { SalesOrder } from '../models/SalesOrder';
import { Invoice } from '../models/Invoice';
import { Product } from '../models/Product';
import { withTransaction } from '../config/db';
import { getNextSequence } from '../utils/sequence';
import { AppError, NotFoundError } from '../utils/errors';
import { postStockMovement } from './inventoryService';
import { recordAuditLog } from './auditService';
import { AuthUser } from '../middleware/auth';

export interface CreateDispatchInput {
  salesOrderId: string;
  invoiceId?: string;
  dispatchDate?: string | Date;
  items: Array<{ productId: string; quantity: number }>;
  vehicleNumber?: string;
  notes?: string;
  idempotencyKey?: string;
}

export async function listDispatches(filters: {
  customerId?: string;
  deliveryStatus?: string;
  search?: string;
}) {
  const query: Record<string, unknown> = {};
  if (filters.customerId) query.customer = filters.customerId;
  if (filters.deliveryStatus) query.deliveryStatus = filters.deliveryStatus;
  if (filters.search) {
    query.$or = [
      { dispatchNumber: { $regex: filters.search, $options: 'i' } },
      { salesOrderNumber: { $regex: filters.search, $options: 'i' } },
      { invoiceNumber: { $regex: filters.search, $options: 'i' } },
      { customerName: { $regex: filters.search, $options: 'i' } },
    ];
  }
  return Dispatch.find(query).sort({ dispatchDate: -1, createdAt: -1 }).lean();
}

/**
 * Confirms dispatch atomically:
 * - Prevents duplicate dispatch using idempotencyKey & remaining order quantities
 * - Blocks dispatch beyond available finished goods stock
 * - Deducts finished goods inventory via StockLedger
 * - Updates SalesOrder dispatchedQty & status (PARTIALLY_DISPATCHED / DISPATCHED)
 */
export async function createDispatch(
  input: CreateDispatchInput,
  actor: AuthUser
) {
  if (input.idempotencyKey) {
    const existing = await Dispatch.findOne({
      idempotencyKey: input.idempotencyKey,
    }).lean();
    if (existing) return existing;
  }

  return withTransaction(async (session) => {
    const order = await SalesOrder.findById(input.salesOrderId).session(session);
    if (!order) throw new NotFoundError('Sales order not found');

    if (!['APPROVED', 'PARTIALLY_DISPATCHED'].includes(order.status)) {
      throw new AppError(
        `Order ${order.orderNumber} must be APPROVED before dispatch (current status: ${order.status})`
      );
    }

    let invoiceDoc = null;
    if (input.invoiceId) {
      invoiceDoc = await Invoice.findById(input.invoiceId).session(session);
      if (!invoiceDoc) throw new NotFoundError('Linked invoice not found');
    }

    const dispatchNumber = await getNextSequence('dispatch', 'DISP-2026-', 4, session);
    const dispatchItems = [];
    let totalDispatchedQty = 0;

    for (const line of input.items) {
      if (line.quantity <= 0) continue;

      const orderItem = order.items.find(
        (i) => String(i.product) === line.productId
      );
      if (!orderItem) {
        throw new AppError(`Product ${line.productId} is not part of order ${order.orderNumber}`);
      }

      const remainingAllowed = orderItem.approvedQty - orderItem.dispatchedQty;
      if (line.quantity > remainingAllowed) {
        throw new AppError(
          `Cannot dispatch ${line.quantity} of ${orderItem.productName}. Remaining approved qty is ${remainingAllowed}`,
          400,
          'OVER_DISPATCH'
        );
      }

      const product = await Product.findById(line.productId).session(session);
      if (!product) throw new NotFoundError('Product not found');

      if (line.quantity > product.currentStock) {
        throw new AppError(
          `Insufficient finished goods stock for ${product.name}. Available: ${product.currentStock}, Requested dispatch: ${line.quantity} (Shortage: ${line.quantity - product.currentStock})`,
          400,
          'INSUFFICIENT_STOCK'
        );
      }

      await postStockMovement({
        date: input.dispatchDate ? new Date(input.dispatchDate) : new Date(),
        itemType: 'FINISHED_GOOD',
        itemId: String(product._id),
        movementType: 'SALES_DISPATCH',
        direction: 'OUT',
        quantity: line.quantity,
        sourceDocType: 'DISPATCH',
        sourceDocNumber: dispatchNumber,
        userId: actor.id,
        userName: actor.name,
        notes: `Dispatched to ${order.customerName} (${order.orderNumber})`,
        session,
      });

      orderItem.dispatchedQty += line.quantity;
      totalDispatchedQty += line.quantity;

      dispatchItems.push({
        product: product._id,
        productName: product.name,
        sku: product.sku,
        quantity: line.quantity,
        unit: product.unit,
      });
    }

    if (dispatchItems.length === 0) {
      throw new AppError('At least one dispatch line item with quantity > 0 is required');
    }

    const allDispatched = order.items.every(
      (i) => i.dispatchedQty >= i.approvedQty
    );
    order.status = allDispatched ? 'DISPATCHED' : 'PARTIALLY_DISPATCHED';
    await order.save({ session });

    const [dispatch] = await Dispatch.create(
      [
        {
          dispatchNumber,
          salesOrder: order._id,
          salesOrderNumber: order.orderNumber,
          invoice: invoiceDoc?._id,
          invoiceNumber: invoiceDoc?.invoiceNumber,
          customer: order.customer,
          customerName: order.customerName,
          dispatchDate: input.dispatchDate
            ? new Date(input.dispatchDate)
            : new Date(),
          items: dispatchItems,
          totalDispatchedQty,
          deliveryStatus: 'DISPATCHED',
          idempotencyKey: input.idempotencyKey || undefined,
          vehicleNumber: input.vehicleNumber,
          notes: input.notes,
          confirmedBy: actor.id,
          confirmedByName: actor.name,
        },
      ],
      { session }
    );

    await recordAuditLog({
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: 'CREATE_DISPATCH',
      entityType: 'DISPATCH',
      entityId: String(dispatch._id),
      entityRef: dispatchNumber,
      summary: `Confirmed dispatch ${dispatchNumber} for ${order.orderNumber} (${totalDispatchedQty} units, order status -> ${order.status})`,
      session,
    });

    return dispatch.toObject();
  });
}

export async function updateDeliveryStatus(
  dispatchId: string,
  deliveryStatus: 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED',
  actor: AuthUser
) {
  const dispatch = await Dispatch.findById(dispatchId);
  if (!dispatch) throw new NotFoundError('Dispatch not found');
  dispatch.deliveryStatus = deliveryStatus;
  await dispatch.save();

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'UPDATE_DISPATCH_STATUS',
    entityType: 'DISPATCH',
    entityId: dispatchId,
    entityRef: dispatch.dispatchNumber,
    summary: `Updated delivery status of ${dispatch.dispatchNumber} to ${deliveryStatus}`,
  });

  return dispatch.toObject();
}
