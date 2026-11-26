import Decimal from 'decimal.js';

Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

export function toDecimal(value: number | string | Decimal): Decimal {
  return new Decimal(value ?? 0);
}

/** Rounds currency amounts to 2 decimal places (paise precision). */
export function roundMoney(value: number | string | Decimal): number {
  return new Decimal(value ?? 0).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}

/** Rounds quantities to 4 decimal places to preserve unit conversions cleanly. */
export function roundQty(value: number | string | Decimal): number {
  return new Decimal(value ?? 0).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

/** Rounds unit costs / weighted-average rates to 4 decimal places. */
export function roundRate(value: number | string | Decimal): number {
  return new Decimal(value ?? 0).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toNumber();
}

/** Converts rupees to integer paise for exact GST/invoice summation. */
export function toPaisa(rupees: number | string | Decimal): number {
  return new Decimal(rupees ?? 0).mul(100).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber();
}

/** Converts integer paise back to rupees (2 decimals). */
export function fromPaisa(paisa: number): number {
  return new Decimal(paisa).div(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toNumber();
}
