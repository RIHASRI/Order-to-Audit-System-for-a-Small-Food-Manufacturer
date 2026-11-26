import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IBOMItem {
  material: Types.ObjectId;
  materialName: string;
  materialCode: string;
  quantity: number;
  unit: string;
  materialUnit: string; // canonical storage unit of the material
}

export interface IBOM extends Document {
  product: Types.ObjectId;
  productName: string;
  bomCode: string;
  version: number;
  isActive: boolean;
  batchSize: number;
  expectedOutput: number;
  outputUnit: string;
  rawMaterials: IBOMItem[];
  packagingMaterials: IBOMItem[];
  standardLabourCost: number;
  standardPowerCost: number;
  notes?: string;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const bomItemSchema = new Schema<IBOMItem>(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialName: { type: String, required: true },
    materialCode: { type: String, required: true },
    quantity: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    materialUnit: { type: String, required: true },
  },
  { _id: false }
);

const bomSchema = new Schema<IBOM>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    bomCode: { type: String, required: true, trim: true },
    version: { type: Number, required: true, default: 1 },
    isActive: { type: Boolean, default: true },
    batchSize: { type: Number, required: true, min: 0.01, default: 1 },
    expectedOutput: { type: Number, required: true, min: 1 },
    outputUnit: { type: String, required: true, default: 'packets' },
    rawMaterials: { type: [bomItemSchema], default: [] },
    packagingMaterials: { type: [bomItemSchema], default: [] },
    standardLabourCost: { type: Number, default: 0, min: 0 },
    standardPowerCost: { type: Number, default: 0, min: 0 },
    notes: { type: String, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

bomSchema.index({ product: 1, version: 1 }, { unique: true });

export const BOM = mongoose.model<IBOM>('BOM', bomSchema);
