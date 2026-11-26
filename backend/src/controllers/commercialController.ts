import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as salesOrderService from '../services/salesOrderService';
import * as invoiceService from '../services/invoiceService';
import * as dispatchService from '../services/dispatchService';
import * as paymentService from '../services/paymentService';
import * as reportService from '../services/reportService';
import { ProductionRun } from '../models/ProductionRun';
import { Product } from '../models/Product';
import { roundMoney } from '../utils/decimal';

export const getOrders = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesOrderService.listSalesOrders(
    req.query as Record<string, string>,
    req.user!
  );
  res.json({ success: true, data });
});

export const getOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesOrderService.getSalesOrderById(String(req.params.id), req.user!);
  res.json({ success: true, data });
});

export const createOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesOrderService.createSalesOrder(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const syncOfflineOrders = asyncHandler(async (req: Request, res: Response) => {
  const orders = Array.isArray(req.body.orders) ? req.body.orders : [];
  const synced = [];
  for (const o of orders) {
    const created = await salesOrderService.createSalesOrder(o, req.user!);
    synced.push(created);
  }
  res.json({ success: true, data: synced });
});

export const updateOrder = asyncHandler(async (req: Request, res: Response) => {
  const data = await salesOrderService.reviewOrUpdateOrder(
    String(req.params.id),
    req.body,
    req.user!
  );
  res.json({ success: true, data });
});

export const getInvoices = asyncHandler(async (req: Request, res: Response) => {
  const data = await invoiceService.listInvoices(req.query as Record<string, string>);
  res.json({ success: true, data });
});

export const getInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = await invoiceService.getInvoiceById(String(req.params.id));
  res.json({ success: true, data });
});

export const createInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = await invoiceService.createGstInvoice(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const cancelInvoice = asyncHandler(async (req: Request, res: Response) => {
  const data = await invoiceService.cancelInvoice(
    String(req.params.id),
    req.body.reason || 'Cancelled by admin',
    req.user!
  );
  res.json({ success: true, data });
});

export const createCreditNote = asyncHandler(async (req: Request, res: Response) => {
  const data = await invoiceService.createCreditNote(
    String(req.params.id),
    req.body.reason || 'Sales return / adjustment',
    req.user!
  );
  res.status(201).json({ success: true, data });
});

export const downloadInvoicePdf = asyncHandler(async (req: Request, res: Response) => {
  const { buffer, filename } = await invoiceService.generateInvoicePdfBuffer(
    String(req.params.id)
  );
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

export const getDispatches = asyncHandler(async (req: Request, res: Response) => {
  const data = await dispatchService.listDispatches(
    req.query as Record<string, string>
  );
  res.json({ success: true, data });
});

export const createDispatch = asyncHandler(async (req: Request, res: Response) => {
  const data = await dispatchService.createDispatch(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const updateDispatchStatus = asyncHandler(async (req: Request, res: Response) => {
  const data = await dispatchService.updateDeliveryStatus(
    String(req.params.id),
    req.body.deliveryStatus,
    req.user!
  );
  res.json({ success: true, data });
});

export const getPayments = asyncHandler(async (req: Request, res: Response) => {
  const data = await paymentService.listPayments(req.query as Record<string, string>);
  res.json({ success: true, data });
});

export const createPayment = asyncHandler(async (req: Request, res: Response) => {
  const data = await paymentService.recordPayment(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const getReceivables = asyncHandler(async (_req: Request, res: Response) => {
  const data = await paymentService.getReceivablesAndAgeing();
  res.json({ success: true, data });
});

export const getCostingOverview = asyncHandler(async (_req: Request, res: Response) => {
  const [runs, products] = await Promise.all([
    ProductionRun.find({ status: 'POSTED' }).sort({ productionDate: -1 }).lean(),
    Product.find({ isActive: true }).lean(),
  ]);
  const productPriceMap = new Map(products.map((p) => [String(p._id), p.sellingPrice]));

  const items = runs.map((r) => {
    const sellingPrice = productPriceMap.get(String(r.product)) ?? 50;
    const grossMarginPerPacket = roundMoney(sellingPrice - r.costPerPacket);
    const grossMarginPct =
      sellingPrice > 0
        ? roundMoney((grossMarginPerPacket / sellingPrice) * 100)
        : 0;
    return {
      productionRunId: String(r._id),
      productionNumber: r.productionNumber,
      productionDate: r.productionDate,
      productName: r.productName,
      actualGoodOutput: r.actualGoodOutput,
      materialCost: r.materialCost,
      packagingCost: r.packagingCost,
      labourCost: r.labourCost,
      powerCost: r.powerCost,
      otherOverheads: r.otherOverheads,
      totalProductionCost: r.totalProductionCost,
      costPerPacket: roundMoney(r.costPerPacket),
      exactCostPerPacket: r.costPerPacket,
      sellingPrice,
      grossMarginPerPacket,
      grossMarginPct,
      materialsBreakdown: r.materials,
    };
  });

  res.json({ success: true, data: items });
});

export const getReport = asyncHandler(async (req: Request, res: Response) => {
  const reportType = req.params.type as reportService.ReportType;
  const data = await reportService.generateReport(
    reportType,
    req.query as reportService.ReportFilters
  );
  res.json({ success: true, data });
});

export const downloadReport = asyncHandler(async (req: Request, res: Response) => {
  const reportType = req.params.type as reportService.ReportType;
  const format = String(req.query.format || 'excel').toLowerCase();
  const report = await reportService.generateReport(
    reportType,
    req.query as reportService.ReportFilters
  );

  if (format === 'csv') {
    const csv = reportService.exportReportCsv(report);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType}.csv"`);
    res.send(csv);
    return;
  }

  if (format === 'pdf') {
    const buffer = await reportService.exportReportPdf(report);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${reportType}.pdf"`);
    res.send(buffer);
    return;
  }

  const buffer = await reportService.exportReportExcel(report);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${reportType}.xlsx"`);
  res.send(buffer);
});

export const getAuditLogs = asyncHandler(async (req: Request, res: Response) => {
  const { entityType, action, search, page, limit } = req.query as Record<
    string,
    string
  >;
  const data = await reportService.listAuditLogs({
    entityType,
    action,
    search,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 25,
  });
  res.json({ success: true, data });
});
