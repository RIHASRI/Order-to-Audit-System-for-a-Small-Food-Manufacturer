import mongoose, { Schema, Document } from 'mongoose';

export type UserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'SALESMAN'
  | 'PRODUCTION_SUPERVISOR'
  | 'ACCOUNTANT';

export interface IUser extends Document {
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  phone?: string;
  isActive: boolean;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      required: true,
      enum: ['OWNER', 'ADMIN', 'SALESMAN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
    },
    phone: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
    lastLoginAt: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', userSchema);
