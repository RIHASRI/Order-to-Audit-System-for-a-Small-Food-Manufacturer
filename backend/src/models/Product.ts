import mongoose, { Schema, Document } from 'mongoose';

export interface IProduct extends Document {
  name: string;
  sku: string;
  category: string;
  packSize: string;
  hsnCode: string;
  sellingPrice: number;
  gstRate: number;
  unit: string;
  reorderLevel: number;
  currentStock: number;
  weightedAvgCost: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const productSchema = new Schema<IProduct>(
  {
    name: { type: String, required: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    category: { type: String, required: true, trim: true, default: 'Savouries' },
    packSize: { type: String, required: true, trim: true },
    hsnCode: { type: String, required: true, trim: true },
    sellingPrice: { type: Number, required: true, min: 0 },
    gstRate: { type: Number, required: true, min: 0, max: 28, default: 5 },
    unit: { type: String, required: true, trim: true, default: 'packets' },
    reorderLevel: { type: Number, required: true, min: 0, default: 50 },
    currentStock: { type: Number, required: true, default: 0 },
    weightedAvgCost: { type: Number, required: true, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Product = mongoose.model<IProduct>('Product', productSchema);
