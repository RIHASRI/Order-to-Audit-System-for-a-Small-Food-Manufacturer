import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import dayjs from 'dayjs';
import { Invoice } from '../models/Invoice';
import { PurchaseOrder } from '../models/PurchaseOrder';
import { ProductionRun } from '../models/ProductionRun';
import { StockLedger } from '../models/StockLedger';
import { Payment } from '../models/Payment';
import { AuditLog } from '../models/AuditLog';
import { getInventorySummary } from './inventoryService';
import { getReceivablesAndAgeing } from './paymentService';
import { roundMoney, roundQty } from '../utils/decimal';
import { NotFoundError } from '../utils/errors';

export type ReportType =
  | 'sales-register'
  | 'customer-sales'
  | 'product-sales'
  | 'gst-outward'
  | 'purchase-register'
  | 'raw-material-stock'
  | 'packaging-stock'
  | 'finished-goods-stock'
  | 'stock-ledger'
  | 'production-report'
  | 'planned-vs-actual'
  | 'yield-variance'
  | 'wastage-report'
  | 'cost-per-packet'
  | 'payments-collections'
  | 'outstanding-receivables'
  | 'receivables-ageing';

export interface ReportFilters {
  startDate?: string;
  endDate?: string;
  customerId?: string;
  productId?: string;
  search?: string;
}

export interface ReportResult {
  reportType: ReportType;
  title: string;
  columns: Array<{ key: string; label: string; format?: 'currency' | 'number' | 'percent' | 'date' }>;
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
}

function buildDateQuery(startDate?: string, endDate?: string) {
  if (!startDate && !endDate) return undefined;
  const range: Record<string, Date> = {};
  if (startDate) range.$gte = new Date(startDate);
  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    range.$lte = end;
  }
  return range;
}

