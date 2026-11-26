import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IAuditLog extends Document {
  timestamp: Date;
  userId?: Types.ObjectId;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityId?: string;
  entityRef?: string;
  summary: string;
  beforeData?: Record<string, unknown>;
  afterData?: Record<string, unknown>;
  ipAddress?: string;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    timestamp: { type: Date, required: true, default: Date.now },
    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String, required: true },
    userRole: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String },
    entityRef: { type: String },
    summary: { type: String, required: true },
    beforeData: { type: Schema.Types.Mixed },
    afterData: { type: Schema.Types.Mixed },
    ipAddress: { type: String },
  },
  { timestamps: false }
);

auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ entityType: 1, timestamp: -1 });

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
