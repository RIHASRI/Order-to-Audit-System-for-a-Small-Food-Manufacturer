import { toPaisa, fromPaisa } from './decimal';

export interface GstLineInput {
  quantity: number;
  unitPrice: number;
  gstRate: number; // e.g., 5 for 5%
}

export interface GstLineResult {
  taxableValue: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  lineTotal: number;
}

/**
 * Computes exact GST line breakdown using integer-paisa arithmetic.
 * Intra-state (sellerStateCode === customerStateCode): splits GST equally into CGST + SGST.
 * Inter-state (sellerStateCode !== customerStateCode): charges full IGST.
 */
export function calculateGstLine(
  input: GstLineInput,
  sellerStateCode: string,
  customerStateCode: string
): GstLineResult {
  const isInterState =
    sellerStateCode.trim() !== customerStateCode.trim();

  const unitPricePaisa = toPaisa(input.unitPrice);
  const taxablePaisa = Math.round(unitPricePaisa * input.quantity);
  const totalTaxPaisa = Math.round((taxablePaisa * input.gstRate) / 100);

  let cgstPaisa = 0;
  let sgstPaisa = 0;
  let igstPaisa = 0;
  let cgstRate = 0;
  let sgstRate = 0;
  let igstRate = 0;

  if (isInterState) {
    igstPaisa = totalTaxPaisa;
    igstRate = input.gstRate;
  } else {
    cgstPaisa = Math.round(totalTaxPaisa / 2);
    sgstPaisa = totalTaxPaisa - cgstPaisa;
    // Wait: for 150 * 50 = 7500 -> 5% = 375 -> 375/2 = 187.50 each!
    // In paisa: 750000 * 5 / 100 = 37500 paisa -> 37500 / 2 = 18750 paisa = 187.50!
    cgstRate = input.gstRate / 2;
    sgstRate = input.gstRate / 2;
  }

  return {
    taxableValue: fromPaisa(taxablePaisa),
    cgstRate,
    sgstRate,
    igstRate,
    cgstAmount: fromPaisa(cgstPaisa),
    sgstAmount: fromPaisa(sgstPaisa),
    igstAmount: fromPaisa(igstPaisa),
    lineTotal: fromPaisa(taxablePaisa + cgstPaisa + sgstPaisa + igstPaisa),
  };
}

/**
 * Returns Indian Financial Year string e.g. "2026-27" for a given date.
 */
export function getFinancialYear(date: Date = new Date()): string {
  const month = date.getMonth() + 1; // 1-12
  const year = date.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  const endYearShort = String(startYear + 1).slice(-2);
  return `${startYear}-${endYearShort}`;
}
