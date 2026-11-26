import bcrypt from 'bcryptjs';
import { User } from '../models/User';
import { Material } from '../models/Material';
import { Product } from '../models/Product';
import { Customer } from '../models/Customer';
import { Supplier } from '../models/Supplier';
import { BOM } from '../models/BOM';
import { AuthUser } from '../middleware/auth';
import { withTransaction } from '../config/db';
import { postStockMovement } from './inventoryService';
import { createBomVersion } from './bomService';
import { createPurchaseOrder } from './purchaseService';
import { postProductionRun } from './productionService';
import { createSalesOrder, reviewOrUpdateOrder } from './salesOrderService';
import { createGstInvoice } from './invoiceService';
import { createDispatch } from './dispatchService';
import { recordPayment } from './paymentService';

export const DEMO_USERS = [
  {
    name: 'Arvind Subramanian',
    email: 'owner@factoryflow.in',
    password: 'Password@123',
    role: 'OWNER' as const,
    phone: '+91 98400 10001',
  },
  {
    name: 'Priya Krishnan',
    email: 'admin@factoryflow.in',
    password: 'Password@123',
    role: 'ADMIN' as const,
    phone: '+91 98400 10002',
  },
  {
    name: 'Karthik Rajan',
    email: 'sales@factoryflow.in',
    password: 'Password@123',
    role: 'SALESMAN' as const,
    phone: '+91 98400 10003',
  },
  {
    name: 'Murugan Selvam',
    email: 'production@factoryflow.in',
    password: 'Password@123',
    role: 'PRODUCTION_SUPERVISOR' as const,
    phone: '+91 98400 10004',
  },
  {
    name: 'Lakshmi Narayanan',
    email: 'accountant@factoryflow.in',
    password: 'Password@123',
    role: 'ACCOUNTANT' as const,
    phone: '+91 98400 10005',
  },
];

/**
 * Seeds the database idempotently with all 5 role accounts and the exact
 * NIT Tiruchirappalli benchmark scenario from Sections 6, 17, and 18.
 */
