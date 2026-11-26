import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { createApp } from '../app';
import { seedDatabaseIfEmpty } from '../services/seedService';

let replSet: MongoMemoryReplSet;
const app = createApp();

let ownerToken = '';
let adminToken = '';
let salesmanToken = '';
let prodToken = '';
let accountantToken = '';

beforeAll(async () => {
  replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  await mongoose.connect(replSet.getUri('factoryflow_test'));
  await seedDatabaseIfEmpty();

  const login = async (email: string) => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email, password: 'Password@123' });
    expect(res.status).toBe(200);
    return res.body.data.token as string;
  };

  ownerToken = await login('owner@factoryflow.in');
  adminToken = await login('admin@factoryflow.in');
  salesmanToken = await login('sales@factoryflow.in');
  prodToken = await login('production@factoryflow.in');
  accountantToken = await login('accountant@factoryflow.in');
});

afterAll(async () => {
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

describe('FactoryFlow End-to-End Benchmark & RBAC Verification', () => {
  it('enforces authentication and strict role-based authorization', async () => {
    const unauth = await request(app).get('/api/products');
    expect(unauth.status).toBe(401);

    // Accountant is strictly read-only
    const accWriteProd = await request(app)
      .post('/api/products')
      .set('Authorization', `Bearer ${accountantToken}`)
      .send({
        name: 'Test',
        sku: 'TST-1',
        packSize: '100g',
        hsnCode: '2106',
        sellingPrice: 20,
        gstRate: 5,
      });
    expect(accWriteProd.status).toBe(403);

    const accReadReports = await request(app)
      .get('/api/reports/gst-outward')
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(accReadReports.status).toBe(200);

    // Salesman cannot post production runs
    const salesProd = await request(app)
      .post('/api/production')
      .set('Authorization', `Bearer ${salesmanToken}`)
      .send({});
    expect(salesProd.status).toBe(403);

    // Production supervisor can read BOMs & production
    const prodBoms = await request(app)
      .get('/api/boms')
      .set('Authorization', `Bearer ${prodToken}`);
    expect(prodBoms.status).toBe(200);
  });

  it('reconciles ALL 14 exact benchmark figures from Section 18', async () => {
    // 1. Inventory & Closing Stock Verification
    const invRes = await request(app)
      .get('/api/inventory/summary')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(invRes.status).toBe(200);

    const { rawMaterials, packagingMaterials, finishedGoods } = invRes.body.data;
    const flour = rawMaterials.find((m: { code: string }) => m.code === 'RM-FLOUR');
    const oil = rawMaterials.find((m: { code: string }) => m.code === 'RM-OIL');
    const spice = rawMaterials.find((m: { code: string }) => m.code === 'RM-SPICE');
    const pouch = packagingMaterials.find((m: { code: string }) => m.code === 'PK-POUCH');
    const carton = packagingMaterials.find((m: { code: string }) => m.code === 'PK-CARTON');
    const murukku = finishedGoods.find((p: { sku: string }) => p.sku === 'FG-MRK-200');

    expect(flour.currentStock).toBe(120); // 100 + 60 - 40
    expect(flour.weightedAvgRate).toBe(43.125); // (100*42 + 60*45)/160
    expect(oil.currentStock).toBe(19.5); // 30 - 10.5
    expect(spice.currentStock).toBe(3.8); // 5 - 1.2
    expect(pouch.currentStock).toBe(306); // 500 - (188 + 6)
    expect(carton.currentStock).toBe(21); // 30 - 9
    expect(murukku.currentStock).toBe(88); // 50 + 188 - 150

    // Stock Ledger formula check for Murukku: 50 opening + 188 produced - 150 dispatched = 88
    expect(murukku.reconciliation.opening).toBe(50);
    expect(murukku.reconciliation.receipts).toBe(188);
    expect(murukku.reconciliation.sales).toBe(150);
    expect(murukku.reconciliation.computedClosing).toBe(88);

    // 2. Production Variance & Costing Verification
    const prodRes = await request(app)
      .get('/api/production')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(prodRes.status).toBe(200);
    const run = prodRes.body.data[0];

    expect(run.expectedOutput).toBe(200);
    expect(run.actualGoodOutput).toBe(188);
    expect(run.yieldVariancePct).toBe(-6);
    expect(run.hasVarianceAlert).toBe(true);

    const oilLine = run.materials.find((m: { materialCode: string }) => m.materialCode === 'RM-OIL');
    expect(oilLine.plannedQty).toBe(10);
    expect(oilLine.actualQty).toBe(10.5);
    expect(oilLine.variancePct).toBe(5);
    expect(oilLine.isAlert).toBe(true);

    // Costing: Material (40*43.125 + 10.5*140 + 1.2*200 = 1725 + 1470 + 240 = 3435)
    // Packaging (194*2.5 + 9*15 = 485 + 135 = 620)
    // Overheads (1200 + 600 = 1800) -> Total = 5855 -> / 188 = 31.1436
    expect(run.materialCost).toBe(3435);
    expect(run.packagingCost).toBe(620);
    expect(run.totalProductionCost).toBe(5855);
    expect(Number(run.costPerPacket.toFixed(2))).toBe(31.14);

    // 3. GST Invoice & Payment Outstanding Verification
    const invListRes = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${ownerToken}`);
    expect(invListRes.status).toBe(200);
    const invoiceA = invListRes.body.data[0];

    expect(invoiceA.taxableValue).toBe(7500);
    expect(invoiceA.cgstTotal).toBe(187.5);
    expect(invoiceA.sgstTotal).toBe(187.5);
    expect(invoiceA.igstTotal).toBe(0);
    expect(invoiceA.grandTotal).toBe(7875);
    expect(invoiceA.paidAmount).toBe(4000);
    expect(invoiceA.outstandingAmount).toBe(3875);

    // 4. Distributor B Shortage Verification (120 requested - 88 available = 32 shortage)
    const ordersRes = await request(app)
      .get('/api/orders')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(ordersRes.status).toBe(200);
    const distBOrder = ordersRes.body.data.find((o: { customerName: string }) =>
      o.customerName.includes('Distributor B')
    );
    expect(distBOrder).toBeTruthy();
    expect(distBOrder.items[0].requestedQty).toBe(120);
    expect(distBOrder.items[0].availableStock).toBe(88);
    expect(distBOrder.items[0].shortage).toBe(32);

    // 5. Block dispatch beyond available stock (88)
    await request(app)
      .patch(`/api/orders/${distBOrder._id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'APPROVED' });

    const overDispatchRes = await request(app)
      .post('/api/dispatches')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        salesOrderId: distBOrder._id,
        items: [{ productId: distBOrder.items[0].product, quantity: 120 }],
      });
    expect(overDispatchRes.status).toBe(400);
    expect(overDispatchRes.body.error.code).toBe('INSUFFICIENT_STOCK');
  });

  it('supports Master CRUD, PDF invoice generation, and Excel/CSV/PDF report exports', async () => {
    // Customer CRUD
    const createCust = await request(app)
      .post('/api/customers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        name: 'Madurai Snacks Mart',
        customerType: 'RETAILER',
        gstin: '33AAACM1234A1Z9',
        address: '12 West Masi Street, Madurai',
        state: 'Tamil Nadu',
        stateCode: '33',
        contactPerson: 'Velan',
        phone: '9876543210',
        creditLimit: 25000,
        paymentTerms: 'Net 15 Days',
      });
    expect(createCust.status).toBe(201);
    const custId = createCust.body.data._id;

    const delCust = await request(app)
      .delete(`/api/customers/${custId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(delCust.status).toBe(200);

    // Invoice PDF Generation
    const invListRes = await request(app)
      .get('/api/invoices')
      .set('Authorization', `Bearer ${ownerToken}`);
    const invoiceId = invListRes.body.data[0]._id;

    const pdfRes = await request(app)
      .get(`/api/invoices/${invoiceId}/pdf`)
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(pdfRes.status).toBe(200);
    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(pdfRes.body.length).toBeGreaterThan(500);

    // Report Exports (Excel, CSV, PDF)
    const excelRes = await request(app)
      .get('/api/reports/gst-outward/export?format=excel')
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(excelRes.status).toBe(200);
    expect(excelRes.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );

    const csvRes = await request(app)
      .get('/api/reports/stock-ledger/export?format=csv')
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain('RM-FLOUR');

    const reportPdfRes = await request(app)
      .get('/api/reports/cost-per-packet/export?format=pdf')
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(reportPdfRes.status).toBe(200);
    expect(reportPdfRes.headers['content-type']).toContain('application/pdf');
  });

  it('supports Salesman offline order sync with idempotency', async () => {
    const [custRes, prodRes] = await Promise.all([
      request(app)
        .get('/api/customers')
        .set('Authorization', `Bearer ${salesmanToken}`),
      request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${salesmanToken}`),
    ]);
    const customerId = custRes.body.data[0]._id;
    const productId = prodRes.body.data[0]._id;

    const offlineId = 'OFFLINE-TEST-001';
    const sync1 = await request(app)
      .post('/api/orders/sync-offline')
      .set('Authorization', `Bearer ${salesmanToken}`)
      .send({
        orders: [
          {
            customerId,
            items: [{ productId, quantity: 10 }],
            status: 'SUBMITTED',
            offlineId,
          },
        ],
      });
    expect(sync1.status).toBe(200);
    expect(sync1.body.data.length).toBe(1);

    // Resend same offlineId -> idempotent (returns same order, no duplicate)
    const sync2 = await request(app)
      .post('/api/orders/sync-offline')
      .set('Authorization', `Bearer ${salesmanToken}`)
      .send({
        orders: [
          {
            customerId,
            items: [{ productId, quantity: 10 }],
            status: 'SUBMITTED',
            offlineId,
          },
        ],
      });
    expect(sync2.status).toBe(200);
    expect(sync2.body.data[0]._id).toBe(sync1.body.data[0]._id);
  });

  it('supports BOM scaling, live purchase receipt, production run, costing, invoice credit note, and all 17 reports', async () => {
    const [prodRes, matRes, supRes, bomRes, custRes] = await Promise.all([
      request(app).get('/api/products').set('Authorization', `Bearer ${ownerToken}`),
      request(app).get('/api/materials').set('Authorization', `Bearer ${ownerToken}`),
      request(app).get('/api/suppliers').set('Authorization', `Bearer ${ownerToken}`),
      request(app).get('/api/boms').set('Authorization', `Bearer ${prodToken}`),
      request(app).get('/api/customers').set('Authorization', `Bearer ${adminToken}`),
    ]);

    const murukku = prodRes.body.data.find((p: { sku: string }) => p.sku === 'FG-MRK-200');
    const flour = matRes.body.data.find((m: { code: string }) => m.code === 'RM-FLOUR');
    const supplier = supRes.body.data[0];
    const bom = bomRes.body.data[0];
    const distributorB = custRes.body.data.find((c: { stateCode: string }) => c.stateCode === '29');

    // BOM scaling preview for 0.5 batch
    const scaleRes = await request(app)
      .get(`/api/boms/${bom._id}/scale?batchSize=0.5`)
      .set('Authorization', `Bearer ${prodToken}`);
    expect(scaleRes.status).toBe(200);
    expect(scaleRes.body.data.scaled.expectedOutput).toBe(100);

    // Purchase order -> Pending -> Receive -> Weighted avg update
    const poRes = await request(app)
      .post('/api/purchases')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        supplierId: supplier._id,
        items: [{ materialId: flour._id, quantity: 20, rate: 46, gstRate: 0 }],
        receiveImmediately: false,
      });
    expect(poRes.status).toBe(201);
    expect(poRes.body.data.receiptStatus).toBe('PENDING');

    const recvRes = await request(app)
      .post(`/api/purchases/${poRes.body.data._id}/receive`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(recvRes.status).toBe(200);
    expect(recvRes.body.data.receiptStatus).toBe('RECEIVED');

    // Post a new production run (0.5 batch)
    const runRes = await request(app)
      .post('/api/production')
      .set('Authorization', `Bearer ${prodToken}`)
      .send({
        productId: murukku._id,
        bomId: bom._id,
        batchSize: 0.5,
        actualGoodOutput: 98,
        damagedPouches: 2,
        cartonsUsed: 4,
        labourCost: 600,
        powerCost: 300,
      });
    expect(runRes.status).toBe(201);
    expect(runRes.body.data.yieldVariancePct).toBe(-2);
    expect(runRes.body.data.costPerPacket).toBeGreaterThan(0);

    // Costing endpoint reflects new run
    const costingRes = await request(app)
      .get('/api/costing')
      .set('Authorization', `Bearer ${accountantToken}`);
    expect(costingRes.status).toBe(200);
    expect(costingRes.body.data.length).toBeGreaterThanOrEqual(2);

    // Inter-state invoice & credit note
    const invRes = await request(app)
      .post('/api/invoices')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        customerId: distributorB._id,
        items: [{ productId: murukku._id, quantity: 10, unitPrice: 50 }],
      });
    expect(invRes.status).toBe(201);
    expect(invRes.body.data.igstTotal).toBe(25);
    expect(invRes.body.data.grandTotal).toBe(525);

    const cnRes = await request(app)
      .post(`/api/invoices/${invRes.body.data._id}/credit-note`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Quality check test' });
    expect(cnRes.status).toBe(201);
    expect(cnRes.body.data.status).toBe('CREDIT_NOTE');

    // Verify all 17 reports return 200
    const reportSlugs = [
      'sales-register',
      'customer-sales',
      'product-sales',
      'gst-outward',
      'purchase-register',
      'raw-material-stock',
      'packaging-stock',
      'finished-goods-stock',
      'stock-ledger',
      'production-report',
      'planned-vs-actual',
      'yield-variance',
      'wastage-report',
      'cost-per-packet',
      'payments-collections',
      'outstanding-receivables',
      'receivables-ageing',
    ];
    for (const slug of reportSlugs) {
      const r = await request(app)
        .get(`/api/reports/${slug}`)
        .set('Authorization', `Bearer ${accountantToken}`);
      expect(r.status).toBe(200);
      expect(r.body.data.reportType).toBe(slug);
    }
  });
});
