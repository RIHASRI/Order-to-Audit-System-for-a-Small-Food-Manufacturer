import mongoose, { Schema, Document, Types } from 'mongoose';

export type StockItemType = 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_GOOD' | 'WIP';

export type MovementType =
  | 'OPENING_STOCK'
  | 'PURCHASE_RECEIPT'
  | 'PRODUCTION_ISSUE'
  | 'PRODUCTION_RECEIPT'
  | 'SALES_DISPATCH'
  | 'CUSTOMER_RETURN'
  | 'DAMAGE'
  | 'ADJUSTMENT'
  | 'REVERSAL';

export interface IStockLedger extends Document {
  date: Date;
  itemType: StockItemType;
  itemId: Types.ObjectId;
  itemModel: 'Material' | 'Product';
  itemName: string;
  itemCode: string;
  movementType: MovementType;
  direction: 'IN' | 'OUT';
  quantity: number;
  signedQuantity: number;
  unit: string;
  unitCost: number;
  totalValue: number;
  sourceDocType: string;
  sourceDocId?: Types.ObjectId;
  sourceDocNumber: string;
  userId?: Types.ObjectId;
  userName: string;
  previousBalance: number;
  newBalance: number;
  notes?: string;
  createdAt: Date;
}

const stockLedgerSchema = new Schema<IStockLedger>(
  {
    date: { type: Date, required: true, default: Date.now },
    itemType: {
      type: String,
      required: true,
      enum: ['RAW_MATERIAL', 'PACKAGING', 'FINISHED_GOOD', 'WIP'],
    },
    itemId: { type: Schema.Types.ObjectId, required: true, refPath: 'itemModel' },
    itemModel: { type: String, required: true, enum: ['Material', 'Product'] },
    itemName: { type: String, required: true },
    itemCode: { type: String, required: true },
    movementType: {
      type: String,
      required: true,
      enum: [
        'OPENING_STOCK',
        'PURCHASE_RECEIPT',
        'PRODUCTION_ISSUE',
        'PRODUCTION_RECEIPT',
        'SALES_DISPATCH',
        'CUSTOMER_RETURN',
        'DAMAGE',
        'ADJUSTMENT',
        'REVERSAL',
      ],
    },
    direction: { type: String, required: true, enum: ['IN', 'OUT'] },
    quantity: { type: Number, required: true, min: 0 },
    signedQuantity: { type: Number, required: true },
    unit: { type: String, required: true },
    unitCost: { type: Number, required: true, min: 0 },
    totalValue: { type: Number, required: true, min: 0 },
    sourceDocType: { type: String, required: true },
    sourceDocId: { type: Schema.Types.ObjectId },
    sourceDocNumber: { type: String, required: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, required: true },
    previousBalance: { type: Number, required: true },
    newBalance: { type: Number, required: true },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

stockLedgerSchema.index({ date: -1, createdAt: -1 });
stockLedgerSchema.index({ itemId: 1, date: -1 });
stockLedgerSchema.index({ sourceDocNumber: 1 });

export const StockLedger = mongoose.model<IStockLedger>('StockLedger', stockLedgerSchema);
