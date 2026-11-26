import React, { useEffect, useState, useCallback } from 'react';
import {
  Boxes,
  Download,
  PlusCircle,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { api, downloadBlob, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Material, Product } from '../types';
import {
  PageHeader,
  Card,
  StatCard,
  Badge,
  Button,
  Modal,
  Input,
  Select,
} from '../components/ui/Primitives';
import { DataTable, Column } from '../components/ui/DataTable';
import { formatINR, formatDateTime } from '../utils/format';

interface Reconciliation {
  opening: number;
  receipts: number;
  issues: number;
  sales: number;
  returns: number;
  adjustments: number;
  computedClosing: number;
}

type MaterialInv = Material & {
  stockValue: number;
  isLowStock: boolean;
  reconciliation: Reconciliation;
};

type ProductInv = Product & {
  stockValue: number;
  retailValue: number;
  isLowStock: boolean;
  reconciliation: Reconciliation;
};

interface LedgerRow {
  _id: string;
  date: string;
  itemType: string;
  itemName: string;
  itemCode: string;
  movementType: string;
  direction: 'IN' | 'OUT';
  quantity: number;
  unit: string;
  previousBalance: number;
  newBalance: number;
  sourceDocNumber: string;
  userName: string;
  notes?: string;
}

export const InventoryPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<'raw' | 'packaging' | 'finished' | 'ledger'>('raw');
  const [rawMaterials, setRawMaterials] = useState<MaterialInv[]>([]);
  const [packagingMaterials, setPackagingMaterials] = useState<MaterialInv[]>([]);
  const [finishedGoods, setFinishedGoods] = useState<ProductInv[]>([]);
  const [totals, setTotals] = useState({
    rawMaterialValue: 0,
    packagingValue: 0,
    finishedGoodsValue: 0,
    lowStockCount: 0,
  });
  const [ledger, setLedger] = useState<LedgerRow[]>([]);
  const [movementFilter, setMovementFilter] = useState('');
  const [loading, setLoading] = useState(true);

  const [adjOpen, setAdjOpen] = useState(false);
  const [adjSaving, setAdjSaving] = useState(false);
  const [adjForm, setAdjForm] = useState({
    itemType: 'RAW_MATERIAL' as 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_GOOD',
    itemId: '',
    movementType: 'ADJUSTMENT' as 'ADJUSTMENT' | 'DAMAGE' | 'CUSTOMER_RETURN' | 'OPENING_STOCK',
    direction: 'IN' as 'IN' | 'OUT',
    quantity: 1,
    notes: '',
  });

  const canAdjust =
    user?.role === 'OWNER' ||
    user?.role === 'ADMIN' ||
    user?.role === 'PRODUCTION_SUPERVISOR';
  const canViewLedger = user?.role !== 'SALESMAN';

  const loadInventory = useCallback(async () => {
    setLoading(true);
    try {
      const sumRes = await api.get('/inventory/summary');
      const d = sumRes.data.data;
      setRawMaterials(d.rawMaterials || []);
      setPackagingMaterials(d.packagingMaterials || []);
      setFinishedGoods(d.finishedGoods || []);
      setTotals(d.totals || { rawMaterialValue: 0, packagingValue: 0, finishedGoodsValue: 0, lowStockCount: 0 });

      if (canViewLedger) {
        const legRes = await api.get('/inventory/ledger', {
          params: { limit: 150, movementType: movementFilter || undefined },
        });
        setLedger(legRes.data.data.items || []);
      }
    } catch (err) {
      toast('Failed to load inventory', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [canViewLedger, movementFilter, toast]);

  useEffect(() => {
    loadInventory();
  }, [loadInventory]);

  const handleAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdjSaving(true);
    try {
      await api.post('/inventory/adjustment', {
        ...adjForm,
        quantity: Number(adjForm.quantity),
      });
      toast('Stock adjustment posted to ledger', 'success');
      setAdjOpen(false);
      await loadInventory();
    } catch (err) {
      toast('Adjustment failed', 'error', getErrorMessage(err));
    } finally {
      setAdjSaving(false);
    }
  };

  const openAdjustmentModal = () => {
    setAdjForm({
      itemType: 'RAW_MATERIAL',
      itemId: rawMaterials[0]?._id || '',
      movementType: 'ADJUSTMENT',
      direction: 'IN',
      quantity: 1,
      notes: '',
    });
    setAdjOpen(true);
  };

  const materialCols: Column<MaterialInv & Record<string, unknown>>[] = [
    { key: 'code', header: 'Code', sortable: true },
    { key: 'name', header: 'Material', sortable: true },
    {
      key: 'opening',
      header: 'Opening',
      align: 'right',
      render: (r) => r.reconciliation.opening,
    },
    {
      key: 'receipts',
      header: 'Receipts',
      align: 'right',
      render: (r) => r.reconciliation.receipts,
    },
    {
      key: 'issues',
      header: 'Issues',
      align: 'right',
      render: (r) => r.reconciliation.issues,
    },
    {
      key: 'currentStock',
      header: 'Closing Stock',
      align: 'right',
      sortable: true,
      render: (r) => (
        <Badge variant={r.isLowStock ? 'red' : 'green'}>
          {r.currentStock} {r.unit}
        </Badge>
      ),
    },
    {
      key: 'weightedAvgRate',
      header: 'Wtd Avg Rate',
      align: 'right',
      render: (r) => formatINR(r.weightedAvgRate),
    },
    {
      key: 'stockValue',
      header: 'Valuation',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatINR(r.stockValue)}</span>,
    },
  ];

  const fgCols: Column<ProductInv & Record<string, unknown>>[] = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'name', header: 'Product', sortable: true },
    {
      key: 'opening',
      header: 'Opening',
      align: 'right',
      render: (r) => r.reconciliation.opening,
    },
    {
      key: 'produced',
      header: 'Produced',
      align: 'right',
      render: (r) => r.reconciliation.receipts,
    },
    {
      key: 'dispatched',
      header: 'Dispatched',
      align: 'right',
      render: (r) => r.reconciliation.sales,
    },
    {
      key: 'currentStock',
      header: 'Available Stock',
      align: 'right',
      sortable: true,
      render: (r) => (
        <Badge variant={r.isLowStock ? 'red' : 'green'}>
          {r.currentStock} {r.unit}
        </Badge>
      ),
    },
    {
      key: 'weightedAvgCost',
      header: 'Wtd Cost/Pkt',
      align: 'right',
      render: (r) => formatINR(r.weightedAvgCost),
    },
    {
      key: 'retailValue',
      header: 'Retail Value',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatINR(r.retailValue)}</span>,
    },
  ];

  const ledgerCols: Column<LedgerRow & Record<string, unknown>>[] = [
    { key: 'date', header: 'Date', render: (r) => formatDateTime(r.date) },
    {
      key: 'itemName',
      header: 'Item',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-900">{r.itemName}</p>
          <p className="text-xs text-slate-400">{r.itemCode}</p>
        </div>
      ),
    },
    {
      key: 'movementType',
      header: 'Movement',
      render: (r) => <Badge variant="blue">{r.movementType.replace(/_/g, ' ')}</Badge>,
    },
    {
      key: 'quantity',
      header: 'Qty',
      align: 'right',
      render: (r) => (
        <Badge variant={r.direction === 'IN' ? 'green' : 'amber'}>
          {r.direction === 'IN' ? '+' : '-'}
          {r.quantity} {r.unit}
        </Badge>
      ),
    },
    {
      key: 'previousBalance',
      header: 'Prev → New',
      align: 'right',
      render: (r) => `${r.previousBalance} → ${r.newBalance}`,
    },
    { key: 'sourceDocNumber', header: 'Source Doc' },
    { key: 'userName', header: 'User' },
  ];

  const itemChoices =
    adjForm.itemType === 'RAW_MATERIAL'
      ? rawMaterials.map((m) => ({ id: m._id, label: `${m.name} (${m.currentStock} ${m.unit})` }))
      : adjForm.itemType === 'PACKAGING'
      ? packagingMaterials.map((m) => ({ id: m._id, label: `${m.name} (${m.currentStock} ${m.unit})` }))
      : finishedGoods.map((p) => ({ id: p._id, label: `${p.name} (${p.currentStock} ${p.unit})` }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory & Immutable Stock Ledger"
        description="Real-time stock reconciliation (Closing = Opening + Receipts - Issues - Sales + Returns + Adjustments) with weighted-average valuation."
        actions={
          <div className="flex flex-wrap gap-2">
            {canViewLedger && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadBlob('/inventory/export?format=excel', 'stock-ledger.xlsx')}
                >
                  <Download className="h-4 w-4" /> Excel
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => downloadBlob('/inventory/export?format=csv', 'stock-ledger.csv')}
                >
                  <Download className="h-4 w-4" /> CSV
                </Button>
              </>
            )}
            {canAdjust && (
              <Button size="sm" onClick={openAdjustmentModal}>
                <PlusCircle className="h-4 w-4" /> Stock Adjustment
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Raw Material Valuation"
          value={formatINR(totals.rawMaterialValue)}
          icon={<Boxes className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          title="Packaging Stock Value"
          value={formatINR(totals.packagingValue)}
          icon={<Boxes className="h-5 w-5" />}
          tone="indigo"
        />
        <StatCard
          title="Finished Goods Retail Value"
          value={formatINR(totals.finishedGoodsValue)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          title="Low-Stock Alerts"
          value={totals.lowStockCount}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone={totals.lowStockCount > 0 ? 'red' : 'green'}
        />
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setTab('raw')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${
            tab === 'raw' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Raw Materials ({rawMaterials.length})
        </button>
        <button
          onClick={() => setTab('packaging')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${
            tab === 'packaging' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Packaging Materials ({packagingMaterials.length})
        </button>
        <button
          onClick={() => setTab('finished')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${
            tab === 'finished' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Finished Goods ({finishedGoods.length})
        </button>
        {canViewLedger && (
          <button
            onClick={() => setTab('ledger')}
            className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${
              tab === 'ledger' ? 'bg-blue-600 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            Stock Ledger ({ledger.length})
          </button>
        )}
      </div>

      <Card>
        {tab === 'raw' && (
          <DataTable
            data={rawMaterials as Array<MaterialInv & Record<string, unknown>>}
            columns={materialCols}
            loading={loading}
            searchPlaceholder="Search raw materials..."
          />
        )}
        {tab === 'packaging' && (
          <DataTable
            data={packagingMaterials as Array<MaterialInv & Record<string, unknown>>}
            columns={materialCols}
            loading={loading}
            searchPlaceholder="Search packaging items..."
          />
        )}
        {tab === 'finished' && (
          <DataTable
            data={finishedGoods as Array<ProductInv & Record<string, unknown>>}
            columns={fgCols}
            loading={loading}
            searchPlaceholder="Search finished products..."
          />
        )}
        {tab === 'ledger' && canViewLedger && (
          <DataTable
            data={ledger as Array<LedgerRow & Record<string, unknown>>}
            columns={ledgerCols}
            loading={loading}
            searchPlaceholder="Search item, doc number, notes..."
            toolbarExtra={
              <Select
                value={movementFilter}
                onChange={(e) => setMovementFilter(e.target.value)}
                className="w-48"
              >
                <option value="">All Movement Types</option>
                <option value="OPENING_STOCK">Opening Stock</option>
                <option value="PURCHASE_RECEIPT">Purchase Receipt</option>
                <option value="PRODUCTION_ISSUE">Production Issue</option>
                <option value="PRODUCTION_RECEIPT">Production Receipt</option>
                <option value="SALES_DISPATCH">Sales Dispatch</option>
                <option value="CUSTOMER_RETURN">Customer Return</option>
                <option value="DAMAGE">Damage</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </Select>
            }
          />
        )}
      </Card>

      <Modal
        open={adjOpen}
        onClose={() => setAdjOpen(false)}
        title="Record Ledger Stock Adjustment"
        subtitle="All stock changes create an immutable ledger entry and audit trail."
        size="md"
      >
        <form onSubmit={handleAdjustment} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Inventory Category"
              value={adjForm.itemType}
              onChange={(e) => {
                const t = e.target.value as 'RAW_MATERIAL' | 'PACKAGING' | 'FINISHED_GOOD';
                const list =
                  t === 'RAW_MATERIAL'
                    ? rawMaterials
                    : t === 'PACKAGING'
                    ? packagingMaterials
                    : finishedGoods;
                setAdjForm({ ...adjForm, itemType: t, itemId: list[0]?._id || '' });
              }}
            >
              <option value="RAW_MATERIAL">Raw Material</option>
              <option value="PACKAGING">Packaging Material</option>
              <option value="FINISHED_GOOD">Finished Good</option>
            </Select>
            <Select
              label="Item"
              value={adjForm.itemId}
              onChange={(e) => setAdjForm({ ...adjForm, itemId: e.target.value })}
            >
              {itemChoices.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </Select>
            <Select
              label="Movement Type"
              value={adjForm.movementType}
              onChange={(e) =>
                setAdjForm({
                  ...adjForm,
                  movementType: e.target.value as 'ADJUSTMENT' | 'DAMAGE' | 'CUSTOMER_RETURN' | 'OPENING_STOCK',
                })
              }
            >
              <option value="ADJUSTMENT">Adjustment</option>
              <option value="DAMAGE">Damage / Wastage</option>
              <option value="CUSTOMER_RETURN">Customer Return</option>
              <option value="OPENING_STOCK">Opening Stock</option>
            </Select>
            <Select
              label="Direction"
              value={adjForm.direction}
              onChange={(e) => setAdjForm({ ...adjForm, direction: e.target.value as 'IN' | 'OUT' })}
            >
              <option value="IN">IN (Add Stock)</option>
              <option value="OUT">OUT (Deduct Stock)</option>
            </Select>
          </div>
          <Input
            label="Quantity"
            type="number"
            step="0.01"
            min="0.01"
            required
            value={adjForm.quantity}
            onChange={(e) => setAdjForm({ ...adjForm, quantity: Number(e.target.value) })}
          />
          <Input
            label="Audit Reason / Notes"
            required
            minLength={3}
            value={adjForm.notes}
            onChange={(e) => setAdjForm({ ...adjForm, notes: e.target.value })}
            placeholder="Reason for adjustment..."
          />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => setAdjOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={adjSaving}>
              Post Ledger Movement
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