export async function generateReport(
  reportType: ReportType,
  filters: ReportFilters = {}
): Promise<ReportResult> {
  const searchLower = (filters.search || '').trim().toLowerCase();

  const filterSearch = (rows: Array<Record<string, unknown>>) => {
    if (!searchLower) return rows;
    return rows.filter((row) =>
      Object.values(row).some((val) =>
        String(val ?? '').toLowerCase().includes(searchLower)
      )
    );
  };

  switch (reportType) {
    case 'sales-register': {
      const q: Record<string, unknown> = { status: 'ACTIVE' };
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.invoiceDate = dr;
      if (filters.customerId) q.customer = filters.customerId;
      const invoices = await Invoice.find(q).sort({ invoiceDate: -1 }).lean();
      const rows = filterSearch(
        invoices
          .filter(
            (inv) =>
              !filters.productId ||
              inv.items.some((i) => String(i.product) === filters.productId)
          )
          .map((inv) => ({
            invoiceNumber: inv.invoiceNumber,
            date: dayjs(inv.invoiceDate).format('YYYY-MM-DD'),
            customerName: inv.customerSnapshot.name,
            placeOfSupply: inv.placeOfSupply,
            taxableValue: inv.taxableValue,
            cgst: inv.cgstTotal,
            sgst: inv.sgstTotal,
            igst: inv.igstTotal,
            grandTotal: inv.grandTotal,
            paidAmount: inv.paidAmount,
            outstanding: roundMoney(inv.grandTotal - inv.paidAmount),
          }))
      );
      return {
        reportType,
        title: 'Sales Register',
        columns: [
          { key: 'invoiceNumber', label: 'Invoice No' },
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'customerName', label: 'Customer' },
          { key: 'placeOfSupply', label: 'Place of Supply' },
          { key: 'taxableValue', label: 'Taxable (₹)', format: 'currency' },
          { key: 'cgst', label: 'CGST (₹)', format: 'currency' },
          { key: 'sgst', label: 'SGST (₹)', format: 'currency' },
          { key: 'igst', label: 'IGST (₹)', format: 'currency' },
          { key: 'grandTotal', label: 'Total (₹)', format: 'currency' },
          { key: 'paidAmount', label: 'Paid (₹)', format: 'currency' },
          { key: 'outstanding', label: 'Balance (₹)', format: 'currency' },
        ],
        rows,
        totals: {
          taxableValue: roundMoney(rows.reduce((s, r) => s + Number(r.taxableValue || 0), 0)),
          grandTotal: roundMoney(rows.reduce((s, r) => s + Number(r.grandTotal || 0), 0)),
          outstanding: roundMoney(rows.reduce((s, r) => s + Number(r.outstanding || 0), 0)),
        },
      };
    }

    case 'customer-sales': {
      const q: Record<string, unknown> = { status: 'ACTIVE' };
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.invoiceDate = dr;
      if (filters.customerId) q.customer = filters.customerId;
      const invoices = await Invoice.find(q).lean();
      const map = new Map<string, Record<string, unknown>>();
      for (const inv of invoices) {
        const key = String(inv.customer);
        if (!map.has(key)) {
          map.set(key, {
            customerName: inv.customerSnapshot.name,
            state: inv.customerSnapshot.state,
            gstin: inv.customerSnapshot.gstin || 'Unregistered',
            invoiceCount: 0,
            taxableValue: 0,
            totalTax: 0,
            grandTotal: 0,
            paidAmount: 0,
          });
        }
        const agg = map.get(key)!;
        agg.invoiceCount = Number(agg.invoiceCount) + 1;
        agg.taxableValue = roundMoney(Number(agg.taxableValue) + inv.taxableValue);
        agg.totalTax = roundMoney(
          Number(agg.totalTax) + inv.cgstTotal + inv.sgstTotal + inv.igstTotal
        );
        agg.grandTotal = roundMoney(Number(agg.grandTotal) + inv.grandTotal);
        agg.paidAmount = roundMoney(Number(agg.paidAmount) + inv.paidAmount);
      }
      const rows = filterSearch(Array.from(map.values()));
      return {
        reportType,
        title: 'Customer-Wise Sales Summary',
        columns: [
          { key: 'customerName', label: 'Customer' },
          { key: 'state', label: 'State' },
          { key: 'gstin', label: 'GSTIN' },
          { key: 'invoiceCount', label: 'Invoices', format: 'number' },
          { key: 'taxableValue', label: 'Taxable (₹)', format: 'currency' },
          { key: 'totalTax', label: 'Total GST (₹)', format: 'currency' },
          { key: 'grandTotal', label: 'Total Sales (₹)', format: 'currency' },
          { key: 'paidAmount', label: 'Collected (₹)', format: 'currency' },
        ],
        rows,
      };
    }

    case 'product-sales': {
      const q: Record<string, unknown> = { status: 'ACTIVE' };
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.invoiceDate = dr;
      if (filters.customerId) q.customer = filters.customerId;
      const invoices = await Invoice.find(q).lean();
      const map = new Map<string, Record<string, unknown>>();
      for (const inv of invoices) {
        for (const item of inv.items) {
          if (filters.productId && String(item.product) !== filters.productId) continue;
          const key = String(item.product);
          if (!map.has(key)) {
            map.set(key, {
              sku: item.sku,
              productName: item.productName,
              hsnCode: item.hsnCode,
              unit: item.unit,
              quantitySold: 0,
              taxableValue: 0,
              totalTax: 0,
              totalRevenue: 0,
            });
          }
          const agg = map.get(key)!;
          agg.quantitySold = roundQty(Number(agg.quantitySold) + item.quantity);
          agg.taxableValue = roundMoney(Number(agg.taxableValue) + item.taxableValue);
          agg.totalTax = roundMoney(
            Number(agg.totalTax) + item.cgstAmount + item.sgstAmount + item.igstAmount
          );
          agg.totalRevenue = roundMoney(Number(agg.totalRevenue) + item.lineTotal);
        }
      }
      const rows = filterSearch(Array.from(map.values()));
      return {
        reportType,
        title: 'Product-Wise Sales Summary',
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'productName', label: 'Product' },
          { key: 'hsnCode', label: 'HSN' },
          { key: 'quantitySold', label: 'Qty Sold', format: 'number' },
          { key: 'unit', label: 'Unit' },
          { key: 'taxableValue', label: 'Taxable (₹)', format: 'currency' },
          { key: 'totalTax', label: 'GST (₹)', format: 'currency' },
          { key: 'totalRevenue', label: 'Revenue (₹)', format: 'currency' },
        ],
        rows,
      };
    }

    case 'gst-outward': {
      const q: Record<string, unknown> = { status: { $in: ['ACTIVE', 'CREDIT_NOTE'] } };
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.invoiceDate = dr;
      if (filters.customerId) q.customer = filters.customerId;
      const invoices = await Invoice.find(q).sort({ invoiceDate: -1 }).lean();
      const rows = filterSearch(
        invoices.map((inv) => ({
          docType: inv.status === 'CREDIT_NOTE' ? 'Credit Note' : 'Tax Invoice',
          invoiceNumber: inv.invoiceNumber,
          date: dayjs(inv.invoiceDate).format('YYYY-MM-DD'),
          customerName: inv.customerSnapshot.name,
          customerGstin: inv.customerSnapshot.gstin || 'Unregistered',
          placeOfSupply: inv.placeOfSupply,
          supplyType: inv.isInterState ? 'Inter-State (IGST)' : 'Intra-State (CGST+SGST)',
          taxableValue: inv.taxableValue,
          cgst: inv.cgstTotal,
          sgst: inv.sgstTotal,
          igst: inv.igstTotal,
          totalTax: roundMoney(inv.cgstTotal + inv.sgstTotal + inv.igstTotal),
          invoiceTotal: inv.grandTotal,
        }))
      );
      return {
        reportType,
        title: 'GST Outward Supply Summary (GSTR-1 Ready)',
        columns: [
          { key: 'docType', label: 'Doc Type' },
          { key: 'invoiceNumber', label: 'Document No' },
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'customerName', label: 'Recipient' },
          { key: 'customerGstin', label: 'Recipient GSTIN' },
          { key: 'placeOfSupply', label: 'Place of Supply' },
          { key: 'supplyType', label: 'Supply Type' },
          { key: 'taxableValue', label: 'Taxable (₹)', format: 'currency' },
          { key: 'cgst', label: 'CGST (₹)', format: 'currency' },
          { key: 'sgst', label: 'SGST (₹)', format: 'currency' },
          { key: 'igst', label: 'IGST (₹)', format: 'currency' },
          { key: 'totalTax', label: 'Total GST (₹)', format: 'currency' },
          { key: 'invoiceTotal', label: 'Grand Total (₹)', format: 'currency' },
        ],
        rows,
      };
    }

    case 'purchase-register': {
      const q: Record<string, unknown> = {};
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.purchaseDate = dr;
      const purchases = await PurchaseOrder.find(q).sort({ purchaseDate: -1 }).lean();
      const rows = filterSearch(
        purchases.flatMap((po) =>
          po.items.map((item) => ({
            poNumber: po.poNumber,
            date: dayjs(po.purchaseDate).format('YYYY-MM-DD'),
            supplierName: po.supplierName,
            materialName: item.materialName,
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            taxAmount: item.taxAmount,
            totalAmount: item.totalAmount,
            receiptStatus: po.receiptStatus,
            paymentStatus: po.paymentStatus,
          }))
        )
      );
      return {
        reportType,
        title: 'Purchase Register',
        columns: [
          { key: 'poNumber', label: 'PO No' },
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'supplierName', label: 'Supplier' },
          { key: 'materialName', label: 'Material' },
          { key: 'quantity', label: 'Qty', format: 'number' },
          { key: 'unit', label: 'Unit' },
          { key: 'rate', label: 'Rate (₹)', format: 'currency' },
          { key: 'taxAmount', label: 'Tax (₹)', format: 'currency' },
          { key: 'totalAmount', label: 'Total (₹)', format: 'currency' },
          { key: 'receiptStatus', label: 'Receipt' },
          { key: 'paymentStatus', label: 'Payment' },
        ],
        rows,
      };
    }

    case 'raw-material-stock': {
      const inv = await getInventorySummary();
      const rows = filterSearch(
        inv.rawMaterials.map((m) => ({
          code: m.code,
          name: m.name,
          unit: m.unit,
          opening: m.reconciliation.opening,
          receipts: m.reconciliation.receipts,
          issues: m.reconciliation.issues,
          closingStock: m.currentStock,
          weightedAvgRate: m.weightedAvgRate,
          stockValue: m.stockValue,
          reorderLevel: m.reorderLevel,
          status: m.isLowStock ? 'LOW STOCK' : 'OK',
        }))
      );
      return {
        reportType,
        title: 'Raw Material Stock Summary',
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Raw Material' },
          { key: 'unit', label: 'Unit' },
          { key: 'opening', label: 'Opening', format: 'number' },
          { key: 'receipts', label: 'Receipts', format: 'number' },
          { key: 'issues', label: 'Issues', format: 'number' },
          { key: 'closingStock', label: 'Closing Stock', format: 'number' },
          { key: 'weightedAvgRate', label: 'Wtd Avg Rate (₹)', format: 'currency' },
          { key: 'stockValue', label: 'Valuation (₹)', format: 'currency' },
          { key: 'status', label: 'Status' },
        ],
        rows,
      };
    }

    case 'packaging-stock': {
      const inv = await getInventorySummary();
      const rows = filterSearch(
        inv.packagingMaterials.map((m) => ({
          code: m.code,
          name: m.name,
          unit: m.unit,
          opening: m.reconciliation.opening,
          receipts: m.reconciliation.receipts,
          issues: m.reconciliation.issues,
          closingStock: m.currentStock,
          weightedAvgRate: m.weightedAvgRate,
          stockValue: m.stockValue,
          reorderLevel: m.reorderLevel,
          status: m.isLowStock ? 'LOW STOCK' : 'OK',
        }))
      );
      return {
        reportType,
        title: 'Packaging Material Stock Summary',
        columns: [
          { key: 'code', label: 'Code' },
          { key: 'name', label: 'Packaging Item' },
          { key: 'unit', label: 'Unit' },
          { key: 'opening', label: 'Opening', format: 'number' },
          { key: 'receipts', label: 'Receipts', format: 'number' },
          { key: 'issues', label: 'Issues', format: 'number' },
          { key: 'closingStock', label: 'Closing Stock', format: 'number' },
          { key: 'weightedAvgRate', label: 'Unit Rate (₹)', format: 'currency' },
          { key: 'stockValue', label: 'Valuation (₹)', format: 'currency' },
          { key: 'status', label: 'Status' },
        ],
        rows,
      };
    }

    case 'finished-goods-stock': {
      const inv = await getInventorySummary();
      const rows = filterSearch(
        inv.finishedGoods
          .filter((p) => !filters.productId || String(p._id) === filters.productId)
          .map((p) => ({
            sku: p.sku,
            name: p.name,
            packSize: p.packSize,
            unit: p.unit,
            opening: p.reconciliation.opening,
            produced: p.reconciliation.receipts,
            dispatched: p.reconciliation.sales,
            closingStock: p.currentStock,
            sellingPrice: p.sellingPrice,
            retailValue: p.retailValue,
            status: p.isLowStock ? 'LOW STOCK' : 'OK',
          }))
      );
      return {
        reportType,
        title: 'Finished Goods Stock Summary',
        columns: [
          { key: 'sku', label: 'SKU' },
          { key: 'name', label: 'Product' },
          { key: 'packSize', label: 'Pack Size' },
          { key: 'opening', label: 'Opening', format: 'number' },
          { key: 'produced', label: 'Produced', format: 'number' },
          { key: 'dispatched', label: 'Dispatched', format: 'number' },
          { key: 'closingStock', label: 'Closing Stock', format: 'number' },
          { key: 'sellingPrice', label: 'Selling Price (₹)', format: 'currency' },
          { key: 'retailValue', label: 'Retail Value (₹)', format: 'currency' },
          { key: 'status', label: 'Status' },
        ],
        rows,
      };
    }

    case 'stock-ledger': {
      const q: Record<string, unknown> = {};
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.date = dr;
      if (filters.productId) q.itemId = filters.productId;
      const entries = await StockLedger.find(q).sort({ date: -1, createdAt: -1 }).lean();
      const rows = filterSearch(
        entries.map((e) => ({
          date: dayjs(e.date).format('YYYY-MM-DD HH:mm'),
          itemCode: e.itemCode,
          itemName: e.itemName,
          itemType: e.itemType,
          movementType: e.movementType,
          direction: e.direction,
          quantity: e.quantity,
          unit: e.unit,
          previousBalance: e.previousBalance,
          newBalance: e.newBalance,
          sourceDocNumber: e.sourceDocNumber,
          userName: e.userName,
        }))
      );
      return {
        reportType,
        title: 'Detailed Stock Ledger',
        columns: [
          { key: 'date', label: 'Date' },
          { key: 'itemCode', label: 'Code' },
          { key: 'itemName', label: 'Item' },
          { key: 'itemType', label: 'Category' },
          { key: 'movementType', label: 'Movement Type' },
          { key: 'direction', label: 'In/Out' },
          { key: 'quantity', label: 'Qty', format: 'number' },
          { key: 'unit', label: 'Unit' },
          { key: 'previousBalance', label: 'Prev Bal', format: 'number' },
          { key: 'newBalance', label: 'New Bal', format: 'number' },
          { key: 'sourceDocNumber', label: 'Source Doc' },
          { key: 'userName', label: 'User' },
        ],
        rows,
      };
    }

    case 'production-report':
    case 'yield-variance':
    case 'wastage-report':
    case 'cost-per-packet': {
      const q: Record<string, unknown> = {};
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.productionDate = dr;
      if (filters.productId) q.product = filters.productId;
      const runs = await ProductionRun.find(q).sort({ productionDate: -1 }).lean();

      if (reportType === 'production-report') {
        const rows = filterSearch(
          runs.map((r) => ({
            productionNumber: r.productionNumber,
            date: dayjs(r.productionDate).format('YYYY-MM-DD'),
            productName: r.productName,
            batchSize: r.batchSize,
            expectedOutput: r.expectedOutput,
            actualGoodOutput: r.actualGoodOutput,
            yieldVariancePct: r.yieldVariancePct,
            totalCost: r.totalProductionCost,
            costPerPacket: r.costPerPacket,
            supervisorName: r.supervisorName,
            alert: r.hasVarianceAlert ? 'ALERT (>3%)' : 'OK',
          }))
        );
        return {
          reportType,
          title: 'Production Run Report',
          columns: [
            { key: 'productionNumber', label: 'Run No' },
            { key: 'date', label: 'Date', format: 'date' },
            { key: 'productName', label: 'Product' },
            { key: 'batchSize', label: 'Batches', format: 'number' },
            { key: 'expectedOutput', label: 'Expected', format: 'number' },
            { key: 'actualGoodOutput', label: 'Good Output', format: 'number' },
            { key: 'yieldVariancePct', label: 'Yield Var %', format: 'percent' },
            { key: 'totalCost', label: 'Total Cost (₹)', format: 'currency' },
            { key: 'costPerPacket', label: 'Cost/Pkt (₹)', format: 'currency' },
            { key: 'supervisorName', label: 'Supervisor' },
            { key: 'alert', label: 'Status' },
          ],
          rows,
        };
      }

      if (reportType === 'yield-variance') {
        const rows = filterSearch(
          runs.map((r) => ({
            productionNumber: r.productionNumber,
            date: dayjs(r.productionDate).format('YYYY-MM-DD'),
            productName: r.productName,
            expectedOutput: r.expectedOutput,
            actualGoodOutput: r.actualGoodOutput,
            outputDiff: r.actualGoodOutput - r.expectedOutput,
            yieldVariancePct: r.yieldVariancePct,
            flagged: Math.abs(r.yieldVariancePct) > 3 ? 'YES (>3%)' : 'NO',
          }))
        );
        return {
          reportType,
          title: 'Yield Variance Report',
          columns: [
            { key: 'productionNumber', label: 'Run No' },
            { key: 'date', label: 'Date', format: 'date' },
            { key: 'productName', label: 'Product' },
            { key: 'expectedOutput', label: 'Expected Output', format: 'number' },
            { key: 'actualGoodOutput', label: 'Actual Good Output', format: 'number' },
            { key: 'outputDiff', label: 'Difference', format: 'number' },
            { key: 'yieldVariancePct', label: 'Yield Variance %', format: 'percent' },
            { key: 'flagged', label: 'Flagged (>3%)' },
          ],
          rows,
        };
      }

      if (reportType === 'wastage-report') {
        const rows = filterSearch(
          runs.map((r) => ({
            productionNumber: r.productionNumber,
            date: dayjs(r.productionDate).format('YYYY-MM-DD'),
            productName: r.productName,
            damagedQuantity: r.damagedQuantity,
            damagedPouches: r.damagedPouches,
            wastageQty: r.wastageQty,
            wastageNotes: r.wastageNotes || '-',
            supervisorName: r.supervisorName,
          }))
        );
        return {
          reportType,
          title: 'Production Wastage & Damage Report',
          columns: [
            { key: 'productionNumber', label: 'Run No' },
            { key: 'date', label: 'Date', format: 'date' },
            { key: 'productName', label: 'Product' },
            { key: 'damagedQuantity', label: 'Shortfall/Damaged Pkts', format: 'number' },
            { key: 'damagedPouches', label: 'Damaged Pouches', format: 'number' },
            { key: 'wastageQty', label: 'Wastage Qty', format: 'number' },
            { key: 'wastageNotes', label: 'Notes' },
            { key: 'supervisorName', label: 'Supervisor' },
          ],
          rows,
        };
      }

      // cost-per-packet
      const rows = filterSearch(
        runs.map((r) => ({
          productionNumber: r.productionNumber,
          date: dayjs(r.productionDate).format('YYYY-MM-DD'),
          productName: r.productName,
          actualGoodOutput: r.actualGoodOutput,
          materialCost: r.materialCost,
          packagingCost: r.packagingCost,
          labourCost: r.labourCost,
          powerCost: r.powerCost,
          totalProductionCost: r.totalProductionCost,
          costPerPacket: r.costPerPacket,
        }))
      );
      return {
        reportType,
        title: 'Cost Per Packet Analysis Report',
        columns: [
          { key: 'productionNumber', label: 'Run No' },
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'productName', label: 'Product' },
          { key: 'actualGoodOutput', label: 'Good Output', format: 'number' },
          { key: 'materialCost', label: 'Material Cost (₹)', format: 'currency' },
          { key: 'packagingCost', label: 'Packaging Cost (₹)', format: 'currency' },
          { key: 'labourCost', label: 'Labour (₹)', format: 'currency' },
          { key: 'powerCost', label: 'Gas/Power (₹)', format: 'currency' },
          { key: 'totalProductionCost', label: 'Total Cost (₹)', format: 'currency' },
          { key: 'costPerPacket', label: 'Cost/Packet (₹)', format: 'currency' },
        ],
        rows,
      };
    }

    case 'planned-vs-actual': {
      const q: Record<string, unknown> = {};
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.productionDate = dr;
      if (filters.productId) q.product = filters.productId;
      const runs = await ProductionRun.find(q).sort({ productionDate: -1 }).lean();
      const rows = filterSearch(
        runs.flatMap((r) =>
          r.materials.map((m) => ({
            productionNumber: r.productionNumber,
            date: dayjs(r.productionDate).format('YYYY-MM-DD'),
            productName: r.productName,
            materialName: m.materialName,
            category: m.category,
            plannedQty: m.plannedQty,
            actualQty: m.actualQty,
            unit: m.unit,
            varianceQty: m.varianceQty,
            variancePct: m.variancePct,
            alert: m.isAlert ? 'ALERT (>3%)' : 'OK',
          }))
        )
      );
      return {
        reportType,
        title: 'Planned vs Actual Material Consumption',
        columns: [
          { key: 'productionNumber', label: 'Run No' },
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'productName', label: 'Product' },
          { key: 'materialName', label: 'Material' },
          { key: 'category', label: 'Category' },
          { key: 'plannedQty', label: 'Planned', format: 'number' },
          { key: 'actualQty', label: 'Actual', format: 'number' },
          { key: 'unit', label: 'Unit' },
          { key: 'varianceQty', label: 'Var Qty', format: 'number' },
          { key: 'variancePct', label: 'Var %', format: 'percent' },
          { key: 'alert', label: 'Alert' },
        ],
        rows,
      };
    }

    case 'payments-collections': {
      const q: Record<string, unknown> = {};
      const dr = buildDateQuery(filters.startDate, filters.endDate);
      if (dr) q.paymentDate = dr;
      if (filters.customerId) q.customer = filters.customerId;
      const payments = await Payment.find(q).sort({ paymentDate: -1 }).lean();
      const rows = filterSearch(
        payments.map((p) => ({
          paymentNumber: p.paymentNumber,
          date: dayjs(p.paymentDate).format('YYYY-MM-DD'),
          customerName: p.customerName,
          invoiceNumber: p.invoiceNumber,
          paymentMethod: p.paymentMethod,
          transactionRef: p.transactionRef,
          amount: p.amount,
          recordedByName: p.recordedByName,
        }))
      );
      return {
        reportType,
        title: 'Payments & Collections Report',
        columns: [
          { key: 'paymentNumber', label: 'Payment No' },
          { key: 'date', label: 'Date', format: 'date' },
          { key: 'customerName', label: 'Customer' },
          { key: 'invoiceNumber', label: 'Invoice No' },
          { key: 'paymentMethod', label: 'Method' },
          { key: 'transactionRef', label: 'Reference' },
          { key: 'amount', label: 'Amount (₹)', format: 'currency' },
          { key: 'recordedByName', label: 'Recorded By' },
        ],
        rows,
      };
    }

    case 'outstanding-receivables': {
      const rec = await getReceivablesAndAgeing();
      const rows = filterSearch(
        rec.invoices
          .filter((i) => !filters.customerId || i.customerId === filters.customerId)
          .map((i) => ({
            invoiceNumber: i.invoiceNumber,
            invoiceDate: dayjs(i.invoiceDate).format('YYYY-MM-DD'),
            customerName: i.customerName,
            grandTotal: i.grandTotal,
            paidAmount: i.paidAmount,
            outstanding: i.outstanding,
            daysOld: i.daysOld,
            ageingBucket: i.ageingBucket,
          }))
      );
      return {
        reportType,
        title: 'Outstanding Receivables Report',
        columns: [
          { key: 'invoiceNumber', label: 'Invoice No' },
          { key: 'invoiceDate', label: 'Invoice Date', format: 'date' },
          { key: 'customerName', label: 'Customer' },
          { key: 'grandTotal', label: 'Invoice Total (₹)', format: 'currency' },
          { key: 'paidAmount', label: 'Paid (₹)', format: 'currency' },
          { key: 'outstanding', label: 'Outstanding (₹)', format: 'currency' },
          { key: 'daysOld', label: 'Age (Days)', format: 'number' },
          { key: 'ageingBucket', label: 'Bucket' },
        ],
        rows,
      };
    }

    case 'receivables-ageing': {
      const rec = await getReceivablesAndAgeing();
      const rows = filterSearch(
        rec.customers
          .filter((c) => !filters.customerId || c.customerId === filters.customerId)
          .map((c) => ({
            customerName: c.customerName,
            state: c.state,
            totalBilled: c.totalBilled,
            totalPaid: c.totalPaid,
            outstanding: c.outstanding,
            bucket0_30: c.bucket0_30,
            bucket31_60: c.bucket31_60,
            bucket61_90: c.bucket61_90,
            bucket90Plus: c.bucket90Plus,
          }))
      );
      return {
        reportType,
        title: 'Receivables Ageing Analysis',
        columns: [
          { key: 'customerName', label: 'Customer' },
          { key: 'state', label: 'State' },
          { key: 'totalBilled', label: 'Total Billed (₹)', format: 'currency' },
          { key: 'totalPaid', label: 'Total Paid (₹)', format: 'currency' },
          { key: 'outstanding', label: 'Outstanding (₹)', format: 'currency' },
          { key: 'bucket0_30', label: '0-30 Days (₹)', format: 'currency' },
          { key: 'bucket31_60', label: '31-60 Days (₹)', format: 'currency' },
          { key: 'bucket61_90', label: '61-90 Days (₹)', format: 'currency' },
          { key: 'bucket90Plus', label: '>90 Days (₹)', format: 'currency' },
        ],
        rows,
      };
    }

    default:
      throw new NotFoundError(`Unknown report type: ${reportType}`);
  }
}

