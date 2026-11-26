export type UserRole =
  | 'OWNER'
  | 'ADMIN'
  | 'SALESMAN'
  | 'PRODUCTION_SUPERVISOR'
  | 'ACCOUNTANT';

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  phone?: string;
}

export interface Product {
  _id: string;
  name: string;
  sku: string;
  category: string;
  packSize: string;
  hsnCode: string;
  sellingPrice: number;
  gstRate: number;
  unit: string;
  reorderLevel: number;
  currentStock: number;
  weightedAvgCost: number;
}

export interface Customer {
  _id: string;
  name: string;
  customerType: 'RETAILER' | 'DISTRIBUTOR';
  gstin: string;
  address: string;
  state: string;
  stateCode: string;
  contactPerson: string;
  phone: string;
  email?: string;
  creditLimit: number;
  paymentTerms: string;
}

export interface Supplier {
  _id: string;
  name: string;
  gstin: string;
  address: string;
  state: string;
  stateCode: string;
  contactPerson: string;
  phone: string;
  email?: string;
  paymentTerms: string;
}

export interface Material {
  _id: string;
  name: string;
  code: string;
  category: 'RAW_MATERIAL' | 'PACKAGING';
  subCategory: string;
  unit: string;
  reorderLevel: number;
  currentStock: number;
  weightedAvgRate: number;
}

export interface BOMItem {
  material: string;
  materialName: string;
  materialCode: string;
  quantity: number;
  unit: string;
  materialUnit: string;
}

export interface BOM {
  _id: string;
  product: string;
  productName: string;
  bomCode: string;
  version: number;
  isActive: boolean;
  batchSize: number;
  expectedOutput: number;
  outputUnit: string;
  rawMaterials: BOMItem[];
  packagingMaterials: BOMItem[];
  standardLabourCost: number;
  standardPowerCost: number;
  notes?: string;
  createdAt: string;
}

export interface ProductionMaterialLine {
  material: string;
  materialName: string;
  materialCode: string;
  category: 'RAW_MATERIAL' | 'PACKAGING';
  plannedQty: number;
  actualQty: number;
  unit: string;
  unitCost: number;
  totalCost: number;
  varianceQty: number;
  variancePct: number;
  isAlert: boolean;
}

export interface ProductionRun {
  _id: string;
  productionNumber: string;
  product: string;
  productName: string;
  bomVersion: number;
  productionDate: string;
  batchSize: number;
  materials: ProductionMaterialLine[];
  expectedOutput: number;
  actualGoodOutput: number;
  damagedQuantity: number;
  damagedPouches: number;
  cartonsUsed: number;
  wastageQty: number;
  wastageNotes?: string;
  labourCost: number;
  powerCost: number;
  otherOverheads: number;
  yieldVariancePct: number;
  hasVarianceAlert: boolean;
  materialCost: number;
  packagingCost: number;
  totalProductionCost: number;
  costPerPacket: number;
  supervisorName: string;
  status: string;
  notes?: string;
}

export type OrderStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'UNDER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'PARTIALLY_DISPATCHED'
  | 'DISPATCHED'
  | 'CANCELLED';

export interface SalesOrderItem {
  product: string;
  productName: string;
  sku: string;
  hsnCode: string;
  unit: string;
  requestedQty: number;
  approvedQty: number;
  dispatchedQty: number;
  unitPrice: number;
  gstRate: number;
  taxableValue: number;
  taxAmount: number;
  lineTotal: number;
  availableStock?: number;
  remainingToDispatch?: number;
  shortage?: number;
}

export interface SalesOrder {
  _id: string;
  orderNumber: string;
  customer: string;
  customerName: string;
  customerState: string;
  customerStateCode: string;
  salesmanName: string;
  orderDate: string;
  status: OrderStatus;
  items: SalesOrderItem[];
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  rejectionReason?: string;
  notes?: string;
  hasStockShortage?: boolean;
  totalShortage?: number;
}

export interface Invoice {
  _id: string;
  invoiceNumber: string;
  financialYear: string;
  invoiceDate: string;
  sellerDetails: {
    name: string;
    gstin: string;
    address: string;
    state: string;
    stateCode: string;
    phone: string;
    email: string;
  };
  customer: string;
  customerSnapshot: {
    name: string;
    gstin: string;
    address: string;
    state: string;
    stateCode: string;
    phone: string;
  };
  salesOrder?: string;
  salesOrderNumber?: string;
  placeOfSupply: string;
  isInterState: boolean;
  items: Array<{
    product: string;
    productName: string;
    sku: string;
    hsnCode: string;
    unit: string;
    quantity: number;
    unitPrice: number;
    taxableValue: number;
    gstRate: number;
    cgstRate: number;
    sgstRate: number;
    igstRate: number;
    cgstAmount: number;
    sgstAmount: number;
    igstAmount: number;
    lineTotal: number;
  }>;
  taxableValue: number;
  cgstTotal: number;
  sgstTotal: number;
  igstTotal: number;
  grandTotal: number;
  paidAmount: number;
  outstandingAmount: number;
  status: 'ACTIVE' | 'CANCELLED' | 'CREDIT_NOTE';
}

export interface Dispatch {
  _id: string;
  dispatchNumber: string;
  salesOrder: string;
  salesOrderNumber: string;
  invoice?: string;
  invoiceNumber?: string;
  customerName: string;
  dispatchDate: string;
  items: Array<{
    product: string;
    productName: string;
    sku: string;
    quantity: number;
    unit: string;
  }>;
  totalDispatchedQty: number;
  deliveryStatus: 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED';
  vehicleNumber?: string;
  confirmedByName: string;
}

export interface Payment {
  _id: string;
  paymentNumber: string;
  customer: string;
  customerName: string;
  invoice: string;
  invoiceNumber: string;
  paymentDate: string;
  amount: number;
  paymentMethod: string;
  transactionRef: string;
  notes?: string;
  recordedByName: string;
}

export interface PurchaseOrder {
  _id: string;
  poNumber: string;
  supplier: string;
  supplierName: string;
  purchaseDate: string;
  items: Array<{
    material: string;
    materialName: string;
    materialCode: string;
    quantity: number;
    unit: string;
    rate: number;
    gstRate: number;
    taxAmount: number;
    totalAmount: number;
  }>;
  subtotal: number;
  taxTotal: number;
  grandTotal: number;
  receiptStatus: 'PENDING' | 'RECEIVED' | 'CANCELLED';
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
  paidAmount: number;
  notes?: string;
}
