import { Product } from '../models/Product';
import { Customer } from '../models/Customer';
import { Supplier } from '../models/Supplier';
import { Material } from '../models/Material';
import { SalesOrder } from '../models/SalesOrder';
import { Invoice } from '../models/Invoice';
import { PurchaseOrder } from '../models/PurchaseOrder';
import { BOM } from '../models/BOM';
import { StockLedger } from '../models/StockLedger';
import { ConflictError, NotFoundError } from '../utils/errors';
import { recordAuditLog } from './auditService';
import { AuthUser } from '../middleware/auth';
import { withTransaction } from '../config/db';
import { postStockMovement } from './inventoryService';

export async function listProducts(search?: string, category?: string) {
  const query: Record<string, unknown> = { isActive: true };
  if (category) query.category = category;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { hsnCode: { $regex: search, $options: 'i' } },
    ];
  }
  return Product.find(query).sort({ name: 1 }).lean();
}

export async function createProduct(
  data: Record<string, unknown>,
  actor: AuthUser
) {
  return withTransaction(async (session) => {
    const openingStock = Number(data.openingStock || 0);
    const openingCost = Number(data.weightedAvgCost || 0);
    const payload = { ...data };
    delete payload.openingStock;
    payload.currentStock = 0; // Set strictly via StockLedger

    const [product] = await Product.create([payload], { session });

    if (openingStock > 0) {
      await postStockMovement({
        itemType: 'FINISHED_GOOD',
        itemId: String(product._id),
        movementType: 'OPENING_STOCK',
        direction: 'IN',
        quantity: openingStock,
        unitCost: openingCost,
        sourceDocType: 'OPENING_STOCK',
        sourceDocNumber: `OPEN-${product.sku}`,
        userId: actor.id,
        userName: actor.name,
        notes: 'Initial product opening stock',
        session,
      });
    }

    await recordAuditLog({
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: 'CREATE_PRODUCT',
      entityType: 'PRODUCT',
      entityId: String(product._id),
      entityRef: product.sku,
      summary: `Created product ${product.name} (${product.sku})`,
      afterData: product.toObject() as unknown as Record<string, unknown>,
      session,
    });

    return Product.findById(product._id).session(session).lean();
  });
}

export async function updateProduct(
  id: string,
  data: Record<string, unknown>,
  actor: AuthUser
) {
  const existing = await Product.findById(id);
  if (!existing) throw new NotFoundError('Product not found');
  const before = existing.toObject() as unknown as Record<string, unknown>;

  // Prevent arbitrary stock overwrites via master edit
  delete data.currentStock;
  Object.assign(existing, data);
  await existing.save();

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'UPDATE_PRODUCT',
    entityType: 'PRODUCT',
    entityId: id,
    entityRef: existing.sku,
    summary: `Updated product ${existing.name}`,
    beforeData: before,
    afterData: existing.toObject() as unknown as Record<string, unknown>,
  });

  return existing.toObject();
}

export async function deleteProduct(id: string, actor: AuthUser) {
  const product = await Product.findById(id);
  if (!product) throw new NotFoundError('Product not found');

  const [hasOrders, hasBoms, hasLedger] = await Promise.all([
    SalesOrder.exists({ 'items.product': id }),
    BOM.exists({ product: id }),
    StockLedger.exists({ itemId: id }),
  ]);

  if (hasOrders || hasBoms || hasLedger) {
    throw new ConflictError(
      'Cannot delete product because it is referenced in BOMs, orders, or stock ledger entries'
    );
  }

  await Product.deleteOne({ _id: id });
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'DELETE_PRODUCT',
    entityType: 'PRODUCT',
    entityId: id,
    entityRef: product.sku,
    summary: `Deleted product ${product.name} (${product.sku})`,
  });
}

export async function listCustomers(search?: string, customerType?: string) {
  const query: Record<string, unknown> = { isActive: true };
  if (customerType) query.customerType = customerType;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { gstin: { $regex: search, $options: 'i' } },
      { state: { $regex: search, $options: 'i' } },
      { phone: { $regex: search, $options: 'i' } },
    ];
  }
  return Customer.find(query).sort({ name: 1 }).lean();
}

export async function createCustomer(data: Record<string, unknown>, actor: AuthUser) {
  const customer = await Customer.create(data);
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'CREATE_CUSTOMER',
    entityType: 'CUSTOMER',
    entityId: String(customer._id),
    entityRef: customer.name,
    summary: `Created customer ${customer.name} (${customer.state})`,
    afterData: customer.toObject() as unknown as Record<string, unknown>,
  });
  return customer.toObject();
}

export async function updateCustomer(
  id: string,
  data: Record<string, unknown>,
  actor: AuthUser
) {
  const customer = await Customer.findById(id);
  if (!customer) throw new NotFoundError('Customer not found');
  const before = customer.toObject() as unknown as Record<string, unknown>;
  Object.assign(customer, data);
  await customer.save();
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'UPDATE_CUSTOMER',
    entityType: 'CUSTOMER',
    entityId: id,
    entityRef: customer.name,
    summary: `Updated customer ${customer.name}`,
    beforeData: before,
    afterData: customer.toObject() as unknown as Record<string, unknown>,
  });
  return customer.toObject();
}

