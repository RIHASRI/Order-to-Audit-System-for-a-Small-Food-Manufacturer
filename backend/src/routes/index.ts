import { Router } from 'express';
import { authenticate, authorize } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import * as schemas from '../validators/schemas';
import * as authDash from '../controllers/authDashboardController';
import * as master from '../controllers/masterController';
import * as ops from '../controllers/operationsController';
import * as comm from '../controllers/commercialController';

const router = Router();

// Public Auth & Demo Credential Reference
router.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', service: 'FactoryFlow API' });
});
router.post('/auth/login', validateBody(schemas.loginSchema), authDash.login);
router.post('/auth/logout', authDash.logout);
router.get('/auth/demo-accounts', authDash.getDemoAccounts);

// Protected Routes
router.use(authenticate);

router.get('/auth/me', authDash.getMe);
router.get('/users', authorize('OWNER', 'ADMIN'), authDash.listUsers);
router.post('/users', authorize('OWNER'), authDash.registerUser);

// Dashboard, Search, Notifications (all authenticated roles)
router.get('/dashboard', authDash.dashboard);
router.get('/search', authDash.globalSearch);
router.get('/notifications', authDash.getNotifications);
router.patch('/notifications/:id/read', authDash.markNotificationRead);

// Master Data: Products
router.get('/products', master.getProducts);
router.post(
  '/products',
  authorize('OWNER', 'ADMIN'),
  validateBody(schemas.productSchema),
  master.postProduct
);
router.put('/products/:id', authorize('OWNER', 'ADMIN'), master.putProduct);
router.delete('/products/:id', authorize('OWNER', 'ADMIN'), master.removeProduct);

// Master Data: Customers
router.get(
  '/customers',
  authorize('OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT'),
  master.getCustomers
);
router.post(
  '/customers',
  authorize('OWNER', 'ADMIN'),
  validateBody(schemas.customerSchema),
  master.postCustomer
);
router.put('/customers/:id', authorize('OWNER', 'ADMIN'), master.putCustomer);
router.delete('/customers/:id', authorize('OWNER', 'ADMIN'), master.removeCustomer);

// Master Data: Suppliers
router.get(
  '/suppliers',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  master.getSuppliers
);
router.post(
  '/suppliers',
  authorize('OWNER', 'ADMIN'),
  validateBody(schemas.supplierSchema),
  master.postSupplier
);
router.put('/suppliers/:id', authorize('OWNER', 'ADMIN'), master.putSupplier);
router.delete('/suppliers/:id', authorize('OWNER', 'ADMIN'), master.removeSupplier);

// Master Data: Materials (Raw & Packaging)
router.get(
  '/materials',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  master.getMaterials
);
router.post(
  '/materials',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR'),
  validateBody(schemas.materialSchema),
  master.postMaterial
);
router.put(
  '/materials/:id',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR'),
  master.putMaterial
);
router.delete('/materials/:id', authorize('OWNER', 'ADMIN'), master.removeMaterial);

// BOM Management
router.get(
  '/boms',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  ops.getBoms
);
router.get(
  '/boms/:id/scale',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  ops.previewBomScale
);
router.post(
  '/boms',
  authorize('OWNER', 'PRODUCTION_SUPERVISOR'),
  validateBody(schemas.bomSchema),
  ops.createBom
);

// Production Management
router.get(
  '/production',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  ops.getProductionRuns
);
router.get(
  '/production/:id',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  ops.getProductionRun
);
router.post(
  '/production',
  authorize('OWNER', 'PRODUCTION_SUPERVISOR'),
  validateBody(schemas.productionRunSchema),
  ops.createProductionRun
);

// Inventory & Stock Ledger
router.get(
  '/inventory/summary',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT', 'SALESMAN'),
  ops.getInventory
);
router.get(
  '/inventory/ledger',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  ops.getLedger
);
router.get(
  '/inventory/export',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  ops.exportInventoryLedger
);
router.post(
  '/inventory/adjustment',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR'),
  validateBody(schemas.stockAdjustmentSchema),
  ops.postStockAdjustment
);

