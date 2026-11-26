import Decimal from 'decimal.js';

export type SupportedUnit =
  | 'kg'
  | 'g'
  | 'litre'
  | 'ml'
  | 'piece'
  | 'pieces'
  | 'pouch'
  | 'pouches'
  | 'carton'
  | 'cartons'
  | 'packet'
  | 'packets';

const UNIT_ALIASES: Record<string, string> = {
  kg: 'kg',
  kilogram: 'kg',
  kilograms: 'kg',
  g: 'g',
  gm: 'g',
  gram: 'g',
  grams: 'g',
  l: 'litre',
  litre: 'litre',
  litres: 'litre',
  liter: 'litre',
  liters: 'litre',
  ml: 'ml',
  millilitre: 'ml',
  milliliter: 'ml',
  piece: 'pieces',
  pieces: 'pieces',
  pcs: 'pieces',
  pc: 'pieces',
  pouch: 'pouches',
  pouches: 'pouches',
  carton: 'cartons',
  cartons: 'cartons',
  box: 'cartons',
  boxes: 'cartons',
  packet: 'packets',
  packets: 'packets',
  pkt: 'packets',
  pkts: 'packets',
};

export function normalizeUnit(unit: string): string {
  const key = unit.trim().toLowerCase();
  return UNIT_ALIASES[key] || key;
}

/**
 * Converts a quantity from `fromUnit` to `toUnit`.
 * Supports:
 * - kg <-> g (1 kg = 1000 g)
 * - litre <-> ml (1 litre = 1000 ml)
 * - pieces <-> packets (1 piece = 1 packet for 1:1 pouch-to-packet, or custom conversionFactor)
 * - cartons <-> packets (defaults to 20 packets per carton, or custom packetsPerCarton)
 */
export function convertUnit(
  quantity: number,
  fromUnit: string,
  toUnit: string,
  options?: { packetsPerCarton?: number; piecesPerPacket?: number }
): number {
  const from = normalizeUnit(fromUnit);
  const to = normalizeUnit(toUnit);
  if (from === to) return quantity;

  const qty = new Decimal(quantity);
  const packetsPerCarton = options?.packetsPerCarton ?? 20;
  const piecesPerPacket = options?.piecesPerPacket ?? 1;

  // Mass
  if (from === 'kg' && to === 'g') return qty.mul(1000).toNumber();
  if (from === 'g' && to === 'kg') return qty.div(1000).toNumber();

  // Volume
  if (from === 'litre' && to === 'ml') return qty.mul(1000).toNumber();
  if (from === 'ml' && to === 'litre') return qty.div(1000).toNumber();

  // Packaging <-> Packets
  if (from === 'cartons' && to === 'packets') return qty.mul(packetsPerCarton).toNumber();
  if (from === 'packets' && to === 'cartons') return qty.div(packetsPerCarton).toNumber();

  if ((from === 'pieces' || from === 'pouches') && to === 'packets') {
    return qty.div(piecesPerPacket).toNumber();
  }
  if (from === 'packets' && (to === 'pieces' || to === 'pouches')) {
    return qty.mul(piecesPerPacket).toNumber();
  }
  if (
    (from === 'pieces' && to === 'pouches') ||
    (from === 'pouches' && to === 'pieces')
  ) {
    return qty.toNumber();
  }

  throw new Error(`Unsupported unit conversion from "${fromUnit}" to "${toUnit}"`);
}
