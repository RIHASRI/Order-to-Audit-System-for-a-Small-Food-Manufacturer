import mongoose, { Schema, Document, Types } from 'mongoose';

export type PaymentMethod = 'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'NEFT' | 'RTGS';

export interface IPayment extends Document {
  paymentNumber: string;
  customer: Types.ObjectId;
  customerName: string;
  invoice: Types.ObjectId;
  invoiceNumber: string;
  paymentDate: Date;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionRef: string;
  notes?: string;
  recordedBy?: Types.ObjectId;
  recordedByName: string;
  createdAt: Date;
  updatedAt: Date;
}

const paymentSchema = new Schema<IPayment>(
  {
    paymentNumber: { type: String, required: true, unique: true },
    customer: { type: Schema.Types.ObjectId, ref: 'Customer', required: true },
    customerName: { type: String, required: true },
    invoice: { type: Schema.Types.ObjectId, ref: 'Invoice', required: true },
    invoiceNumber: { type: String, required: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMethod: {
      type: String,
      required: true,
      enum: ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'NEFT', 'RTGS'],
    },
    transactionRef: { type: String, required: true, trim: true },
    notes: { type: String, trim: true },
    recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    recordedByName: { type: String, required: true },
  },
  { timestamps: true }
);

paymentSchema.index({ paymentDate: -1 });
paymentSchema.index({ customer: 1 });
paymentSchema.index({ invoice: 1 });

export const Payment = mongoose.model<IPayment>('Payment', paymentSchema);