export async function exportReportExcel(report: ReportResult): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'FactoryFlow ERP';
  const sheet = wb.addWorksheet(report.title.slice(0, 31));

  sheet.addRow([`FactoryFlow ERP - ${report.title}`]);
  sheet.getRow(1).font = { bold: true, size: 14 };
  sheet.addRow([`Generated: ${dayjs().format('YYYY-MM-DD HH:mm')}`]);
  sheet.addRow([]);

  const headerRow = sheet.addRow(report.columns.map((c) => c.label));
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E293B' },
  };

  for (const row of report.rows) {
    sheet.addRow(report.columns.map((c) => row[c.key] ?? ''));
  }

  sheet.columns.forEach((col) => {
    col.width = 18;
  });

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function exportReportCsv(report: ReportResult): string {
  const escapeCsv = (val: unknown) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const header = report.columns.map((c) => escapeCsv(c.label)).join(',');
  const lines = report.rows.map((row) =>
    report.columns.map((c) => escapeCsv(row[c.key])).join(',')
  );
  return [header, ...lines].join('\r\n');
}

export async function exportReportPdf(report: ReportResult): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(15).font('Helvetica-Bold').text(`FactoryFlow ERP — ${report.title}`);
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor('#475569')
      .text(`Generated on ${dayjs().format('DD MMM YYYY HH:mm')} | Rows: ${report.rows.length}`);
    doc.moveDown(0.8);

    const usableWidth = 780;
    const colWidth = usableWidth / Math.max(1, report.columns.length);
    let y = doc.y;

    doc.rect(30, y, usableWidth, 20).fill('#1e293b');
    doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(7.5);
    report.columns.forEach((c, idx) => {
      doc.text(c.label, 34 + idx * colWidth, y + 6, {
        width: colWidth - 6,
        ellipsis: true,
      });
    });
    y += 24;

    doc.fillColor('#0f172a').font('Helvetica').fontSize(7.5);
    for (const row of report.rows.slice(0, 80)) {
      if (y > 540) {
        doc.addPage();
        y = 40;
      }
      report.columns.forEach((c, idx) => {
        const raw = row[c.key];
        const text =
          c.format === 'currency' && typeof raw === 'number'
            ? `Rs. ${raw.toFixed(2)}`
            : c.format === 'percent' && typeof raw === 'number'
            ? `${raw}%`
            : String(raw ?? '-');
        doc.text(text, 34 + idx * colWidth, y, {
          width: colWidth - 6,
          ellipsis: true,
        });
      });
      y += 16;
      doc.moveTo(30, y - 3).lineTo(810, y - 3).strokeColor('#e2e8f0').stroke();
    }

    doc.end();
  });
}

export async function listAuditLogs(filters: {
  entityType?: string;
  action?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const query: Record<string, unknown> = {};
  if (filters.entityType) query.entityType = filters.entityType;
  if (filters.action) query.action = filters.action;
  if (filters.search) {
    query.$or = [
      { summary: { $regex: filters.search, $options: 'i' } },
      { entityRef: { $regex: filters.search, $options: 'i' } },
      { userName: { $regex: filters.search, $options: 'i' } },
    ];
  }
  const page = Math.max(1, filters.page || 1);
  const limit = Math.min(100, Math.max(1, filters.limit || 25));

  const [items, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ timestamp: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    AuditLog.countDocuments(query),
  ]);
  return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
}
