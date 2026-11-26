import dayjs from 'dayjs';
import { SalesOrder } from '../models/SalesOrder';
import { Invoice } from '../models/Invoice';
import { ProductionRun } from '../models/ProductionRun';
import { Material } from '../models/Material';
import { Product } from '../models/Product';
import { Payment } from '../models/Payment';
import { PurchaseOrder } from '../models/PurchaseOrder';
import { StockLedger } from '../models/StockLedger';
import { AuditLog } from '../models/AuditLog';
import { Notification } from '../models/Notification';
import { roundMoney, roundQty } from '../utils/decimal';
import { getReceivablesAndAgeing } from './paymentService';
import { AuthUser } from '../middleware/auth';

export async function getDashboardData(
  actor: AuthUser,
  filters?: { startDate?: string; endDate?: string }
) {
  const todayStart = dayjs().startOf('day').toDate();
  const todayEnd = dayjs().endOf('day').toDate();

  const dateFilter: Record<string, unknown> = {};
  if (filters?.startDate || filters?.endDate) {
    const range: Record<string, Date> = {};
    if (filters.startDate) range.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    dateFilter.$range = range;
  }

  const invMatch: Record<string, unknown> = { status: 'ACTIVE' };
  const orderMatch: Record<string, unknown> = {};
  const prodMatch: Record<string, unknown> = { status: 'POSTED' };
  const paymentMatch: Record<string, unknown> = {};

  if (actor.role === 'SALESMAN') {
    orderMatch.salesman = actor.id;
  }

  if (dateFilter.$range) {
    invMatch.invoiceDate = dateFilter.$range;
    orderMatch.orderDate = dateFilter.$range;
    prodMatch.productionDate = dateFilter.$range;
    paymentMatch.paymentDate = dateFilter.$range;
  }

  const [
    invoices,
    orders,
    productionRuns,
    materials,
    products,
    payments,
    purchases,
    receivables,
    recentLedger,
    recentAuditLogs,
    notifications,
  ] = await Promise.all([
    Invoice.find(invMatch).sort({ invoiceDate: -1 }).lean(),
    SalesOrder.find(orderMatch).sort({ orderDate: -1 }).lean(),
    ProductionRun.find(prodMatch).sort({ productionDate: -1 }).lean(),
    Material.find({ isActive: true }).lean(),
    Product.find({ isActive: true }).lean(),
    Payment.find(paymentMatch).sort({ paymentDate: -1 }).lean(),
    PurchaseOrder.find().sort({ purchaseDate: -1 }).lean(),
    getReceivablesAndAgeing(),
    StockLedger.find().sort({ date: -1, createdAt: -1 }).limit(12).lean(),
    AuditLog.find().sort({ timestamp: -1 }).limit(10).lean(),
    Notification.find({ targetRoles: actor.role })
      .sort({ createdAt: -1 })
      .limit(15)
      .lean(),
  ]);

  const todaysSales = roundMoney(
    invoices
      .filter((i) => i.invoiceDate >= todayStart && i.invoiceDate <= todayEnd)
      .reduce((s, i) => s + i.grandTotal, 0)
  );
  const totalRevenue = roundMoney(invoices.reduce((s, i) => s + i.grandTotal, 0));
  const totalOrders = orders.length;
  const pendingOrders = orders.filter((o) =>
    ['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PARTIALLY_DISPATCHED'].includes(
      o.status
    )
  ).length;
  const pendingApprovals = orders.filter((o) =>
    ['SUBMITTED', 'UNDER_REVIEW'].includes(o.status)
  );

  const productionCompletedQty = roundQty(
    productionRuns.reduce((s, r) => s + r.actualGoodOutput, 0)
  );
  const finishedGoodsAvailable = roundQty(
    products.reduce((s, p) => s + p.currentStock, 0)
  );
  const rawMaterialStockValue = roundMoney(
    materials
      .filter((m) => m.category === 'RAW_MATERIAL')
      .reduce((s, m) => s + m.currentStock * m.weightedAvgRate, 0)
  );
  const packagingStockValue = roundMoney(
    materials
      .filter((m) => m.category === 'PACKAGING')
      .reduce((s, m) => s + m.currentStock * m.weightedAvgRate, 0)
  );

  const totalProdCost = productionRuns.reduce((s, r) => s + r.totalProductionCost, 0);
  const avgProductionCostPerPacket =
    productionCompletedQty > 0
      ? roundMoney(totalProdCost / productionCompletedQty)
      : 0;

  const varianceAlertRuns = productionRuns.filter((r) => r.hasVarianceAlert);

  // Charts: Monthly sales trend
  const monthlySalesMap = new Map<string, { month: string; sales: number; collections: number }>();
  for (const inv of invoices) {
    const key = dayjs(inv.invoiceDate).format('MMM YYYY');
    if (!monthlySalesMap.has(key)) {
      monthlySalesMap.set(key, { month: key, sales: 0, collections: 0 });
    }
    monthlySalesMap.get(key)!.sales = roundMoney(
      monthlySalesMap.get(key)!.sales + inv.grandTotal
    );
  }
  for (const pay of payments) {
    const key = dayjs(pay.paymentDate).format('MMM YYYY');
    if (!monthlySalesMap.has(key)) {
      monthlySalesMap.set(key, { month: key, sales: 0, collections: 0 });
    }
    monthlySalesMap.get(key)!.collections = roundMoney(
      monthlySalesMap.get(key)!.collections + pay.amount
    );
  }

  // Product-wise sales
  const productSalesMap = new Map<
    string,
    { productName: string; quantity: number; revenue: number }
  >();
  for (const inv of invoices) {
    for (const item of inv.items) {
      if (!productSalesMap.has(item.productName)) {
        productSalesMap.set(item.productName, {
          productName: item.productName,
          quantity: 0,
          revenue: 0,
        });
      }
      const entry = productSalesMap.get(item.productName)!;
      entry.quantity = roundQty(entry.quantity + item.quantity);
      entry.revenue = roundMoney(entry.revenue + item.lineTotal);
    }
  }
  const topSellingProducts = Array.from(productSalesMap.values()).sort(
    (a, b) => b.revenue - a.revenue
  );

  // Production vs target
  const productionVsTarget = productionRuns
    .slice(0, 10)
    .reverse()
    .map((r) => ({
      run: r.productionNumber,
      product: r.productName,
      expected: r.expectedOutput,
      actual: r.actualGoodOutput,
      yieldVariancePct: r.yieldVariancePct,
    }));

  // Raw material consumption chart
  const matConsumptionMap = new Map<
    string,
    { material: string; planned: number; actual: number; unit: string }
  >();
  for (const r of productionRuns) {
    for (const m of r.materials) {
      if (!matConsumptionMap.has(m.materialName)) {
        matConsumptionMap.set(m.materialName, {
          material: m.materialName,
          planned: 0,
          actual: 0,
          unit: m.unit,
        });
      }
      const agg = matConsumptionMap.get(m.materialName)!;
      agg.planned = roundQty(agg.planned + m.plannedQty);
      agg.actual = roundQty(agg.actual + m.actualQty);
    }
  }

  // Inventory movement chart (by movement type)
  const movementMap = new Map<string, { type: string; inQty: number; outQty: number }>();
  for (const l of recentLedger) {
    const label = l.movementType.replace(/_/g, ' ');
    if (!movementMap.has(label)) {
      movementMap.set(label, { type: label, inQty: 0, outQty: 0 });
    }
    const agg = movementMap.get(label)!;
    if (l.direction === 'IN') agg.inQty = roundQty(agg.inQty + l.quantity);
    else agg.outQty = roundQty(agg.outQty + l.quantity);
  }

  // Collection trends by date
  const collectionTrendMap = new Map<string, { date: string; amount: number }>();
  for (const p of [...payments].reverse()) {
    const d = dayjs(p.paymentDate).format('DD MMM');
    if (!collectionTrendMap.has(d)) collectionTrendMap.set(d, { date: d, amount: 0 });
    collectionTrendMap.get(d)!.amount = roundMoney(
      collectionTrendMap.get(d)!.amount + p.amount
    );
  }

  const lowStockWarnings = [
    ...materials
      .filter((m) => m.currentStock <= m.reorderLevel)
      .map((m) => ({
        id: String(m._id),
        name: m.name,
        code: m.code,
        category: m.category,
        currentStock: m.currentStock,
        reorderLevel: m.reorderLevel,
        unit: m.unit,
      })),
    ...products
      .filter((p) => p.currentStock <= p.reorderLevel)
      .map((p) => ({
        id: String(p._id),
        name: p.name,
        code: p.sku,
        category: 'FINISHED_GOOD',
        currentStock: p.currentStock,
        reorderLevel: p.reorderLevel,
        unit: p.unit,
      })),
  ];

  const totalPurchaseSpend = roundMoney(
    purchases.reduce((s, p) => s + p.grandTotal, 0)
  );
  const totalCollections = roundMoney(payments.reduce((s, p) => s + p.amount, 0));

  return {
    role: actor.role,
    summaryCards: {
      todaysSales,
      totalOrders,
      pendingOrders,
      productionCompleted: productionCompletedQty,
      finishedGoodsAvailable,
      rawMaterialStockValue,
      packagingStockValue,
      revenue: totalRevenue,
      outstandingReceivables: receivables.summary.totalReceivables,
      avgProductionCostPerPacket,
      productionVarianceAlerts: varianceAlertRuns.length,
      totalPurchaseSpend,
      totalCollections,
      lowStockCount: lowStockWarnings.length,
    },
    charts: {
      monthlySalesTrend: Array.from(monthlySalesMap.values()),
      productWiseSales: topSellingProducts,
      productionVsTarget,
      rawMaterialConsumption: Array.from(matConsumptionMap.values()),
      inventoryMovement: Array.from(movementMap.values()),
      collectionTrends: Array.from(collectionTrendMap.values()),
    },
    lists: {
      recentOrders: orders.slice(0, 8),
      recentProductionRuns: productionRuns.slice(0, 8),
      lowStockWarnings,
      pendingApprovals: pendingApprovals.slice(0, 8),
      topSellingProducts: topSellingProducts.slice(0, 6),
      customerOutstandingBalances: receivables.customers.slice(0, 8),
      varianceAlertRuns: varianceAlertRuns.slice(0, 6),
      recentAuditLogs,
      recentPurchases: purchases.slice(0, 6),
    },
    notifications,
  };
}
