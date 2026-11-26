import React, { useEffect, useState, useCallback } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Download,
  ShieldCheck,
  Search,
  BarChart3,
} from 'lucide-react';
import { api, downloadBlob, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Customer, Product } from '../types';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Input,
  Select,
  LoadingSpinner,
  EmptyState,
} from '../components/ui/Primitives';
import { formatINR, formatDateTime } from '../utils/format';

const REPORTS = [
  { slug: 'sales-register', label: '1. Sales Register', group: 'Sales & GST' },
  { slug: 'customer-sales', label: '2. Customer-Wise Sales', group: 'Sales & GST' },
  { slug: 'product-sales', label: '3. Product-Wise Sales', group: 'Sales & GST' },
  { slug: 'gst-outward', label: '4. GST Outward Supply (GSTR-1)', group: 'Sales & GST' },
  { slug: 'purchase-register', label: '5. Purchase Register', group: 'Inventory & Purchases' },
  { slug: 'raw-material-stock', label: '6. Raw Material Stock Summary', group: 'Inventory & Purchases' },
  { slug: 'packaging-stock', label: '7. Packaging Stock Summary', group: 'Inventory & Purchases' },
  { slug: 'finished-goods-stock', label: '8. Finished Goods Stock Summary', group: 'Inventory & Purchases' },
  { slug: 'stock-ledger', label: '9. Stock Ledger', group: 'Inventory & Purchases' },
  { slug: 'production-report', label: '10. Production Report', group: 'Production & Costing' },
  { slug: 'planned-vs-actual', label: '11. Planned vs Actual Consumption', group: 'Production & Costing' },
  { slug: 'yield-variance', label: '12. Yield Variance Report', group: 'Production & Costing' },
  { slug: 'wastage-report', label: '13. Wastage Report', group: 'Production & Costing' },
  { slug: 'cost-per-packet', label: '14. Cost Per Packet Report', group: 'Production & Costing' },
  { slug: 'payments-collections', label: '15. Payments & Collections', group: 'Receivables' },
  { slug: 'outstanding-receivables', label: '16. Outstanding Receivables', group: 'Receivables' },
  { slug: 'receivables-ageing', label: '17. Receivables Ageing', group: 'Receivables' },
];

interface ReportResult {
  reportType: string;
  title: string;
  columns: Array<{
    key: string;
    label: string;
    format?: 'currency' | 'number' | 'percent' | 'date';
  }>;
  rows: Array<Record<string, unknown>>;
  totals?: Record<string, unknown>;
}

interface AuditLogItem {
  _id: string;
  timestamp: string;
  userName: string;
  userRole: string;
  action: string;
  entityType: string;
  entityRef: string;
  summary: string;
}

