import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IDispatchItem {
  product: Types.ObjectId;
  productName: string;
  sku: string;
  quantity: number;
  unit: string;
}

export interface IDispatch extends Document {
  dispatchNumber: string;
  salesOrder: Types.ObjectId;
  salesOrderNumber: string;
  invoice?: Types.ObjectId;
  invoiceNumber?: string;
  customer: Types.ObjectId;
  customerName: string;
  dispatchDate: Date;
  items: IDispatchItem[];
  totalDispatchedQty: number;
  deliveryStatus: 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED';
  idempotencyKey?: string;
  vehicleNumber?: string;
  notes?: string;
  confirmedBy?: Types.ObjectId;
  confirmedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const dispatchItemSchema = new Schema<IDispatchItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unit: { type: String, required: true },
  },
  { _id: false }
);

const dispatchSchema = new Schema<IDispatch>(
  {
    dispatchNumber: { type: String, required: true, unique: true },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder', required: true },
    salesOrderNumber: { type: String, required: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    invoiceNumber: { type: String },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: { type: String, required: true },
    dispatchDate: { type: Date, required: true, default: Date.now },
    items: { type: [dispatchItemSchema], required: true },
    totalDispatchedQty: { type: Number, required: true, min: 1 },
    deliveryStatus: {
      type: String,
      enum: ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED'],
      default: 'DISPATCHED',
    },
    idempotencyKey: { type: String, sparse: true, unique: true },
    vehicleNumber: { type: String, trim: true },
    notes: { type: String, trim: true },
    confirmedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    confirmedByName: { type: String, required: true },
  },
  { timestamps: true }
);

dispatchSchema.index({ dispatchDate: -1 });
dispatchSchema.index({ salesOrder: 1 });

export const Dispatch = mongoose.model<IDispatch>('Dispatch', dispatchSchema);
