import { describe, it, expect } from 'vitest';
import { formatINR, formatNumber, ROLE_LABELS } from '../format';

describe('Frontend Formatting Utilities', () => {
  it('formats Indian Rupee amounts accurately', () => {
    expect(formatINR(7875)).toContain('7,875.00');
    expect(formatINR(3875.5)).toContain('3,875.50');
    expect(formatINR(null)).toContain('0.00');
  });

  it('formats numbers with Indian grouping and maps all 5 roles', () => {
    expect(formatNumber(125000, 0)).toBe('1,25,000');
    expect(Object.keys(ROLE_LABELS)).toHaveLength(5);
    expect(ROLE_LABELS.OWNER).toBe('Business Owner');
    expect(ROLE_LABELS.PRODUCTION_SUPERVISOR).toBe('Production Supervisor');
  });
});
