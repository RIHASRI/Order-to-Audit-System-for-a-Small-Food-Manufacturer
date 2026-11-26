import { describe, it, expect } from 'vitest';
import { normalizeApiBaseUrl } from '../api';

describe('normalizeApiBaseUrl', () => {
  it('defaults to /api when undefined or empty string', () => {
    expect(normalizeApiBaseUrl()).toBe('/api');
    expect(normalizeApiBaseUrl('')).toBe('/api');
    expect(normalizeApiBaseUrl('   ')).toBe('/api');
  });

  it('appends /api when missing from domain', () => {
    expect(
      normalizeApiBaseUrl('https://order-to-audit-system-for-a-small-food.onrender.com')
    ).toBe('https://order-to-audit-system-for-a-small-food.onrender.com/api');

    expect(
      normalizeApiBaseUrl('https://order-to-audit-system-for-a-small-food.onrender.com/')
    ).toBe('https://order-to-audit-system-for-a-small-food.onrender.com/api');

    expect(normalizeApiBaseUrl('http://localhost:5000')).toBe('http://localhost:5000/api');
    expect(normalizeApiBaseUrl('http://localhost:5000/')).toBe('http://localhost:5000/api');
  });

  it('preserves existing /api without duplication', () => {
    expect(
      normalizeApiBaseUrl('https://order-to-audit-system-for-a-small-food.onrender.com/api')
    ).toBe('https://order-to-audit-system-for-a-small-food.onrender.com/api');

    expect(
      normalizeApiBaseUrl('https://order-to-audit-system-for-a-small-food.onrender.com/api/')
    ).toBe('https://order-to-audit-system-for-a-small-food.onrender.com/api');

    expect(normalizeApiBaseUrl('http://localhost:5000/api')).toBe('http://localhost:5000/api');
    expect(normalizeApiBaseUrl('/api')).toBe('/api');
  });
});
