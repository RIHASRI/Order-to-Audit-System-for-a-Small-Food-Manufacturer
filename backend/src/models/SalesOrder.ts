import mongoose, { Schema, Document, Types } from 'mongoose';

export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PARTIALLY_DISPATCHED'
  | 'DISPATCHED'
  | 'CANCELLED';

export interface ISalesOrderItem {
  product: Types.ObjectId;
  productName: string;
  sku: string;
  hsnCode: string;
  unit: string;
  requestedQty: number;
  approvedQty: number;
  dispatchedQty: number;
  unitPrice: number;
  gstRate: number;
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
}

export interface ISalesOrder extends Document {
  orderNumber: string;
  customer: Types.ObjectId;
  customerName: string;
  customerState: string;
  customerStateCode: string;
  salesman?: Types.ObjectId;
  salesmanName: string;
  orderDate: Date;
  status: OrderStatus;
  items: ISalesOrderItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  rejectionReason?: string;
  notes?: string;
  offlineId?: string;
  syncedAt?: Date;
  approvedBy?: Types.ObjectId;
  approvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const salesOrderItemSchema = new Schema<ISalesOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    hsnCode: { type: String, required: true },
    unit: { type: String, required: true },
    requestedQty: { type: Number, required: true, min: 1 },
    approvedQty: { type: Number, required: true, min: 0 },
    dispatchedQty: { type: Number, required: true, default: 0, min: 0 },
    unitPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true, min: 0 },
    taxableValue: { type: Number, required: true, min: 0 },
    taxAmount: { type: Number, required: true, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const salesOrderSchema = new Schema<ISalesOrder>(
  {
    orderNumber: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: { type: String, required: true },
    customerState: { type: String, required: true },
    customerStateCode: { type: String, required: true },
    salesman: { type: Schema.Types.ObjectId, ref: 'User' },
    salesmanName: { type: String, required: true },
    orderDate: { type: Date, required: true, default: Date.now },
    status: {
      type: String,
      required: true,
      enum: [
        'DRAFT',
        'SUBMITTED',
        'UNDER_REVIEW',
        'APPROVED',
        'REJECTED',
        'PARTIALLY_DISPATCHED',
        'DISPATCHED',
        'CANCELLED',
      ],
      default: 'SUBMITTED',
    },
    items: { type: [salesOrderItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, required: true, min: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    rejectionReason: { type: String, trim: true },
    notes: { type: String, trim: true },
    offlineId: { type: String, sparse: true, unique: true },
    syncedAt: { type: Date },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
  },
  { timestamps: true }
);

salesOrderSchema.index({ orderDate: -1 });
salesOrderSchema.index({ customer: 1, orderDate: -1 });
salesOrderSchema.index({ salesman: 1, orderDate: -1 });

export const SalesOrder = mongoose.model<ISalesOrder>('SalesOrder', salesOrderSchema);
