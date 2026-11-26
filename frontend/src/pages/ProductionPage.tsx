import React, { useEffect, useState, useCallback } from 'react';
import { Plus, AlertTriangle, CheckCircle2, Eye, Factory } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { ProductionRun, Product, BOM } from '../types';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Modal,
  Input,
  Select,
  StatCard,
} from '../components/ui/Primitives';
import { DataTable, Column } from '../components/ui/DataTable';
import { formatINR, formatDate, formatNumber } from '../utils/format';

export const ProductionPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [runs, setRuns] = useState<ProductionRun[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [boms, setBoms] = useState<BOM[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRun, setSelectedRun] = useState<ProductionRun | null>(null);
  const [onlyAlerts, setOnlyAlerts] = useState(false);

  // New production run modal state
  const [createOpen, setCreateOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [productId, setProductId] = useState('');
  const [bomId, setBomId] = useState('');
  const [batchSize, setBatchSize] = useState(1);
  const [productionDate, setProductionDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expectedOutput, setExpectedOutput] = useState(200);
  const [actualGoodOutput, setActualGoodOutput] = useState(200);
  const [damagedPouches, setDamagedPouches] = useState(0);
  const [cartonsUsed, setCartonsUsed] = useState(10);
  const [wastageQty, setWastageQty] = useState(0);
  const [wastageNotes, setWastageNotes] = useState('');
  const [labourCost, setLabourCost] = useState(1200);
  const [powerCost, setPowerCost] = useState(600);
  const [otherOverheads, setOtherOverheads] = useState(0);
  const [rawInputs, setRawInputs] = useState<
    Array<{ materialId: string; materialName: string; unit: string; plannedQty: number; actualQty: number }>
  >([]);

  const canPostRun = user?.role === 'OWNER' || user?.role === 'PRODUCTION_SUPERVISOR';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, pRes, bRes] = await Promise.all([
        api.get('/production', {
          params: onlyAlerts ? { hasVarianceAlert: 'true' } : undefined,
        }),
        api.get('/products'),
        api.get('/boms'),
      ]);
      setRuns(rRes.data.data || []);
      setProducts(pRes.data.data || []);
      setBoms(bRes.data.data || []);
    } catch (err) {
      toast('Failed to load production data', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [onlyAlerts, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const scaleBomForRun = async (targetBomId: string, targetBatchSize: number) => {
    if (!targetBomId) return;
    try {
      const res = await api.get(`/boms/${targetBomId}/scale`, {
        params: { batchSize: targetBatchSize },
      });
      const scaled = res.data.data.scaled;
      setExpectedOutput(scaled.expectedOutput);
      setActualGoodOutput(scaled.expectedOutput);
      setLabourCost(scaled.standardLabourCost);
      setPowerCost(scaled.standardPowerCost);
      setCartonsUsed(Math.floor(scaled.expectedOutput / 20));
      setRawInputs(
        scaled.plannedMaterials
          .filter((m: { category: string }) => m.category === 'RAW_MATERIAL')
          .map((m: { materialId: string; materialName: string; unit: string; plannedQty: number }) => ({
            materialId: m.materialId,
            materialName: m.materialName,
            unit: m.unit,
            plannedQty: m.plannedQty,
            actualQty: m.plannedQty,
          }))
      );
    } catch (err) {
      toast('Failed to scale BOM', 'error', getErrorMessage(err));
    }
  };

  const openCreateModal = async () => {
    const defaultProd = products[0];
    const activeBom = boms.find(
      (b) => b.product === defaultProd?._id && b.isActive
    ) || boms[0];
    setProductId(defaultProd?._id || '');
    setBomId(activeBom?._id || '');
    setBatchSize(1);
    setDamagedPouches(0);
    setWastageQty(0);
    setWastageNotes('');
    setOtherOverheads(0);
    setCreateOpen(true);
    if (activeBom) {
      await scaleBomForRun(activeBom._id, 1);
    }
  };

  const handleProductChange = async (pid: string) => {
    setProductId(pid);
    const activeBom = boms.find((b) => b.product === pid && b.isActive) || boms.find((b) => b.product === pid);
    if (activeBom) {
      setBomId(activeBom._id);
      await scaleBomForRun(activeBom._id, batchSize);
    } else {
      setBomId('');
      setRawInputs([]);
    }
  };

  const handleSubmitRun = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/production', {
        productId,
        bomId: bomId || undefined,
        productionDate,
        batchSize: Number(batchSize),
        actualRawMaterials: rawInputs.map((r) => ({
          materialId: r.materialId,
          actualQty: Number(r.actualQty),
        })),
        actualGoodOutput: Number(actualGoodOutput),
        damagedQuantity: Math.max(0, expectedOutput - Number(actualGoodOutput)),
        damagedPouches: Number(damagedPouches),
        cartonsUsed: Number(cartonsUsed),
        wastageQty: Number(wastageQty),
        wastageNotes,
        labourCost: Number(labourCost),
        powerCost: Number(powerCost),
        otherOverheads: Number(otherOverheads),
      });
      toast('Production run posted atomically to inventory & costing ledger', 'success');
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      toast('Failed to post production run', 'error', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const liveYieldVar =
    expectedOutput > 0
      ? Number((((actualGoodOutput - expectedOutput) / expectedOutput) * 100).toFixed(2))
      : 0;

  const totalGood = runs.reduce((s, r) => s + r.actualGoodOutput, 0);
  const totalAlerts = runs.filter((r) => r.hasVarianceAlert).length;
  const avgCost =
    totalGood > 0
      ? runs.reduce((s, r) => s + r.totalProductionCost, 0) / totalGood
      : 0;

  const columns: Column<ProductionRun & Record<string, unknown>>[] = [
    { key: 'productionNumber', header: 'Run No', sortable: true },
    {
      key: 'productionDate',
      header: 'Date',
      sortable: true,
      render: (r) => formatDate(r.productionDate),
    },
    {
      key: 'productName',
      header: 'Product',
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-slate-900">{r.productName}</p>
          <p className="text-xs text-slate-500">
            BOM v{r.bomVersion} · Batch {r.batchSize}
          </p>
        </div>
      ),
    },
    {
      key: 'actualGoodOutput',
      header: 'Output (Good / Exp)',
      align: 'right',
      render: (r) => `${r.actualGoodOutput} / ${r.expectedOutput} pkts`,
    },
    {
      key: 'yieldVariancePct',
      header: 'Yield Var %',
      align: 'right',
      render: (r) => (
        <Badge variant={Math.abs(r.yieldVariancePct) > 3 ? 'red' : 'green'}>
          {r.yieldVariancePct > 0 ? `+${r.yieldVariancePct}` : r.yieldVariancePct}%
        </Badge>
      ),
    },
    {
      key: 'totalProductionCost',
      header: 'Total Cost',
      align: 'right',
      render: (r) => formatINR(r.totalProductionCost),
    },
    {
      key: 'costPerPacket',
      header: 'Cost / Pkt',
      align: 'right',
      render: (r) => <span className="font-semibold text-slate-900">{formatINR(r.costPerPacket)}</span>,
    },
    {
      key: 'hasVarianceAlert',
      header: 'Status',
      render: (r) =>
        r.hasVarianceAlert ? (
          <Badge variant="red">
            <AlertTriangle className="h-3 w-3" /> Alert (&gt;3%)
          </Badge>
        ) : (
          <Badge variant="green">
            <CheckCircle2 className="h-3 w-3" /> Within Tolerance
          </Badge>
        ),
    },
    {
      key: 'actions',
      header: 'Details',
      align: 'right',
      render: (r) => (
        <Button size="sm" variant="ghost" onClick={() => setSelectedRun(r)}>
          <Eye className="h-4 w-4" /> Inspect
        </Button>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Production Management"
        description="Execute atomic production runs, track actual vs BOM consumption, flag >3% variances, and update finished-goods stock."
        actions={
          canPostRun && (
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" /> Post Production Run
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Production Runs"
          value={runs.length}
          subtitle={`${formatNumber(totalGood, 0)} good packets manufactured`}
          icon={<Factory className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          title="Average Cost Per Packet"
          value={formatINR(avgCost)}
          subtitle="Weighted raw + packaging + overheads"
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          title="Variance Alerts (>3%)"
          value={totalAlerts}
          subtitle="Yield or material consumption deviations"
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={totalAlerts > 0 ? 'red' : 'green'}
        />
      </div>

      <Card>
        <DataTable
          data={runs as Array<ProductionRun & Record<string, unknown>>}
          columns={columns}
          loading={loading}
          searchPlaceholder="Search run number, product, supervisor..."
          toolbarExtra={
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyAlerts}
                onChange={(e) => setOnlyAlerts(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Show variance alerts (&gt;3%) only
            </label>
          }
        />
      </Card>

      {/* Run Detail Inspection Modal */}
      <Modal
        open={Boolean(selectedRun)}
        onClose={() => setSelectedRun(null)}
        title={`Production Run ${selectedRun?.productionNumber}`}
        subtitle={`${selectedRun?.productName} · Supervisor: ${selectedRun?.supervisorName} · ${formatDate(selectedRun?.productionDate)}`}
        size="lg"
      >
        {selectedRun && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Output (Good / Exp)</p>
                <p className="text-base font-bold text-slate-900">
                  {selectedRun.actualGoodOutput} / {selectedRun.expectedOutput}
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Yield Variance</p>
                <p
                  className={`text-base font-bold ${
                    Math.abs(selectedRun.yieldVariancePct) > 3 ? 'text-red-600' : 'text-emerald-600'
                  }`}
                >
                  {selectedRun.yieldVariancePct}%
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                <p className="text-xs text-slate-500">Total Batch Cost</p>
                <p className="text-base font-bold text-slate-900">
                  {formatINR(selectedRun.totalProductionCost)}
                </p>
              </div>
              <div className="rounded-xl bg-blue-50 border border-blue-200 p-3">
                <p className="text-xs text-blue-700">Cost Per Packet</p>
                <p className="text-base font-bold text-blue-900">
                  {formatINR(selectedRun.costPerPacket)}
                </p>
              </div>
            </div>

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                Material-Wise Consumption & Variance
              </h4>
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full divide-y divide-slate-200 text-xs">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold text-slate-600">Material</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Planned</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Actual</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Var %</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Unit Cost</th>
                      <th className="px-3 py-2 text-right font-semibold text-slate-600">Line Cost</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {selectedRun.materials.map((m, idx) => (
                      <tr key={idx}>
                        <td className="px-3 py-2 font-medium text-slate-900">
                          {m.materialName} ({m.unit})
                        </td>
                        <td className="px-3 py-2 text-right">{m.plannedQty}</td>
                        <td className="px-3 py-2 text-right font-semibold">{m.actualQty}</td>
                        <td className="px-3 py-2 text-right">
                          <Badge variant={m.isAlert ? 'red' : 'green'}>
                            {m.variancePct > 0 ? `+${m.variancePct}` : m.variancePct}%
                          </Badge>
                        </td>
                        <td className="px-3 py-2 text-right">{formatINR(m.unitCost)}</td>
                        <td className="px-3 py-2 text-right font-semibold">
                          {formatINR(m.totalCost)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-slate-50 rounded-xl p-4 border border-slate-200">
              <div>
                <p className="text-slate-500">Material Cost</p>
                <p className="font-semibold text-slate-900">{formatINR(selectedRun.materialCost)}</p>
              </div>
              <div>
                <p className="text-slate-500">Packaging Cost</p>
                <p className="font-semibold text-slate-900">{formatINR(selectedRun.packagingCost)}</p>
              </div>
              <div>
                <p className="text-slate-500">Labour + Gas/Power</p>
                <p className="font-semibold text-slate-900">
                  {formatINR(selectedRun.labourCost + selectedRun.powerCost)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Damaged Pouches / Wastage</p>
                <p className="font-semibold text-slate-900">
                  {selectedRun.damagedPouches} pouches · {selectedRun.wastageQty} pkts
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Post New Production Run Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Post New Production Run"
        subtitle="Atomically deducts raw & packaging stock, logs consumption variance, and receives finished goods."
        size="lg"
      >
        <form onSubmit={handleSubmitRun} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Product"
              value={productId}
              onChange={(e) => handleProductChange(e.target.value)}
            >
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
            <Input
              label="Batch Size"
              type="number"
              step="0.25"
              min="0.1"
              required
              value={batchSize}
              onChange={(e) => {
                const bs = Number(e.target.value || 1);
                setBatchSize(bs);
                if (bomId) scaleBomForRun(bomId, bs);
              }}
            />
            <Input
              label="Production Date"
              type="date"
              required
              value={productionDate}
              onChange={(e) => setProductionDate(e.target.value)}
            />
          </div>

          {/* Raw Material Actuals */}
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
              Raw Material Issuance (Planned vs Actual)
            </p>
            <div className="space-y-2">
              {rawInputs.map((r, idx) => {
                const varPct =
                  r.plannedQty > 0
                    ? (((r.actualQty - r.plannedQty) / r.plannedQty) * 100).toFixed(2)
                    : '0';
                const alert = Math.abs(Number(varPct)) > 3;
                return (
                  <div
                    key={r.materialId}
                    className="grid grid-cols-12 gap-2 items-center rounded-lg border border-slate-200 px-3 py-2 bg-slate-50/50"
                  >
                    <div className="col-span-5 text-xs font-medium text-slate-800">
                      {r.materialName} ({r.unit})
                    </div>
                    <div className="col-span-3 text-xs text-slate-500">
                      Planned: <span className="font-semibold text-slate-800">{r.plannedQty}</span>
                    </div>
                    <div className="col-span-2">
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={r.actualQty}
                        onChange={(e) => {
                          const next = [...rawInputs];
                          next[idx].actualQty = Number(e.target.value);
                          setRawInputs(next);
                        }}
                      />
                    </div>
                    <div className="col-span-2 text-right">
                      <Badge variant={alert ? 'red' : 'green'}>{varPct}%</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Input
              label={`Actual Good Output (Exp: ${expectedOutput})`}
              type="number"
              min="0"
              required
              value={actualGoodOutput}
              onChange={(e) => {
                const val = Number(e.target.value);
                setActualGoodOutput(val);
                setWastageQty(Math.max(0, expectedOutput - val));
                setCartonsUsed(Math.floor(val / 20));
              }}
            />
            <Input
              label="Damaged Pouches"
              type="number"
              min="0"
              value={damagedPouches}
              onChange={(e) => setDamagedPouches(Number(e.target.value))}
            />
            <Input
              label="Cartons Used"
              type="number"
              min="0"
              value={cartonsUsed}
              onChange={(e) => setCartonsUsed(Number(e.target.value))}
            />
            <div className="flex flex-col justify-end pb-1">
              <span className="text-xs text-slate-500 mb-1">Live Yield Variance</span>
              <Badge variant={Math.abs(liveYieldVar) > 3 ? 'red' : 'green'}>
                {liveYieldVar > 0 ? `+${liveYieldVar}` : liveYieldVar}%
              </Badge>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Input
              label="Labour Cost (₹)"
              type="number"
              min="0"
              required
              value={labourCost}
              onChange={(e) => setLabourCost(Number(e.target.value))}
            />
            <Input
              label="Gas & Electricity Cost (₹)"
              type="number"
              min="0"
              required
              value={powerCost}
              onChange={(e) => setPowerCost(Number(e.target.value))}
            />
            <Input
              label="Other Overheads (₹)"
              type="number"
              min="0"
              value={otherOverheads}
              onChange={(e) => setOtherOverheads(Number(e.target.value))}
            />
          </div>

          <Input
            label="Wastage / Batch Notes"
            value={wastageNotes}
            onChange={(e) => setWastageNotes(e.target.value)}
            placeholder="Describe sealing damage or yield variance reason if >3%"
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={submitting}>
              Post Production Run
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
