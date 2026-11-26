import React, { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  IndianRupee,
  ClipboardList,
  Clock,
  Factory,
  Boxes,
  PackageCheck,
  AlertTriangle,
  Wallet,
  Calculator,
  TrendingUp,
  ArrowRight,
  Calendar,
} from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import {
  Card,
  StatCard,
  Badge,
  Button,
  LoadingSpinner,
  PageHeader,
} from '../components/ui/Primitives';
import { formatINR, formatNumber, formatDate, ROLE_LABELS } from '../utils/format';

interface DashboardPayload {
  role: string;
  summaryCards: {
    todaysSales: number;
    totalOrders: number;
    pendingOrders: number;
    productionCompleted: number;
    finishedGoodsAvailable: number;
    rawMaterialStockValue: number;
    packagingStockValue: number;
    revenue: number;
    outstandingReceivables: number;
    avgProductionCostPerPacket: number;
    productionVarianceAlerts: number;
    totalPurchaseSpend: number;
    totalCollections: number;
    lowStockCount: number;
  };
  charts: {
    monthlySalesTrend: Array<{ month: string; sales: number; collections: number }>;
    productWiseSales: Array<{ productName: string; quantity: number; revenue: number }>;
    productionVsTarget: Array<{
      run: string;
      product: string;
      expected: number;
      actual: number;
      yieldVariancePct: number;
    }>;
    rawMaterialConsumption: Array<{
      material: string;
      planned: number;
      actual: number;
      unit: string;
    }>;
    inventoryMovement: Array<{ type: string; inQty: number; outQty: number }>;
    collectionTrends: Array<{ date: string; amount: number }>;
  };
  lists: {
    recentOrders: Array<{
      _id: string;
      orderNumber: string;
      customerName: string;
      orderDate: string;
      status: string;
      grandTotal: number;
    }>;
    recentProductionRuns: Array<{
      _id: string;
      productionNumber: string;
      productName: string;
      productionDate: string;
      expectedOutput: number;
      actualGoodOutput: number;
      yieldVariancePct: number;
      hasVarianceAlert: boolean;
      costPerPacket: number;
    }>;
    lowStockWarnings: Array<{
      id: string;
      name: string;
      code: string;
      category: string;
      currentStock: number;
      reorderLevel: number;
      unit: string;
    }>;
    pendingApprovals: Array<{
      _id: string;
      orderNumber: string;
      customerName: string;
      grandTotal: number;
      status: string;
    }>;
    topSellingProducts: Array<{ productName: string; quantity: number; revenue: number }>;
    customerOutstandingBalances: Array<{
      customerId: string;
      customerName: string;
      state: string;
      totalBilled: number;
      totalPaid: number;
      outstanding: number;
    }>;
    varianceAlertRuns: Array<{
      _id: string;
      productionNumber: string;
      productName: string;
      yieldVariancePct: number;
      productionDate: string;
    }>;
    recentAuditLogs: Array<{
      _id: string;
      timestamp: string;
      userName: string;
      action: string;
      summary: string;
    }>;
  };
}

