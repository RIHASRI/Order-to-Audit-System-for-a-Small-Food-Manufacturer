import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IInvoiceItem {
  product: Types.ObjectId;
  productName: string;
  sku: string;
  hsnCode: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxableValue: number;
  gstRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

export interface IInvoice extends Document {
  invoiceNumber: string;
  financialYear: string;
  invoiceDate: Date;
  sellerDetails: {
    name: string;
    gstin: string;
    address: string;
    state: string;
    stateCode: string;
    phone: string;
    email: string;
  };
  customer: Types.ObjectId;
  customerSnapshot: {
    name: string;
    gstin: string;
    address: string;
    state: string;
    stateCode: string;
    phone: string;
  };
  salesOrder?: Types.ObjectId;
  salesOrderNumber?: string;
  placeOfSupply: string;
  isInterState: boolean;
  items: IInvoiceItem[];
  taxableValue: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
  paidAmount: number;
  status: 'ACTIVE' | 'CANCELLED' | 'CREDIT_NOTE';
  linkedInvoiceId?: Types.ObjectId;
  cancellationReason?: string;
  creditNoteReason?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const invoiceItemSchema = new Schema<IInvoiceItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    sku: { type: String, required: true },
    hsnCode: { type: String, required: true },
    unit: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    taxableValue: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true, min: 0 },
    cgstRate: { type: Number, required: true, default: 0 },
    sgstRate: { type: Number, required: true, default: 0 },
    igstRate: { type: Number, required: true, default: 0 },
    cgstAmount: { type: Number, required: true, default: 0 },
    sgstAmount: { type: Number, required: true, default: 0 },
    igstAmount: { type: Number, required: true, default: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const invoiceSchema = new Schema<IInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    financialYear: { type: String, required: true },
    invoiceDate: { type: Date, required: true, default: Date.now },
    sellerDetails: {
      name: { type: String, required: true },
      gstin: { type: String, required: true },
      address: { type: String, required: true },
      state: { type: String, required: true },
      stateCode: { type: String, required: true },
      phone: { type: String, required: true },
      email: { type: String, required: true },
    },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerSnapshot: {
      name: { type: String, required: true },
      gstin: { type: String, default: '' },
      address: { type: String, required: true },
      state: { type: String, required: true },
      stateCode: { type: String, required: true },
      phone: { type: String, required: true },
    },
    salesOrder: { type: Schema.Types.ObjectId, ref: 'SalesOrder' },
    salesOrderNumber: { type: String },
    placeOfSupply: { type: String, required: true },
    isInterState: { type: Boolean, required: true, default: false },
    items: { type: [invoiceItemSchema], required: true },
    taxableValue: { type: Number, required: true, min: 0 },
    cgstTotal: { type: Number, required: true, default: 0 },
    sgstTotal: { type: Number, required: true, default: 0 },
    igstTotal: { type: Number, required: true, default: 0 },
    grandTotal: { type: Number, required: true, min: 0 },
    paidAmount: { type: Number, required: true, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['ACTIVE', 'CANCELLED', 'CREDIT_NOTE'],
      default: 'ACTIVE',
    },
    linkedInvoiceId: { type: Schema.Types.ObjectId, ref: 'Invoice' },
    cancellationReason: { type: String, trim: true },
    creditNoteReason: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

invoiceSchema.index({ invoiceDate: -1 });
invoiceSchema.index({ customer: 1, invoiceDate: -1 });

export const Invoice = mongoose.model<IInvoice>('Invoice', invoiceSchema);
