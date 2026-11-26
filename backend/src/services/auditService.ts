import mongoose from 'mongoose';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';

export interface AuditEntryInput {
  userId?: string;
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
  session?: mongoose.ClientSession;
}

export async function recordAuditLog(input: AuditEntryInput): Promise<void> {
  await AuditLog.create(
    [
      {
        timestamp: new Date(),
        userId: input.userId,
        userName: input.userName,
        userRole: input.userRole,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        entityRef: input.entityRef,
        summary: input.summary,
        beforeData: input.beforeData,
        afterData: input.afterData,
        ipAddress: input.ipAddress,
      },
    ],
    input.session ? { session: input.session } : undefined
  );
}

export async function createNotification(input: {
  title: string;
  message: string;
  severity?: 'INFO' | 'WARNING' | 'CRITICAL';
  category: 'STOCK' | 'PRODUCTION' | 'ORDER' | 'PAYMENT';
  targetRoles?: string[];
  link?: string;
  session?: mongoose.ClientSession;
}): Promise<void> {
  await Notification.create(
    [
      {
        title: input.title,
        message: input.message,
        severity: input.severity || 'INFO',
        category: input.category,
        targetRoles: input.targetRoles || ['OWNER', 'ADMIN'],
        link: input.link,
      },
    ],
    input.session ? { session: input.session } : undefined
  );
}
