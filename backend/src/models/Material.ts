import mongoose, { Schema, Document } from 'mongoose';

export type MaterialCategory = 'RAW_MATERIAL' | 'PACKAGING';

export interface IMaterial extends Document {
  name: string;
  code: string;
  category: MaterialCategory;
  subCategory: string;
  unit: string;
  reorderLevel: number;
  currentStock: number;
  weightedAvgRate: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const materialSchema = new Schema<IMaterial>(
  {
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['RAW_MATERIAL', 'PACKAGING'],
    },
    subCategory: { type: String, required: true, trim: true },
    unit: { type: String, required: true, trim: true },
    reorderLevel: { type: Number, required: true, min: 0, default: 10 },
    currentStock: { type: Number, required: true, default: 0 },
    weightedAvgRate: { type: Number, required: true, min: 0, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Material = mongoose.model<IMaterial>('Material', materialSchema);
