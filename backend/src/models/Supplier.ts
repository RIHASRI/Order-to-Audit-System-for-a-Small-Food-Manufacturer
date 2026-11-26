import mongoose, { Schema, Document } from 'mongoose';

export interface ISupplier extends Document {
  name: string;
  gstin: string;
  address: string;
  state: string;
  stateCode: string;
  contactPerson: string;
  phone: string;
  email?: string;
  paymentTerms: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const supplierSchema = new Schema<ISupplier>(
  {
    name: { type: String, required: true, trim: true },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    address: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true, default: 'Tamil Nadu' },
    stateCode: { type: String, required: true, trim: true, default: '33' },
    contactPerson: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    paymentTerms: { type: String, required: true, trim: true, default: 'Net 30 Days' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Supplier = mongoose.model<ISupplier>('Supplier', supplierSchema);
