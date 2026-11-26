import mongoose, { Schema, Document, Types } from 'mongoose';

export interface INotification extends Document {
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  category: 'STOCK' | 'PRODUCTION' | 'ORDER' | 'PAYMENT';
  targetRoles: string[];
  readBy: Types.ObjectId[];
  link?: string;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    title: { type: String, required: true },
    message: { type: String, required: true },
    severity: {
      type: String,
      enum: ['INFO', 'WARNING', 'CRITICAL'],
      default: 'INFO',
    },
    category: {
      type: String,
      enum: ['STOCK', 'PRODUCTION', 'ORDER', 'PAYMENT'],
      required: true,
    },
    targetRoles: { type: [String], default: ['OWNER', 'ADMIN'] },
    readBy: { type: [Schema.Types.ObjectId], default: [] },
    link: { type: String },
  },
  { timestamps: true }
);

notificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model<INotification>(
  'Notification',
  notificationSchema
);
