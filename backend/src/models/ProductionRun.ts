import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IProductionMaterialLine {
  material: Types.ObjectId;
  materialName: string;
  materialCode: string;
  category: 'RAW_MATERIAL' | 'PACKAGING';
  plannedQty: number;
  actualQty: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  varianceQty: number;
  variancePct: number;
  isAlert: boolean; // flagged when |variancePct| > 3
}

export interface IProductionRun extends Document {
  productionNumber: string;
  product: Types.ObjectId;
  productName: string;
  bom: Types.ObjectId;
  bomVersion: number;
  bomSnapshot: Record<string, unknown>;
  productionDate: Date;
  batchSize: number;
  materials: IProductionMaterialLine[];
  expectedOutput: number;
  actualGoodOutput: number;
  damagedQuantity: number;
  damagedPouches: number;
  cartonsUsed: number;
  wastageQty: number;
  wastageNotes?: string;
  labourCost: number;
  powerCost: number;
  otherOverheads: number;
  yieldVariancePct: number;
  hasVarianceAlert: boolean;
  materialCost: number;
  packagingCost: number;
  totalProductionCost: number;
  costPerPacket: number;
  supervisor?: Types.ObjectId;
  supervisorName: string;
  status: 'DRAFT' | 'POSTED';
  postedAt?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const productionMaterialLineSchema = new Schema<IProductionMaterialLine>(
  {
    material: { type: Schema.Types.ObjectId, ref: 'Material', required: true },
    materialName: { type: String, required: true },
    materialCode: { type: String, required: true },
    category: { type: String, enum: ['RAW_MATERIAL', 'PACKAGING'], required: true },
    plannedQty: { type: Number, required: true, min: 0 },
    actualQty: { type: Number, required: true, min: 0 },
    unit: { type: String, required: true },
    unitCost: { type: Number, required: true, min: 0 },
    totalCost: { type: Number, required: true, min: 0 },
    varianceQty: { type: Number, required: true },
    variancePct: { type: Number, required: true },
    isAlert: { type: Boolean, default: false },
  },
  { _id: false }
);

const productionRunSchema = new Schema<IProductionRun>(
  {
    productionNumber: { type: String, required: true, unique: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    productName: { type: String, required: true },
    bom: { type: Schema.Types.ObjectId, ref: 'BOM', required: true },
    bomVersion: { type: Number, required: true },
    bomSnapshot: { type: Schema.Types.Mixed, required: true },
    productionDate: { type: Date, required: true, default: Date.now },
    batchSize: { type: Number, required: true, min: 0.01 },
    materials: { type: [productionMaterialLineSchema], default: [] },
    expectedOutput: { type: Number, required: true, min: 1 },
    actualGoodOutput: { type: Number, required: true, min: 0 },
    damagedQuantity: { type: Number, default: 0, min: 0 },
    damagedPouches: { type: Number, default: 0, min: 0 },
    cartonsUsed: { type: Number, default: 0, min: 0 },
    wastageQty: { type: Number, default: 0, min: 0 },
    wastageNotes: { type: String, trim: true },
    labourCost: { type: Number, required: true, min: 0, default: 0 },
    powerCost: { type: Number, required: true, min: 0, default: 0 },
    otherOverheads: { type: Number, required: true, min: 0, default: 0 },
    yieldVariancePct: { type: Number, required: true, default: 0 },
    hasVarianceAlert: { type: Boolean, default: false },
    materialCost: { type: Number, required: true, default: 0 },
    packagingCost: { type: Number, required: true, default: 0 },
    totalProductionCost: { type: Number, required: true, default: 0 },
    costPerPacket: { type: Number, required: true, default: 0 },
    supervisor: { type: Schema.Types.ObjectId, ref: 'User' },
    supervisorName: { type: String, required: true },
    status: { type: String, enum: ['DRAFT', 'POSTED'], default: 'POSTED' },
    postedAt: { type: Date },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

productionRunSchema.index({ productionDate: -1 });
productionRunSchema.index({ product: 1, productionDate: -1 });

export const ProductionRun = mongoose.model<IProductionRun>(
  'ProductionRun',
  productionRunSchema
);