export const DashboardPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      const res = await api.get('/dashboard', { params });
      setData(res.data.data);
    } catch (err) {
      toast('Failed to load dashboard', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, toast]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading && !data) {
    return <LoadingSpinner label="Loading live MongoDB metrics..." />;
  }

  if (!data || !user) return null;
  const { summaryCards: s, charts, lists } = data;
  const role = user.role;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${ROLE_LABELS[role]} Dashboard`}
        description="Real-time metrics computed directly from MongoDB transactions, stock ledgers, and GST invoices."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs">
              <Calendar className="h-3.5 w-3.5 text-slate-400" />
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="text-xs text-slate-700 focus:outline-none"
                aria-label="Start date"
              />
              <span className="text-slate-400">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="text-xs text-slate-700 focus:outline-none"
                aria-label="End date"
              />
            </div>
            {(startDate || endDate) && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setStartDate('');
                  setEndDate('');
                }}
              >
                Reset
              </Button>
            )}
          </div>
        }
      />

      {/* Role-Specific Summary Cards */}
      {role === 'OWNER' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Today's Sales"
            value={formatINR(s.todaysSales)}
            subtitle={`Total Revenue: ${formatINR(s.revenue)}`}
            icon={<IndianRupee className="h-5 w-5" />}
            tone="blue"
          />
          <StatCard
            title="Total / Pending Orders"
            value={`${s.totalOrders} / ${s.pendingOrders}`}
            subtitle="Open order pipeline"
            icon={<ClipboardList className="h-5 w-5" />}
            tone="amber"
          />
          <StatCard
            title="Production Completed"
            value={`${formatNumber(s.productionCompleted, 0)} pkts`}
            subtitle={`FG Stock: ${formatNumber(s.finishedGoodsAvailable, 0)} pkts`}
            icon={<Factory className="h-5 w-5" />}
            tone="green"
          />
          <StatCard
            title="Raw Material Valuation"
            value={formatINR(s.rawMaterialStockValue)}
            subtitle={`Packaging: ${formatINR(s.packagingStockValue)}`}
            icon={<Boxes className="h-5 w-5" />}
            tone="indigo"
          />
          <StatCard
            title="Outstanding Receivables"
            value={formatINR(s.outstandingReceivables)}
            subtitle={`Avg Cost/Pkt: ${formatINR(s.avgProductionCostPerPacket)}`}
            icon={<Wallet className="h-5 w-5" />}
            tone="red"
          />
        </div>
      )}

      {role === 'OWNER' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <StatCard
            title="Total Revenue (GST Incl.)"
            value={formatINR(s.revenue)}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="green"
          />
          <StatCard
            title="Finished Goods Available"
            value={`${formatNumber(s.finishedGoodsAvailable, 0)} pkts`}
            icon={<PackageCheck className="h-5 w-5" />}
            tone="blue"
          />
          <StatCard
            title="Avg Cost Per Packet"
            value={formatINR(s.avgProductionCostPerPacket)}
            icon={<Calculator className="h-5 w-5" />}
            tone="indigo"
          />
          <StatCard
            title="Variance Alerts (>3%)"
            value={s.productionVarianceAlerts}
            subtitle="Yield or material deviation"
            icon={<AlertTriangle className="h-5 w-5" />}
            tone={s.productionVarianceAlerts > 0 ? 'red' : 'green'}
          />
          <StatCard
            title="Low-Stock Items"
            value={s.lowStockCount}
            subtitle="Below reorder threshold"
            icon={<Clock className="h-5 w-5" />}
            tone={s.lowStockCount > 0 ? 'amber' : 'green'}
          />
        </div>
      )}

      {role === 'ADMIN' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Pending Approvals"
            value={lists.pendingApprovals.length}
            subtitle={`Total Orders: ${s.totalOrders}`}
            icon={<Clock className="h-5 w-5" />}
            tone="amber"
          />
          <StatCard
            title="Finished Goods Available"
            value={`${formatNumber(s.finishedGoodsAvailable, 0)} pkts`}
            icon={<PackageCheck className="h-5 w-5" />}
            tone="blue"
          />
          <StatCard
            title="Total Billed Revenue"
            value={formatINR(s.revenue)}
            subtitle={`Collected: ${formatINR(s.totalCollections)}`}
            icon={<IndianRupee className="h-5 w-5" />}
            tone="green"
          />
          <StatCard
            title="Outstanding Receivables"
            value={formatINR(s.outstandingReceivables)}
            subtitle={`Purchase Spend: ${formatINR(s.totalPurchaseSpend)}`}
            icon={<Wallet className="h-5 w-5" />}
            tone="red"
          />
        </div>
      )}

      {role === 'SALESMAN' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="My Orders"
            value={s.totalOrders}
            subtitle="Submitted & active orders"
            icon={<ClipboardList className="h-5 w-5" />}
            tone="blue"
          />
          <StatCard
            title="Pending Fulfillment"
            value={s.pendingOrders}
            icon={<Clock className="h-5 w-5" />}
            tone="amber"
          />
          <StatCard
            title="Finished Stock Ready"
            value={`${formatNumber(s.finishedGoodsAvailable, 0)} pkts`}
            icon={<PackageCheck className="h-5 w-5" />}
            tone="green"
          />
          <StatCard
            title="Customer Receivables"
            value={formatINR(s.outstandingReceivables)}
            icon={<Wallet className="h-5 w-5" />}
            tone="indigo"
          />
        </div>
      )}

      {role === 'PRODUCTION_SUPERVISOR' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Production Completed"
            value={`${formatNumber(s.productionCompleted, 0)} pkts`}
            icon={<Factory className="h-5 w-5" />}
            tone="green"
          />
          <StatCard
            title="Avg Cost Per Packet"
            value={formatINR(s.avgProductionCostPerPacket)}
            icon={<Calculator className="h-5 w-5" />}
            tone="blue"
          />
          <StatCard
            title="Variance Alerts (>3%)"
            value={s.productionVarianceAlerts}
            icon={<AlertTriangle className="h-5 w-5" />}
            tone={s.productionVarianceAlerts > 0 ? 'red' : 'green'}
          />
          <StatCard
            title="Raw Material Stock Value"
            value={formatINR(s.rawMaterialStockValue)}
            subtitle={`Low stock warnings: ${s.lowStockCount}`}
            icon={<Boxes className="h-5 w-5" />}
            tone="amber"
          />
        </div>
      )}

      {role === 'ACCOUNTANT' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            title="Total Taxable + GST Sales"
            value={formatINR(s.revenue)}
            icon={<IndianRupee className="h-5 w-5" />}
            tone="blue"
          />
          <StatCard
            title="Collections Received"
            value={formatINR(s.totalCollections)}
            icon={<TrendingUp className="h-5 w-5" />}
            tone="green"
          />
          <StatCard
            title="Outstanding Receivables"
            value={formatINR(s.outstandingReceivables)}
            icon={<Wallet className="h-5 w-5" />}
            tone="red"
          />
          <StatCard
            title="Inventory Valuation"
            value={formatINR(s.rawMaterialStockValue + s.packagingStockValue)}
            subtitle={`Purchase Spend: ${formatINR(s.totalPurchaseSpend)}`}
            icon={<Boxes className="h-5 w-5" />}
            tone="indigo"
          />
        </div>
      )}

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {(role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT' || role === 'SALESMAN') && (
          <Card title="Monthly Sales & Collection Trend" subtitle="Active GST invoices vs recorded customer payments">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={charts.monthlySalesTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => formatINR(v)} />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="sales"
                    name="Sales (₹)"
                    stroke="#2563eb"
                    fill="#dbeafe"
                  />
                  <Area
                    type="monotone"
                    dataKey="collections"
                    name="Collections (₹)"
                    stroke="#10b981"
                    fill="#d1fae5"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {(role === 'OWNER' || role === 'PRODUCTION_SUPERVISOR' || role === 'ACCOUNTANT') && (
          <Card title="Production Output vs Target" subtitle="Expected BOM output vs actual good packets">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.productionVsTarget}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="run" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="expected" name="Expected Output" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual Good Output" fill="#2563eb" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {(role === 'OWNER' || role === 'PRODUCTION_SUPERVISOR') && (
          <Card title="Raw & Packaging Consumption" subtitle="Planned BOM consumption vs actual issued">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={charts.rawMaterialConsumption}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="material" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="planned" name="Planned Qty" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual" name="Actual Issued" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}

        {(role === 'OWNER' || role === 'ADMIN' || role === 'ACCOUNTANT' || role === 'SALESMAN') && (
          <Card title="Product-Wise Sales & Inventory Movement" subtitle="Top product revenue and recent stock ledger IN/OUT">
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={role === 'OWNER' ? charts.inventoryMovement : charts.productWiseSales}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis
                    dataKey={role === 'OWNER' ? 'type' : 'productName'}
                    tick={{ fontSize: 11 }}
                  />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Legend />
                  {role === 'OWNER' ? (
                    <>
                      <Bar dataKey="inQty" name="Stock In" fill="#10b981" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="outQty" name="Stock Out" fill="#ef4444" radius={[4, 4, 0, 0]} />
                    </>
                  ) : (
                    <Bar dataKey="revenue" name="Revenue (₹)" fill="#2563eb" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
        )}
      </div>

      {/* Operational Lists */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card
          title="Recent Sales Orders & Pending Approvals"
          action={
            <Link to="/orders" className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
              Manage Orders <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {lists.recentOrders.length === 0 ? (
            <p className="text-xs text-slate-500">No orders recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {lists.recentOrders.map((o) => (
                <div key={o._id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{o.orderNumber}</p>
                    <p className="text-xs text-slate-500">
                      {o.customerName} · {formatDate(o.orderDate)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-slate-900">{formatINR(o.grandTotal)}</p>
                    <Badge
                      variant={
                        o.status === 'DISPATCHED'
                          ? 'green'
                          : o.status === 'REJECTED' || o.status === 'CANCELLED'
                          ? 'red'
                          : 'amber'
                      }
                    >
                      {o.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Recent Production Runs & Variance Alerts"
          action={
            <Link to="/production" className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
              View Production <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {lists.recentProductionRuns.length === 0 ? (
            <p className="text-xs text-slate-500">No production runs recorded yet.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {lists.recentProductionRuns.map((r) => (
                <div key={r._id} className="py-2.5 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {r.productionNumber} · {r.productName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Good: {r.actualGoodOutput}/{r.expectedOutput} pkts · Cost/pkt: {formatINR(r.costPerPacket)}
                    </p>
                  </div>
                  <div className="text-right">
                    <Badge variant={r.hasVarianceAlert ? 'red' : 'green'}>
                      Yield {r.yieldVariancePct > 0 ? `+${r.yieldVariancePct}` : r.yieldVariancePct}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Customer Outstanding Balances"
          action={
            <Link to="/payments" className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
              Payments & Ageing <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          {lists.customerOutstandingBalances.length === 0 ? (
            <p className="text-xs text-slate-500">All customer accounts are settled.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {lists.customerOutstandingBalances.map((c) => (
                <div key={c.customerId} className="py-2.5 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{c.customerName}</p>
                    <p className="text-xs text-slate-500">
                      Billed: {formatINR(c.totalBilled)} · Paid: {formatINR(c.totalPaid)}
                    </p>
                  </div>
                  <Badge variant={c.outstanding > 0 ? 'amber' : 'green'}>
                    Due: {formatINR(c.outstanding)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card
          title="Low-Stock Warnings & Top Products"
          action={
            <Link to="/inventory" className="text-xs font-medium text-blue-600 hover:underline flex items-center gap-1">
              Open Inventory <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          }
        >
          <div className="space-y-4">
            {lists.lowStockWarnings.length > 0 ? (
              <div className="space-y-2">
                {lists.lowStockWarnings.map((w) => (
                  <div
                    key={w.id}
                    className="flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs"
                  >
                    <div>
                      <p className="font-semibold text-red-900">{w.name}</p>
                      <p className="text-red-700">
                        {w.code} · Reorder level: {w.reorderLevel} {w.unit}
                      </p>
                    </div>
                    <Badge variant="red">
                      {w.currentStock} {w.unit}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                All raw materials, packaging, and finished goods are above reorder levels.
              </p>
            )}

            {lists.topSellingProducts.length > 0 && (
              <div className="border-t border-slate-100 pt-3">
                <p className="text-xs font-semibold text-slate-500 uppercase mb-2">
                  Top-Selling Products
                </p>
                {lists.topSellingProducts.map((p) => (
                  <div key={p.productName} className="flex justify-between text-xs py-1">
                    <span className="font-medium text-slate-800">{p.productName}</span>
                    <span className="text-slate-600">
                      {p.quantity} pkts · {formatINR(p.revenue)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
};
