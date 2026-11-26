import React, { useEffect, useState, useCallback } from 'react';
import { Calculator, TrendingUp, Package, Layers } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import { api, getErrorMessage } from '../services/api';
import { useToast } from '../context/ToastContext';
import { ProductionMaterialLine } from '../types';
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  Modal,
  Button,
  LoadingSpinner,
} from '../components/ui/Primitives';
import { DataTable, Column } from '../components/ui/DataTable';
import { formatINR, formatDate } from '../utils/format';

interface CostingRow {
  productionRunId: string;
  productionNumber: string;
  productionDate: string;
  productName: string;
  actualGoodOutput: number;
  materialCost: number;
  packagingCost: number;
  labourCost: number;
  powerCost: number;
  otherOverheads: number;
  totalProductionCost: number;
  costPerPacket: number;
  exactCostPerPacket: number;
  sellingPrice: number;
  grossMarginPerPacket: number;
  grossMarginPct: number;
  materialsBreakdown: ProductionMaterialLine[];
}

export const CostingPage: React.FC = () => {
  const { toast } = useToast();
  const [items, setItems] = useState<CostingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<CostingRow | null>(null);

  const loadCosting = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get('/costing');
      setItems(res.data.data || []);
    } catch (err) {
      toast('Failed to load costing analysis', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadCosting();
  }, [loadCosting]);

  const totalCost = items.reduce((s, r) => s + r.totalProductionCost, 0);
  const totalGood = items.reduce((s, r) => s + r.actualGoodOutput, 0);
  const overallCostPerPkt = totalGood > 0 ? totalCost / totalGood : 0;
  const avgSellingPrice =
    items.length > 0
      ? items.reduce((s, r) => s + r.sellingPrice, 0) / items.length
      : 50;
  const avgMarginPct =
    avgSellingPrice > 0
      ? ((avgSellingPrice - overallCostPerPkt) / avgSellingPrice) * 100
      : 0;

  const columns: Column<CostingRow & Record<string, unknown>>[] = [
    { key: 'productionNumber', header: 'Run No', sortable: true },
    {
      key: 'productionDate',
      header: 'Date',
      render: (r) => formatDate(r.productionDate),
    },
    { key: 'productName', header: 'Product', sortable: true },
    {
      key: 'actualGoodOutput',
      header: 'Good Output',
      align: 'right',
      render: (r) => `${r.actualGoodOutput} pkts`,
    },
    {
      key: 'materialCost',
      header: 'Raw Material',
      align: 'right',
      render: (r) => formatINR(r.materialCost),
    },
    {
      key: 'packagingCost',
      header: 'Packaging',
      align: 'right',
      render: (r) => formatINR(r.packagingCost),
    },
    {
      key: 'overheads',
      header: 'Labour + Power',
      align: 'right',
      render: (r) => formatINR(r.labourCost + r.powerCost + r.otherOverheads),
    },
    {
      key: 'totalProductionCost',
      header: 'Total Cost',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatINR(r.totalProductionCost)}</span>,
    },
    {
      key: 'costPerPacket',
      header: 'Cost / Packet',
      align: 'right',
      render: (r) => <Badge variant="blue">{formatINR(r.costPerPacket)}</Badge>,
    },
    {
      key: 'grossMarginPct',
      header: 'Gross Margin',
      align: 'right',
      render: (r) => (
        <Badge variant={r.grossMarginPct >= 25 ? 'green' : 'amber'}>
          {formatINR(r.grossMarginPerPacket)} ({r.grossMarginPct}%)
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Breakdown',
      align: 'right',
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setSelected(r)}>
          View Formula
        </Button>
      ),
    },
  ];

  const chartData = items.slice(0, 8).map((r) => ({
    run: r.productionNumber,
    Material: r.materialCost,
    Packaging: r.packagingCost,
    Labour: r.labourCost,
    Power: r.powerCost,
  }));

  if (loading && items.length === 0) {
    return <LoadingSpinner label="Calculating weighted-average production costs..." />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Costing & Margin Analysis"
        description="Weighted-average raw material & packaging valuation + labour + power overheads computed dynamically from posted production runs."
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Weighted Cost / Packet"
          value={formatINR(overallCostPerPkt)}
          subtitle="Across all posted runs"
          icon={<Calculator className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          title="Selling Price (Pre-GST)"
          value={formatINR(avgSellingPrice)}
          icon={<Package className="h-5 w-5" />}
          tone="indigo"
        />
        <StatCard
          title="Gross Margin %"
          value={`${avgMarginPct.toFixed(2)}%`}
          subtitle={`${formatINR(avgSellingPrice - overallCostPerPkt)} / pkt`}
          icon={<TrendingUp className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          title="Total Production Spend"
          value={formatINR(totalCost)}
          subtitle={`${totalGood} good packets`}
          icon={<Layers className="h-5 w-5" />}
          tone="amber"
        />
      </div>

      {chartData.length > 0 && (
        <Card title="Batch Cost Composition" subtitle="Stacked breakdown of material, packaging, labour, and gas/electricity costs">
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="run" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v: number) => formatINR(v)} />
                <Legend />
                <Bar dataKey="Material" stackId="a" fill="#2563eb" />
                <Bar dataKey="Packaging" stackId="a" fill="#6366f1" />
                <Bar dataKey="Labour" stackId="a" fill="#10b981" />
                <Bar dataKey="Power" stackId="a" fill="#f59e0b" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      )}

      <Card>
        <DataTable
          data={items as Array<CostingRow & Record<string, unknown>>}
          columns={columns}
          loading={loading}
          searchPlaceholder="Search run number, product..."
        />
      </Card>

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title={`Costing Ledger — ${selected?.productionNumber}`}
        subtitle={`${selected?.productName} · Good Output: ${selected?.actualGoodOutput} packets`}
        size="lg"
      >
        {selected && (
          <div className="space-y-4">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Material / Component</th>
                    <th className="px-3 py-2 text-left">Category</th>
                    <th className="px-3 py-2 text-right">Actual Qty</th>
                    <th className="px-3 py-2 text-right">Wtd Avg Rate</th>
                    <th className="px-3 py-2 text-right">Total Cost</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {selected.materialsBreakdown.map((m, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 font-medium text-slate-900">{m.materialName}</td>
                      <td className="px-3 py-2">{m.category}</td>
                      <td className="px-3 py-2 text-right">
                        {m.actualQty} {m.unit}
                      </td>
                      <td className="px-3 py-2 text-right">{formatINR(m.unitCost)}</td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatINR(m.totalCost)}
                      </td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50/70">
                    <td className="px-3 py-2 font-medium" colSpan={4}>
                      Labour Overhead
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatINR(selected.labourCost)}
                    </td>
                  </tr>
                  <tr className="bg-slate-50/70">
                    <td className="px-3 py-2 font-medium" colSpan={4}>
                      Gas & Electricity Overhead
                    </td>
                    <td className="px-3 py-2 text-right font-semibold">
                      {formatINR(selected.powerCost)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="text-blue-700">Total Cost</p>
                <p className="text-sm font-bold text-blue-900">
                  {formatINR(selected.totalProductionCost)}
                </p>
              </div>
              <div>
                <p className="text-blue-700">Cost / Packet</p>
                <p className="text-sm font-bold text-blue-900">
                  ₹{selected.exactCostPerPacket.toFixed(4)}
                </p>
              </div>
              <div>
                <p className="text-blue-700">Selling Price</p>
                <p className="text-sm font-bold text-blue-900">
                  {formatINR(selected.sellingPrice)}
                </p>
              </div>
              <div>
                <p className="text-blue-700">Gross Margin</p>
                <p className="text-sm font-bold text-emerald-700">
                  {formatINR(selected.grossMarginPerPacket)} ({selected.grossMarginPct}%)
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
