import { describe, it, expect } from 'vitest';
import { convertUnit } from '../utils/unitConverter';
import { calculateGstLine, getFinancialYear } from '../utils/gst';
import { roundMoney, toPaisa, fromPaisa } from '../utils/decimal';

describe('Unit Converter & GST & Decimal Precision Unit Tests', () => {
  it('converts kg <-> g and litre <-> ml accurately', () => {
    expect(convertUnit(40, 'kg', 'g')).toBe(40000);
    expect(convertUnit(1200, 'g', 'kg')).toBe(1.2);
    expect(convertUnit(10.5, 'litre', 'ml')).toBe(10500);
    expect(convertUnit(250, 'ml', 'litre')).toBe(0.25);
  });

  it('converts cartons <-> packets and pieces <-> packets accurately', () => {
    expect(convertUnit(10, 'cartons', 'packets', { packetsPerCarton: 20 })).toBe(200);
    expect(convertUnit(200, 'packets', 'cartons', { packetsPerCarton: 20 })).toBe(10);
    expect(convertUnit(200, 'pieces', 'packets', { piecesPerPacket: 1 })).toBe(200);
    expect(convertUnit(150, 'packets', 'pieces', { piecesPerPacket: 1 })).toBe(150);
  });

  it('calculates intra-state Tamil Nadu CGST + SGST (2.5% + 2.5%) in integer paisa', () => {
    const res = calculateGstLine(
      { quantity: 150, unitPrice: 50, gstRate: 5 },
      '33',
      '33'
    );
    expect(res.taxableValue).toBe(7500);
    expect(res.cgstAmount).toBe(187.5);
    expect(res.sgstAmount).toBe(187.5);
    expect(res.igstAmount).toBe(0);
    expect(res.lineTotal).toBe(7875);
  });

  it('calculates inter-state TN -> KA IGST (5%)', () => {
    const res = calculateGstLine(
      { quantity: 120, unitPrice: 50, gstRate: 5 },
      '33',
      '29'
    );
    expect(res.taxableValue).toBe(6000);
    expect(res.cgstAmount).toBe(0);
    expect(res.sgstAmount).toBe(0);
    expect(res.igstAmount).toBe(300);
    expect(res.lineTotal).toBe(6300);
  });

  it('handles integer-paisa conversions and Indian FY correctly', () => {
    expect(toPaisa(187.5)).toBe(18750);
    expect(fromPaisa(18750)).toBe(187.5);
    expect(roundMoney(31.1436)).toBe(31.14);
    expect(getFinancialYear(new Date('2026-11-25'))).toBe('2026-27');
    expect(getFinancialYear(new Date('2026-02-15'))).toBe('2025-26');
  });
});
