import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPurchaseOrderItem {
  material: Types.ObjectId;
  materialName: string;
  materialCode: string;
  quantity: number;
  unit: string;
  rate: number;
  gstRate: number;
  taxAmount: number;
  totalAmount: number;
}

export interface IPurchaseOrder extends Document {
  poNumber: string;
  supplier: Types.ObjectId;
  supplierName: string;
  purchaseDate: Date;
  items: IPurchaseOrderItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  receiptStatus: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  paidAmount: number;
  receivedAt?: Date;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const poItemSchema = new Schema<IPurchaseOrderItem>(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialName: { type: String, required: true },
    materialCode: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0.0001 },
    unit: { type: String, required: true },
    rate: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, default: 0, min: 0 },
    taxAmount: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const purchaseOrderSchema = new Schema<IPurchaseOrder>(
  {
    poNumber: { type: String, required: true, unique: true },
    supplier: { type: Schema.Types.ObjectId, ref: 'Supplier', required: true },
    supplierName: { type: String, required: true },
    purchaseDate: { type: Date, required: true, default: Date.now },
    items: { type: [poItemSchema], required: true },
    subtotal: { type: Number, required: true, min: 0 },
    taxTotal: { type: Number, required: true, min: 0, default: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    receiptStatus: {
      type: String,
      enum: ['PENDING', 'RECEIVED', 'CANCELLED'],
      default: 'PENDING',
    },
    paymentStatus: {
      type: String,
      enum: ['UNPAID', 'PARTIAL', 'PAID'],
      default: 'UNPAID',
    },
    paidAmount: { type: Number, default: 0, min: 0 },
    receivedAt: { type: Date },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

purchaseOrderSchema.index({ purchaseDate: -1 });

export const PurchaseOrder = mongoose.model<IPurchaseOrder>(
  'PurchaseOrder',
  purchaseOrderSchema
);
