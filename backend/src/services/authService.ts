import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../models/User';
import { env } from '../config/env';
import { UnauthorizedError, ConflictError } from '../utils/errors';
import { recordAuditLog } from './auditService';

export async function loginUser(email: string, password: string, ipAddress?: string) {
  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user || !user.isActive) {
    throw new UnauthorizedError('Invalid email or password');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    throw new UnauthorizedError('Invalid email or password');
  }

  user.lastLoginAt = new Date();
  await user.save();

  const token = jwt.sign(
    {
      sub: String(user._id),
      email: user.email,
      role: user.role,
      name: user.name,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] }
  );

  await recordAuditLog({
    userId: String(user._id),
    userName: user.name,
    userRole: user.role,
    action: 'LOGIN',
    entityType: 'USER',
    entityId: String(user._id),
    entityRef: user.email,
    summary: `${user.name} (${user.role}) logged in`,
    ipAddress,
  });

  return {
    token,
    user: {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone,
    },
  };
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  phone?: string;
}) {
  const existing = await User.findOne({ email: input.email.toLowerCase().trim() });
  if (existing) {
    throw new ConflictError('A user with this email already exists');
  }
  const passwordHash = await bcrypt.hash(input.password, 10);
  const user = await User.create({
    name: input.name,
    email: input.email.toLowerCase().trim(),
    passwordHash,
    role: input.role,
    phone: input.phone,
  });
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    phone: user.phone,
    isActive: user.isActive,
  };
}
