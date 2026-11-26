import dayjs from 'dayjs';
import { UserRole } from '../types';

export function formatINR(amount: number | undefined | null): string {
  const num = Number(amount ?? 0);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatNumber(val: number | undefined | null, decimals = 2): string {
  const num = Number(val ?? 0);
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
  }).format(num);
}

export function formatDate(date: string | Date | undefined): string {
  if (!date) return '-';
  return dayjs(date).format('DD MMM YYYY');
}

export function formatDateTime(date: string | Date | undefined): string {
  if (!date) return '-';
  return dayjs(date).format('DD MMM YYYY, hh:mm A');
}

export const ROLE_LABELS: Record<UserRole, string> = {
  OWNER: 'Business Owner',
  ADMIN: 'Operations Admin',
  SALESMAN: 'Field Salesman',
  PRODUCTION_SUPERVISOR: 'Production Supervisor',
  ACCOUNTANT: 'Audit & Accountant',
};
