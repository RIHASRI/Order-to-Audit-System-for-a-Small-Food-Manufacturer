import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as bomService from '../services/bomService';
import * as productionService from '../services/productionService';
import * as inventoryService from '../services/inventoryService';
import * as purchaseService from '../services/purchaseService';
import { exportReportCsv, exportReportExcel, generateReport } from '../services/reportService';
import { BOM } from '../models/BOM';
import { NotFoundError } from '../utils/errors';

export const getBoms = asyncHandler(async (req: Request, res: Response) => {
  const data = await bomService.listBoms(req.query.productId as string | undefined);
  res.json({ success: true, data });
});

export const createBom = asyncHandler(async (req: Request, res: Response) => {
  const data = await bomService.createBomVersion(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const previewBomScale = asyncHandler(async (req: Request, res: Response) => {
  const batchSize = Number(req.query.batchSize || 1);
  const bom = await BOM.findById(req.params.id).lean();
  if (!bom) throw new NotFoundError('BOM not found');
  const scaled = bomService.calculateScaledBomRequirements(bom, batchSize);
  res.json({ success: true, data: { bom, scaled } });
});

export const getProductionRuns = asyncHandler(async (req: Request, res: Response) => {
  const { productId, hasVarianceAlert, startDate, endDate, search } =
    req.query as Record<string, string>;
  const data = await productionService.listProductionRuns({
    productId,
    hasVarianceAlert:
      hasVarianceAlert === 'true'
        ? true
        : hasVarianceAlert === 'false'
        ? false
        : undefined,
    startDate,
    endDate,
    search,
  });
  res.json({ success: true, data });
});

export const getProductionRun = asyncHandler(async (req: Request, res: Response) => {
  const data = await productionService.getProductionRunById(String(req.params.id));
  res.json({ success: true, data });
});

export const createProductionRun = asyncHandler(async (req: Request, res: Response) => {
  const data = await productionService.postProductionRun(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const getInventory = asyncHandler(async (_req: Request, res: Response) => {
  const data = await inventoryService.getInventorySummary();
  res.json({ success: true, data });
});

export const getLedger = asyncHandler(async (req: Request, res: Response) => {
  const { itemType, itemId, movementType, search, startDate, endDate, page, limit } =
    req.query as Record<string, string>;
  const data = await inventoryService.getStockLedger({
    itemType,
    itemId,
    movementType,
    search,
    startDate,
    endDate,
    page: page ? Number(page) : 1,
    limit: limit ? Number(limit) : 25,
  });
  res.json({ success: true, data });
});

export const exportInventoryLedger = asyncHandler(async (req: Request, res: Response) => {
  const format = String(req.query.format || 'excel').toLowerCase();
  const report = await generateReport('stock-ledger', req.query as Record<string, string>);
  if (format === 'csv') {
    const csv = exportReportCsv(report);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="stock-ledger.csv"');
    res.send(csv);
    return;
  }
  const buffer = await exportReportExcel(report);
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', 'attachment; filename="stock-ledger.xlsx"');
  res.send(buffer);
});

export const postStockAdjustment = asyncHandler(async (req: Request, res: Response) => {
  const data = await inventoryService.recordManualAdjustment({
    ...req.body,
    userId: req.user!.id,
    userName: req.user!.name,
    userRole: req.user!.role,
  });
  res.status(201).json({ success: true, data });
});

export const getPurchases = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchaseService.listPurchases(
    req.query as Record<string, string>
  );
  res.json({ success: true, data });
});

export const createPurchase = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchaseService.createPurchaseOrder(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const receivePurchase = asyncHandler(async (req: Request, res: Response) => {
  const data = await purchaseService.receivePurchaseOrder(String(req.params.id), req.user!);
  res.json({ success: true, data });
});

export const updatePurchasePaymentStatus = asyncHandler(
  async (req: Request, res: Response) => {
    const data = await purchaseService.updatePurchasePayment(
      String(req.params.id),
      Number(req.body.paidAmount),
      req.user!
    );
    res.json({ success: true, data });
  }
);
