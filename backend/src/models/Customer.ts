import mongoose, { Schema, Document } from 'mongoose';

export type CustomerType = 'RETAILER' | 'DISTRIBUTOR';

export interface ICustomer extends Document {
  name: string;
  customerType: CustomerType;
  gstin: string;
  address: string;
  state: string;
  stateCode: string;
  contactPerson: string;
  phone: string;
  email?: string;
  creditLimit: number;
  paymentTerms: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const customerSchema = new Schema<ICustomer>(
  {
    name: { type: String, required: true, trim: true },
    customerType: {
      type: String,
      required: true,
      enum: ['RETAILER', 'DISTRIBUTOR'],
      default: 'RETAILER',
    },
    gstin: { type: String, trim: true, uppercase: true, default: '' },
    address: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    stateCode: { type: String, required: true, trim: true },
    contactPerson: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    email: { type: String, trim: true, lowercase: true },
    creditLimit: { type: Number, required: true, min: 0, default: 50000 },
    paymentTerms: { type: String, required: true, trim: true, default: 'Net 15 Days' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Customer = mongoose.model<ICustomer>('Customer', customerSchema);
