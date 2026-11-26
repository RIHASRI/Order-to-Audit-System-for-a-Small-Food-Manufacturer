import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

export const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(2),
  category: z.string().min(2).default('Savouries'),
  packSize: z.string().min(1),
  hsnCode: z.string().min(4),
  sellingPrice: z.number().nonnegative(),
  gstRate: z.number().min(0).max(28),
  unit: z.string().min(1).default('packets'),
  reorderLevel: z.number().nonnegative().default(50),
  openingStock: z.number().nonnegative().optional(),
  weightedAvgCost: z.number().nonnegative().optional(),
});

export const customerSchema = z.object({
  name: z.string().min(2),
  customerType: z.enum(['RETAILER', 'DISTRIBUTOR']),
  gstin: z.string().optional().default(''),
  address: z.string().min(3),
  state: z.string().min(2),
  stateCode: z.string().min(1).max(3),
  contactPerson: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional().or(z.literal('')),
  creditLimit: z.number().nonnegative().default(50000),
  paymentTerms: z.string().min(2).default('Net 15 Days'),
});

export const supplierSchema = z.object({
  name: z.string().min(2),
  gstin: z.string().optional().default(''),
  address: z.string().min(3),
  state: z.string().min(2).default('Tamil Nadu'),
  stateCode: z.string().min(1).max(3).default('33'),
  contactPerson: z.string().min(2),
  phone: z.string().min(6),
  email: z.string().email().optional().or(z.literal('')),
  paymentTerms: z.string().min(2).default('Net 30 Days'),
});

export const materialSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  category: z.enum(['RAW_MATERIAL', 'PACKAGING']),
  subCategory: z.string().min(2),
  unit: z.string().min(1),
  reorderLevel: z.number().nonnegative().default(10),
  openingStock: z.number().nonnegative().optional(),
  weightedAvgRate: z.number().nonnegative().default(0),
});

export const bomSchema = z.object({
  productId: z.string().min(1),
  batchSize: z.number().positive(),
  expectedOutput: z.number().positive(),
  outputUnit: z.string().optional(),
  rawMaterials: z
    .array(
      z.object({
        materialId: z.string().min(1),
        quantity: z.number().positive(),
        unit: z.string().min(1),
      })
    )
    .min(1),
  packagingMaterials: z.array(
    z.object({
      materialId: z.string().min(1),
      quantity: z.number().positive(),
      unit: z.string().min(1),
    })
  ),
  standardLabourCost: z.number().nonnegative().optional(),
  standardPowerCost: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const productionRunSchema = z.object({
  productId: z.string().min(1),
  bomId: z.string().optional(),
  productionDate: z.string().optional(),
  batchSize: z.number().positive(),
  actualRawMaterials: z
    .array(
      z.object({
        materialId: z.string().min(1),
        actualQty: z.number().nonnegative(),
      })
    )
    .optional(),
  actualPackaging: z
    .array(
      z.object({
        materialId: z.string().min(1),
        actualQty: z.number().nonnegative(),
      })
    )
    .optional(),
  actualGoodOutput: z.number().nonnegative(),
  damagedQuantity: z.number().nonnegative().optional(),
  damagedPouches: z.number().nonnegative().optional(),
  cartonsUsed: z.number().nonnegative().optional(),
  wastageQty: z.number().nonnegative().optional(),
  wastageNotes: z.string().optional(),
  labourCost: z.number().nonnegative(),
  powerCost: z.number().nonnegative(),
  otherOverheads: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1),
  purchaseDate: z.string().optional(),
  items: z
    .array(
      z.object({
        materialId: z.string().min(1),
        quantity: z.number().positive(),
        rate: z.number().nonnegative(),
        gstRate: z.number().min(0).max(28).optional(),
      })
    )
    .min(1),
  receiveImmediately: z.boolean().optional(),
  paymentStatus: z.enum(['UNPAID', 'PARTIAL', 'PAID']).optional(),
  paidAmount: z.number().nonnegative().optional(),
  notes: z.string().optional(),
});

export const salesOrderSchema = z.object({
  customerId: z.string().min(1),
  orderDate: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative().optional(),
      })
    )
    .min(1),
  status: z.enum(['DRAFT', 'SUBMITTED']).optional(),
  notes: z.string().optional(),
  offlineId: z.string().optional(),
});

export const orderReviewSchema = z.object({
  status: z
    .enum([
      'DRAFT',
      'SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
    ])
    .optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        approvedQty: z.number().nonnegative(),
        unitPrice: z.number().nonnegative(),
      })
    )
    .optional(),
  rejectionReason: z.string().optional(),
  notes: z.string().optional(),
});

export const createInvoiceSchema = z.object({
  salesOrderId: z.string().optional(),
  customerId: z.string().optional(),
  invoiceDate: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
        unitPrice: z.number().nonnegative().optional(),
      })
    )
    .optional(),
});

export const createDispatchSchema = z.object({
  salesOrderId: z.string().min(1),
  invoiceId: z.string().optional(),
  dispatchDate: z.string().optional(),
  items: z
    .array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().positive(),
      })
    )
    .min(1),
  vehicleNumber: z.string().optional(),
  notes: z.string().optional(),
  idempotencyKey: z.string().optional(),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  paymentDate: z.string().optional(),
  amount: z.number().positive(),
  paymentMethod: z.enum(['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE', 'NEFT', 'RTGS']),
  transactionRef: z.string().min(2),
  notes: z.string().optional(),
});

export const stockAdjustmentSchema = z.object({
  itemType: z.enum(['RAW_MATERIAL', 'PACKAGING', 'FINISHED_GOOD']),
  itemId: z.string().min(1),
  movementType: z.enum(['ADJUSTMENT', 'DAMAGE', 'CUSTOMER_RETURN', 'OPENING_STOCK']),
  direction: z.enum(['IN', 'OUT']),
  quantity: z.number().positive(),
  unitCost: z.number().nonnegative().optional(),
  notes: z.string().min(3),
});