export async function seedDatabaseIfEmpty(): Promise<{ seeded: boolean }> {
  const existingUsers = await User.countDocuments();
  if (existingUsers > 0) {
    return { seeded: false };
  }

  // 1. Create all 5 role users
  const createdUsers = [];
  for (const u of DEMO_USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    const doc = await User.create({
      name: u.name,
      email: u.email,
      passwordHash,
      role: u.role,
      phone: u.phone,
    });
    createdUsers.push(doc);
  }

  const ownerDoc = createdUsers.find((u) => u.role === 'OWNER')!;
  const adminDoc = createdUsers.find((u) => u.role === 'ADMIN')!;
  const salesmanDoc = createdUsers.find((u) => u.role === 'SALESMAN')!;
  const prodDoc = createdUsers.find((u) => u.role === 'PRODUCTION_SUPERVISOR')!;

  const ownerActor: AuthUser = {
    id: String(ownerDoc._id),
    name: ownerDoc.name,
    email: ownerDoc.email,
    role: 'OWNER',
  };
  const adminActor: AuthUser = {
    id: String(adminDoc._id),
    name: adminDoc.name,
    email: adminDoc.email,
    role: 'ADMIN',
  };
  const salesmanActor: AuthUser = {
    id: String(salesmanDoc._id),
    name: salesmanDoc.name,
    email: salesmanDoc.email,
    role: 'SALESMAN',
  };
  const prodActor: AuthUser = {
    id: String(prodDoc._id),
    name: prodDoc.name,
    email: prodDoc.email,
    role: 'PRODUCTION_SUPERVISOR',
  };

  // 2. Create Master Data + Opening Stock atomically via StockLedger
  const {
    flour,
    oil,
    spiceMix,
    pouch,
    carton,
    murukku,
    supplier1,
    retailerA,
    distributorB,
  } = await withTransaction(async (session) => {
    const [flourDoc] = await Material.create(
      [
        {
          name: 'Rice & Besan Flour',
          code: 'RM-FLOUR',
          category: 'RAW_MATERIAL',
          subCategory: 'FLOUR',
          unit: 'kg',
          reorderLevel: 30,
          currentStock: 0,
          weightedAvgRate: 42,
        },
      ],
      { session }
    );
    const [oilDoc] = await Material.create(
      [
        {
          name: 'Refined Cooking Oil',
          code: 'RM-OIL',
          category: 'RAW_MATERIAL',
          subCategory: 'COOKING_OIL',
          unit: 'litre',
          reorderLevel: 15,
          currentStock: 0,
          weightedAvgRate: 140,
        },
      ],
      { session }
    );
    const [spiceDoc] = await Material.create(
      [
        {
          name: 'Salt and Spice Mix',
          code: 'RM-SPICE',
          category: 'RAW_MATERIAL',
          subCategory: 'SPICE_MIX',
          unit: 'kg',
          reorderLevel: 3,
          currentStock: 0,
          weightedAvgRate: 200,
        },
      ],
      { session }
    );
    const [pouchDoc] = await Material.create(
      [
        {
          name: 'Printed Food Pouch (200g)',
          code: 'PK-POUCH',
          category: 'PACKAGING',
          subCategory: 'POUCH',
          unit: 'pieces',
          reorderLevel: 150,
          currentStock: 0,
          weightedAvgRate: 2.5,
        },
      ],
      { session }
    );
    const [cartonDoc] = await Material.create(
      [
        {
          name: 'Corrugated Master Carton (20 pkts)',
          code: 'PK-CARTON',
          category: 'PACKAGING',
          subCategory: 'CARTON',
          unit: 'pieces',
          reorderLevel: 10,
          currentStock: 0,
          weightedAvgRate: 15,
        },
      ],
      { session }
    );

    const [murukkuDoc] = await Product.create(
      [
        {
          name: 'Murukku 200 g',
          sku: 'FG-MRK-200',
          category: 'Traditional Savouries',
          packSize: '200 g',
          hsnCode: '21069099',
          sellingPrice: 50,
          gstRate: 5,
          unit: 'packets',
          reorderLevel: 50,
          currentStock: 0,
          weightedAvgCost: 31.14,
        },
      ],
      { session }
    );

    const openDate = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);

    await postStockMovement({
      date: openDate,
      itemType: 'RAW_MATERIAL',
      itemId: String(flourDoc._id),
      movementType: 'OPENING_STOCK',
      direction: 'IN',
      quantity: 100,
      unitCost: 42,
      sourceDocType: 'OPENING_STOCK',
      sourceDocNumber: 'OPEN-RM-FLOUR',
      userId: ownerActor.id,
      userName: ownerActor.name,
      notes: 'Benchmark opening stock: Flour 100 kg @ ₹42/kg',
      session,
    });

    await postStockMovement({
      date: openDate,
      itemType: 'RAW_MATERIAL',
      itemId: String(oilDoc._id),
      movementType: 'OPENING_STOCK',
      direction: 'IN',
      quantity: 30,
      unitCost: 140,
      sourceDocType: 'OPENING_STOCK',
      sourceDocNumber: 'OPEN-RM-OIL',
      userId: ownerActor.id,
      userName: ownerActor.name,
      notes: 'Benchmark opening stock: Cooking oil 30 litres @ ₹140/L',
      session,
    });

    await postStockMovement({
      date: openDate,
      itemType: 'RAW_MATERIAL',
      itemId: String(spiceDoc._id),
      movementType: 'OPENING_STOCK',
      direction: 'IN',
      quantity: 5,
      unitCost: 200,
      sourceDocType: 'OPENING_STOCK',
      sourceDocNumber: 'OPEN-RM-SPICE',
      userId: ownerActor.id,
      userName: ownerActor.name,
      notes: 'Benchmark opening stock: Spice mix 5 kg @ ₹200/kg',
      session,
    });

    await postStockMovement({
      date: openDate,
      itemType: 'PACKAGING',
      itemId: String(pouchDoc._id),
      movementType: 'OPENING_STOCK',
      direction: 'IN',
      quantity: 500,
      unitCost: 2.5,
      sourceDocType: 'OPENING_STOCK',
      sourceDocNumber: 'OPEN-PK-POUCH',
      userId: ownerActor.id,
      userName: ownerActor.name,
      notes: 'Benchmark opening stock: Pouches 500 pieces @ ₹2.50',
      session,
    });

    await postStockMovement({
      date: openDate,
      itemType: 'PACKAGING',
      itemId: String(cartonDoc._id),
      movementType: 'OPENING_STOCK',
      direction: 'IN',
      quantity: 30,
      unitCost: 15,
      sourceDocType: 'OPENING_STOCK',
      sourceDocNumber: 'OPEN-PK-CARTON',
      userId: ownerActor.id,
      userName: ownerActor.name,
      notes: 'Benchmark opening stock: Cartons 30 pieces @ ₹15',
      session,
    });

    await postStockMovement({
      date: openDate,
      itemType: 'FINISHED_GOOD',
      itemId: String(murukkuDoc._id),
      movementType: 'OPENING_STOCK',
      direction: 'IN',
      quantity: 50,
      unitCost: 31.14,
      sourceDocType: 'OPENING_STOCK',
      sourceDocNumber: 'OPEN-FG-MRK-200',
      userId: ownerActor.id,
      userName: ownerActor.name,
      notes: 'Benchmark opening stock: Finished Murukku 200 g (50 packets)',
      session,
    });

    const [sup] = await Supplier.create(
      [
        {
          name: 'Cauvery Agro Mills & Traders',
          gstin: '33AABCC9876E1Z2',
          address: '18 Gandhi Market Road, Tiruchirappalli, Tamil Nadu - 620008',
          state: 'Tamil Nadu',
          stateCode: '33',
          contactPerson: 'Senthil Nathan',
          phone: '+91 98421 55443',
          email: 'orders@cauveryagro.in',
          paymentTerms: 'Net 15 Days',
        },
      ],
      { session }
    );

    const [custA] = await Customer.create(
      [
        {
          name: 'Retailer A (Sri Lakshmi Supermart)',
          customerType: 'RETAILER',
          gstin: '33AADCS4421H1Z8',
          address: '72 Thillai Nagar Main Rd, Tiruchirappalli, Tamil Nadu - 620018',
          state: 'Tamil Nadu',
          stateCode: '33',
          contactPerson: 'Ramesh Babu',
          phone: '+91 98424 11220',
          email: 'accounts@srilakshmimart.in',
          creditLimit: 50000,
          paymentTerms: 'Net 15 Days',
        },
      ],
      { session }
    );

    const [custB] = await Customer.create(
      [
        {
          name: 'Distributor B (Deccan Foods Karnataka)',
          customerType: 'DISTRIBUTOR',
          gstin: '29AABCD7788K1Z4',
          address: '104 APMC Yard, Yeshwanthpur, Bengaluru, Karnataka - 560022',
          state: 'Karnataka',
          stateCode: '29',
          contactPerson: 'Manjunath Rao',
          phone: '+91 99001 88776',
          email: 'procurement@deccanfoods.in',
          creditLimit: 150000,
          paymentTerms: 'Net 30 Days',
        },
      ],
      { session }
    );

    return {
      flour: flourDoc,
      oil: oilDoc,
      spiceMix: spiceDoc,
      pouch: pouchDoc,
      carton: cartonDoc,
      murukku: murukkuDoc,
      supplier1: sup,
      retailerA: custA,
      distributorB: custB,
    };
  });

  // 3. Create Benchmark BOM for Murukku 200 g
  const bom = await createBomVersion(
    {
      productId: String(murukku._id),
      batchSize: 1,
      expectedOutput: 200,
      outputUnit: 'packets',
      rawMaterials: [
        { materialId: String(flour._id), quantity: 40, unit: 'kg' },
        { materialId: String(oil._id), quantity: 10, unit: 'litre' },
        { materialId: String(spiceMix._id), quantity: 1.2, unit: 'kg' },
      ],
      packagingMaterials: [
        { materialId: String(pouch._id), quantity: 200, unit: 'pieces' },
        { materialId: String(carton._id), quantity: 10, unit: 'pieces' },
      ],
      standardLabourCost: 1200,
      standardPowerCost: 600,
      notes: 'Standard Benchmark Recipe: 1 batch = 200 packets of Murukku 200 g',
    },
    prodActor
  );

  // 4. Purchase: 60 kg Flour at ₹45/kg -> Flour stock becomes 160 kg @ ₹43.125/kg
  await createPurchaseOrder(
    {
      supplierId: String(supplier1._id),
      purchaseDate: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000),
      items: [
        {
          materialId: String(flour._id),
          quantity: 60,
          rate: 45,
          gstRate: 0,
        },
      ],
      receiveImmediately: true,
      paymentStatus: 'PAID',
      paidAmount: 2700,
      notes: 'Benchmark Flour Purchase: 60 kg @ ₹45/kg',
    },
    adminActor
  );

  // 5. Production Run:
  // Flour 40 kg -> 120 kg remaining
  // Oil 10.5 L -> 19.5 L remaining (+5% variance alert)
  // Spice 1.2 kg -> 3.8 kg remaining
  // Good output 188 packets -> 238 finished packets (-6% yield variance alert)
  // Damaged pouches 6 -> 194 pouches consumed -> 306 remaining
  // Cartons used 9 -> 21 cartons remaining
  // Labour ₹1,200, Gas/power ₹600
  await postProductionRun(
    {
      productId: String(murukku._id),
      bomId: String(bom._id),
      productionDate: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      batchSize: 1,
      actualRawMaterials: [
        { materialId: String(flour._id), actualQty: 40 },
        { materialId: String(oil._id), actualQty: 10.5 },
        { materialId: String(spiceMix._id), actualQty: 1.2 },
      ],
      actualGoodOutput: 188,
      damagedQuantity: 12,
      damagedPouches: 6,
      cartonsUsed: 9,
      wastageQty: 12,
      wastageNotes: '6 damaged pouches during heat sealing, 12 packets output shortfall',
      labourCost: 1200,
      powerCost: 600,
      notes: 'Benchmark Production Batch #1',
    },
    prodActor
  );

  // 6. Sales Order 1: Retailer A (Tamil Nadu) - 150 packets
  const orderA = await createSalesOrder(
    {
      customerId: String(retailerA._id),
      orderDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      items: [{ productId: String(murukku._id), quantity: 150, unitPrice: 50 }],
      status: 'SUBMITTED',
      notes: 'Retailer A TN Order (150 packets)',
    },
    salesmanActor
  );

  await reviewOrUpdateOrder(
    String(orderA._id),
    { status: 'APPROVED' },
    adminActor
  );

  // 7. GST Invoice for Retailer A: Taxable ₹7,500, CGST ₹187.50, SGST ₹187.50, Total ₹7,875
  const invoiceA = await createGstInvoice(
    {
      salesOrderId: String(orderA._id),
      invoiceDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    adminActor
  );

  // 8. Dispatch for Retailer A: 150 packets -> Finished stock becomes 88 packets
  await createDispatch(
    {
      salesOrderId: String(orderA._id),
      invoiceId: String(invoiceA._id),
      dispatchDate: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      items: [{ productId: String(murukku._id), quantity: 150 }],
      vehicleNumber: 'TN-45-AX-4412',
      notes: 'Full dispatch to Retailer A',
      idempotencyKey: 'SEED-DISP-RETAILER-A',
    },
    adminActor
  );

  // 9. Payment from Retailer A: ₹4,000 -> Outstanding ₹3,875
  await recordPayment(
    {
      invoiceId: String(invoiceA._id),
      paymentDate: new Date(),
      amount: 4000,
      paymentMethod: 'UPI',
      transactionRef: 'UPI-631982041122',
      notes: 'Partial payment from Retailer A',
    },
    adminActor
  );

  // 10. Sales Order 2: Distributor B (Karnataka) - 120 packets -> Shortage 32 packets (88 available)
  await createSalesOrder(
    {
      customerId: String(distributorB._id),
      orderDate: new Date(),
      items: [{ productId: String(murukku._id), quantity: 120, unitPrice: 50 }],
      status: 'SUBMITTED',
      notes: 'Distributor B Karnataka Order (120 packets — awaiting production for 32-pkt shortage)',
    },
    salesmanActor
  );

  console.log('[Seed] Benchmark data & 5 role accounts seeded successfully.');
  return { seeded: true };
}

export async function resetAndReseedDatabase() {
  await Promise.all([
    User.deleteMany({}),
    Material.deleteMany({}),
    Product.deleteMany({}),
    Customer.deleteMany({}),
    Supplier.deleteMany({}),
    BOM.deleteMany({}),
  ]);
  const mongoose = (await import('mongoose')).default;
  const collections = await mongoose.connection.db!.collections();
  for (const col of collections) {
    await col.deleteMany({});
  }
  return seedDatabaseIfEmpty();
}