export const ReportsPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<'reports' | 'audit'>('reports');
  const [reportType, setReportType] = useState(REPORTS[0].slug);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [search, setSearch] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [report, setReport] = useState<ReportResult | null>(null);
  const [loading, setLoading] = useState(true);

  const [auditLogs, setAuditLogs] = useState<AuditLogItem[]>([]);
  const [auditSearch, setAuditSearch] = useState('');
  const [auditLoading, setAuditLoading] = useState(false);

  const canViewAudit =
    user?.role === 'OWNER' || user?.role === 'ACCOUNTANT' || user?.role === 'ADMIN';

  useEffect(() => {
    api.get('/products').then((r) => setProducts(r.data.data || [])).catch(() => {});
    if (user?.role !== 'PRODUCTION_SUPERVISOR') {
      api.get('/customers').then((r) => setCustomers(r.data.data || [])).catch(() => {});
    }
  }, [user?.role]);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (customerId) params.customerId = customerId;
      if (productId) params.productId = productId;
      if (search.trim()) params.search = search.trim();
      const res = await api.get(`/reports/${reportType}`, { params });
      setReport(res.data.data);
    } catch (err) {
      toast('Failed to generate report', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [reportType, startDate, endDate, customerId, productId, search, toast]);

  useEffect(() => {
    if (tab === 'reports') fetchReport();
  }, [tab, fetchReport]);

  const fetchAuditLogs = useCallback(async () => {
    if (!canViewAudit) return;
    setAuditLoading(true);
    try {
      const res = await api.get('/audit-logs', {
        params: { limit: 100, search: auditSearch.trim() || undefined },
      });
      setAuditLogs(res.data.data.items || []);
    } catch (err) {
      toast('Failed to load audit logs', 'error', getErrorMessage(err));
    } finally {
      setAuditLoading(false);
    }
  }, [canViewAudit, auditSearch, toast]);

  useEffect(() => {
    if (tab === 'audit') fetchAuditLogs();
  }, [tab, fetchAuditLogs]);

  const buildExportQuery = () => {
    const qs = new URLSearchParams();
    if (startDate) qs.set('startDate', startDate);
    if (endDate) qs.set('endDate', endDate);
    if (customerId) qs.set('customerId', customerId);
    if (productId) qs.set('productId', productId);
    if (search.trim()) qs.set('search', search.trim());
    return qs.toString();
  };

  const handleExport = (format: 'excel' | 'csv' | 'pdf') => {
    const qs = buildExportQuery();
    const ext = format === 'excel' ? 'xlsx' : format;
    downloadBlob(
      `/reports/${reportType}/export?format=${format}${qs ? `&${qs}` : ''}`,
      `${reportType}.${ext}`
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports & Immutable Audit Trail"
        description="Accountant-ready statutory, inventory, production variance, costing, and receivables reports with Excel, CSV, and PDF exports."
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setTab('reports')}
          className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold ${
            tab === 'reports'
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          <BarChart3 className="h-4 w-4" /> 17 Operational & Financial Reports
        </button>
        {canViewAudit && (
          <button
            onClick={() => setTab('audit')}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold ${
              tab === 'audit'
                ? 'bg-blue-600 text-white'
                : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            <ShieldCheck className="h-4 w-4" /> Immutable Audit Logs
          </button>
        )}
      </div>

      {tab === 'reports' && (
        <div className="space-y-4">
          <Card>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3 items-end">
              <div className="lg:col-span-2">
                <Select
                  label="Select Report (17 Available)"
                  value={reportType}
                  onChange={(e) => setReportType(e.target.value)}
                >
                  {REPORTS.map((r) => (
                    <option key={r.slug} value={r.slug}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </div>
              <Input
                label="From Date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
              <Input
                label="To Date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
              <Select
                label="Customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                <option value="">All Customers</option>
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select
                label="Product"
                value={productId}
                onChange={(e) => setProductId(e.target.value)}
              >
                <option value="">All Products</option>
                {products.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
              <div className="relative w-full sm:max-w-xs">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Filter report rows..."
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-sm"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => handleExport('excel')}>
                  <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Excel
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleExport('csv')}>
                  <Download className="h-4 w-4 text-blue-600" /> CSV
                </Button>
                <Button variant="secondary" size="sm" onClick={() => handleExport('pdf')}>
                  <FileText className="h-4 w-4 text-red-600" /> PDF
                </Button>
              </div>
            </div>
          </Card>

          <Card
            title={report?.title || 'Report Preview'}
            subtitle={report ? `${report.rows.length} row(s) matching current filters` : ''}
          >
            {loading ? (
              <LoadingSpinner />
            ) : !report || report.rows.length === 0 ? (
              <EmptyState title="No data in this report" description="Try clearing date, customer, or product filters." />
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      {report.columns.map((c) => (
                        <th
                          key={c.key}
                          className={`px-3 py-2.5 font-semibold uppercase tracking-wider text-slate-600 ${
                            c.format === 'currency' || c.format === 'number' || c.format === 'percent'
                              ? 'text-right'
                              : 'text-left'
                          }`}
                        >
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {report.rows.map((row, idx) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        {report.columns.map((col) => {
                          const raw = row[col.key];
                          let formatted: React.ReactNode = String(raw ?? '-');
                          if (col.format === 'currency' && typeof raw === 'number') {
                            formatted = formatINR(raw);
                          } else if (col.format === 'percent' && typeof raw === 'number') {
                            formatted = `${raw}%`;
                          }
                          return (
                            <td
                              key={col.key}
                              className={`px-3 py-2.5 whitespace-nowrap ${
                                col.format === 'currency' ||
                                col.format === 'number' ||
                                col.format === 'percent'
                                  ? 'text-right font-medium'
                                  : 'text-left'
                              }`}
                            >
                              {formatted}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'audit' && canViewAudit && (
        <Card
          title="Immutable System Audit Log"
          subtitle="Tracks master data edits, production runs, stock adjustments, invoices, and payments."
          action={
            <input
              type="text"
              value={auditSearch}
              onChange={(e) => setAuditSearch(e.target.value)}
              placeholder="Search audit events..."
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
            />
          }
        >
          {auditLoading ? (
            <LoadingSpinner />
          ) : auditLogs.length === 0 ? (
            <EmptyState title="No audit logs found" />
          ) : (
            <div className="divide-y divide-slate-100">
              {auditLogs.map((log) => (
                <div key={log._id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge variant="blue">{log.action}</Badge>
                      <span className="text-xs font-semibold text-slate-800">{log.entityRef}</span>
                      <span className="text-xs text-slate-500">by {log.userName} ({log.userRole})</span>
                    </div>
                    <p className="text-xs text-slate-600 mt-1">{log.summary}</p>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">
                    {formatDateTime(log.timestamp)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};