export async function deleteCustomer(id: string, actor: AuthUser) {
  const customer = await Customer.findById(id);
  if (!customer) throw new NotFoundError('Customer not found');

  const [hasOrders, hasInvoices] = await Promise.all([
    SalesOrder.exists({ customer: id }),
    Invoice.exists({ customer: id }),
  ]);

  if (hasOrders || hasInvoices) {
    throw new ConflictError(
      'Cannot delete customer with existing sales orders or GST invoices'
    );
  }
  await Customer.deleteOne({ _id: id });
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'DELETE_CUSTOMER',
    entityType: 'CUSTOMER',
    entityId: id,
    entityRef: customer.name,
    summary: `Deleted customer ${customer.name}`,
  });
}

export async function listSuppliers(search?: string) {
  const query: Record<string, unknown> = { isActive: true };
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { gstin: { $regex: search, $options: 'i' } },
      { contactPerson: { $regex: search, $options: 'i' } },
    ];
  }
  return Supplier.find(query).sort({ name: 1 }).lean();
}

export async function createSupplier(data: Record<string, unknown>, actor: AuthUser) {
  const supplier = await Supplier.create(data);
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'CREATE_SUPPLIER',
    entityType: 'SUPPLIER',
    entityId: String(supplier._id),
    entityRef: supplier.name,
    summary: `Created supplier ${supplier.name}`,
  });
  return supplier.toObject();
}

export async function updateSupplier(
  id: string,
  data: Record<string, unknown>,
  actor: AuthUser
) {
  const supplier = await Supplier.findById(id);
  if (!supplier) throw new NotFoundError('Supplier not found');
  Object.assign(supplier, data);
  await supplier.save();
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'UPDATE_SUPPLIER',
    entityType: 'SUPPLIER',
    entityId: id,
    entityRef: supplier.name,
    summary: `Updated supplier ${supplier.name}`,
  });
  return supplier.toObject();
}

export async function deleteSupplier(id: string, actor: AuthUser) {
  const supplier = await Supplier.findById(id);
  if (!supplier) throw new NotFoundError('Supplier not found');
  const hasPO = await PurchaseOrder.exists({ supplier: id });
  if (hasPO) {
    throw new ConflictError('Cannot delete supplier with purchase history');
  }
  await Supplier.deleteOne({ _id: id });
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'DELETE_SUPPLIER',
    entityType: 'SUPPLIER',
    entityId: id,
    entityRef: supplier.name,
    summary: `Deleted supplier ${supplier.name}`,
  });
}

export async function listMaterials(category?: string, search?: string) {
  const query: Record<string, unknown> = { isActive: true };
  if (category) query.category = category;
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { code: { $regex: search, $options: 'i' } },
      { subCategory: { $regex: search, $options: 'i' } },
    ];
  }
  return Material.find(query).sort({ category: 1, name: 1 }).lean();
}

export async function createMaterial(data: Record<string, unknown>, actor: AuthUser) {
  return withTransaction(async (session) => {
    const openingStock = Number(data.openingStock || 0);
    const rate = Number(data.weightedAvgRate || 0);
    const payload = { ...data };
    delete payload.openingStock;
    payload.currentStock = 0;

    const [material] = await Material.create([payload], { session });

    if (openingStock > 0) {
      await postStockMovement({
        itemType: material.category,
        itemId: String(material._id),
        movementType: 'OPENING_STOCK',
        direction: 'IN',
        quantity: openingStock,
        unitCost: rate,
        sourceDocType: 'OPENING_STOCK',
        sourceDocNumber: `OPEN-${material.code}`,
        userId: actor.id,
        userName: actor.name,
        notes: 'Initial material opening stock',
        session,
      });
    }

    await recordAuditLog({
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: 'CREATE_MATERIAL',
      entityType: 'MATERIAL',
      entityId: String(material._id),
      entityRef: material.code,
      summary: `Created material ${material.name} (${material.code})`,
      session,
    });

    return Material.findById(material._id).session(session).lean();
  });
}

export async function updateMaterial(
  id: string,
  data: Record<string, unknown>,
  actor: AuthUser
) {
  const material = await Material.findById(id);
  if (!material) throw new NotFoundError('Material not found');
  delete data.currentStock;
  Object.assign(material, data);
  await material.save();
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'UPDATE_MATERIAL',
    entityType: 'MATERIAL',
    entityId: id,
    entityRef: material.code,
    summary: `Updated material ${material.name}`,
  });
  return material.toObject();
}

export async function deleteMaterial(id: string, actor: AuthUser) {
  const material = await Material.findById(id);
  if (!material) throw new NotFoundError('Material not found');

  const [hasBom, hasLedger, hasPO] = await Promise.all([
    BOM.exists({
      $or: [
        { 'rawMaterials.material': id },
        { 'packagingMaterials.material': id },
      ],
    }),
    StockLedger.exists({ itemId: id }),
    PurchaseOrder.exists({ 'items.material': id }),
  ]);

  if (hasBom || hasLedger || hasPO) {
    throw new ConflictError(
      'Cannot delete material referenced in BOMs, purchases, or stock ledger'
    );
  }
  await Material.deleteOne({ _id: id });
  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'DELETE_MATERIAL',
    entityType: 'MATERIAL',
    entityId: id,
    entityRef: material.code,
    summary: `Deleted material ${material.name}`,
  });
}