// Purchase Management
router.get(
  '/purchases',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  ops.getPurchases
);
router.post(
  '/purchases',
  authorize('OWNER', 'ADMIN'),
  validateBody(schemas.purchaseOrderSchema),
  ops.createPurchase
);
router.post('/purchases/:id/receive', authorize('OWNER', 'ADMIN'), ops.receivePurchase);
router.patch(
  '/purchases/:id/payment',
  authorize('OWNER', 'ADMIN'),
  ops.updatePurchasePaymentStatus
);

// Sales Orders (Salesman + Admin + Owner + Accountant read)
router.get(
  '/orders',
  authorize('OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT'),
  comm.getOrders
);
router.get(
  '/orders/:id',
  authorize('OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT'),
  comm.getOrder
);
router.post(
  '/orders',
  authorize('OWNER', 'ADMIN', 'SALESMAN'),
  validateBody(schemas.salesOrderSchema),
  comm.createOrder
);
router.post(
  '/orders/sync-offline',
  authorize('OWNER', 'ADMIN', 'SALESMAN'),
  comm.syncOfflineOrders
);
router.patch(
  '/orders/:id',
  authorize('OWNER', 'ADMIN', 'SALESMAN'),
  validateBody(schemas.orderReviewSchema),
  comm.updateOrder
);

// GST Invoicing
router.get(
  '/invoices',
  authorize('OWNER', 'ADMIN', 'ACCOUNTANT', 'SALESMAN'),
  comm.getInvoices
);
router.get(
  '/invoices/:id',
  authorize('OWNER', 'ADMIN', 'ACCOUNTANT', 'SALESMAN'),
  comm.getInvoice
);
router.get(
  '/invoices/:id/pdf',
  authorize('OWNER', 'ADMIN', 'ACCOUNTANT', 'SALESMAN'),
  comm.downloadInvoicePdf
);
router.post(
  '/invoices',
  authorize('OWNER', 'ADMIN'),
  validateBody(schemas.createInvoiceSchema),
  comm.createInvoice
);
router.post('/invoices/:id/cancel', authorize('OWNER', 'ADMIN'), comm.cancelInvoice);
router.post(
  '/invoices/:id/credit-note',
  authorize('OWNER', 'ADMIN'),
  comm.createCreditNote
);

// Dispatch Management
router.get(
  '/dispatches',
  authorize('OWNER', 'ADMIN', 'ACCOUNTANT', 'SALESMAN'),
  comm.getDispatches
);
router.post(
  '/dispatches',
  authorize('OWNER', 'ADMIN'),
  validateBody(schemas.createDispatchSchema),
  comm.createDispatch
);
router.patch(
  '/dispatches/:id/status',
  authorize('OWNER', 'ADMIN'),
  comm.updateDispatchStatus
);

// Payments & Receivables Ageing
router.get(
  '/payments',
  authorize('OWNER', 'ADMIN', 'ACCOUNTANT'),
  comm.getPayments
);
router.post(
  '/payments',
  authorize('OWNER', 'ADMIN'),
  validateBody(schemas.recordPaymentSchema),
  comm.createPayment
);
router.get(
  '/receivables',
  authorize('OWNER', 'ADMIN', 'ACCOUNTANT', 'SALESMAN'),
  comm.getReceivables
);

// Costing Module
router.get(
  '/costing',
  authorize('OWNER', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT', 'ADMIN'),
  comm.getCostingOverview
);

// Reports & Audit Module
router.get(
  '/reports/:type',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  comm.getReport
);
router.get(
  '/reports/:type/export',
  authorize('OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'),
  comm.downloadReport
);
router.get('/audit-logs', authorize('OWNER', 'ACCOUNTANT', 'ADMIN'), comm.getAuditLogs);

export default router;
