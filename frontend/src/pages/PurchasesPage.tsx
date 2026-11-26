import React, { useEffect, useState, useCallback } from 'react';
import { Plus, PackageCheck, CreditCard, Trash2, ShoppingCart } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { PurchaseOrder, Supplier, Material } from '../types';
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
import { formatINR, formatDate } from '../utils/format';

export const PurchasesPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [purchases, setPurchases] = useState<PurchaseOrder[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [supplierId, setSupplierId] = useState('');
  const [purchaseDate, setPurchaseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [receiveImmediately, setReceiveImmediately] = useState(true);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<
    Array<{ materialId: string; quantity: number; rate: number; gstRate: number }>
  >([]);

  const [payTarget, setPayTarget] = useState<PurchaseOrder | null>(null);
  const [paidAmount, setPaidAmount] = useState(0);

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [poRes, supRes, matRes] = await Promise.all([
        api.get('/purchases'),
        api.get('/suppliers'),
        api.get('/materials'),
      ]);
      setPurchases(poRes.data.data || []);
      setSuppliers(supRes.data.data || []);
      setMaterials(matRes.data.data || []);
    } catch (err) {
      toast('Failed to load purchase orders', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openCreate = () => {
    setSupplierId(suppliers[0]?._id || '');
    setReceiveImmediately(true);
    setNotes('');
    setItems(
      materials[0]
        ? [
            {
              materialId: materials[0]._id,
              quantity: 50,
              rate: materials[0].weightedAvgRate || 45,
              gstRate: 0,
            },
          ]
        : []
    );
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/purchases', {
        supplierId,
        purchaseDate,
        items: items.map((i) => ({
          materialId: i.materialId,
          quantity: Number(i.quantity),
          rate: Number(i.rate),
          gstRate: Number(i.gstRate),
        })),
        receiveImmediately,
        notes,
      });
      toast(
        receiveImmediately
          ? 'Purchase created & stock received into weighted-average ledger'
          : 'Purchase order created (Pending Receipt)',
        'success'
      );
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      toast('Failed to create PO', 'error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleReceive = async (poId: string) => {
    try {
      await api.post(`/purchases/${poId}/receive`);
      toast('Goods received and stock valuation updated', 'success');
      await loadAll();
    } catch (err) {
      toast('Receive failed', 'error', getErrorMessage(err));
    }
  };

  const handleUpdatePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payTarget) return;
    try {
      await api.patch(`/purchases/${payTarget._id}/payment`, {
        paidAmount: Number(paidAmount),
      });
      toast('Supplier payment status updated', 'success');
      setPayTarget(null);
      await loadAll();
    } catch (err) {
      toast('Payment update failed', 'error', getErrorMessage(err));
    }
  };

  const totalSpend = purchases.reduce((s, p) => s + p.grandTotal, 0);
  const pendingReceipts = purchases.filter((p) => p.receiptStatus === 'PENDING').length;

  const columns: Column<PurchaseOrder & Record<string, unknown>>[] = [
    { key: 'poNumber', header: 'PO No', sortable: true },
    {
      key: 'purchaseDate',
      header: 'Date',
      sortable: true,
      render: (r) => formatDate(r.purchaseDate),
    },
    { key: 'supplierName', header: 'Supplier', sortable: true },
    {
      key: 'items',
      header: 'Materials',
      render: (r) => (
        <div className="text-xs">
          {r.items.map((i, idx) => (
            <div key={idx}>
              {i.materialName}: {i.quantity} {i.unit} @ {formatINR(i.rate)}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'grandTotal',
      header: 'Total',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatINR(r.grandTotal)}</span>,
    },
    {
      key: 'receiptStatus',
      header: 'Receipt',
      render: (r) => (
        <Badge variant={r.receiptStatus === 'RECEIVED' ? 'green' : 'amber'}>
          {r.receiptStatus}
        </Badge>
      ),
    },
    {
      key: 'paymentStatus',
      header: 'Payment',
      render: (r) => (
        <Badge
          variant={
            r.paymentStatus === 'PAID'
              ? 'green'
              : r.paymentStatus === 'PARTIAL'
              ? 'amber'
              : 'red'
          }
        >
          {r.paymentStatus} ({formatINR(r.paidAmount)})
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        canManage ? (
          <div className="flex justify-end gap-1">
            {r.receiptStatus === 'PENDING' && (
              <Button size="sm" variant="success" onClick={() => handleReceive(r._id)}>
                <PackageCheck className="h-3.5 w-3.5" /> Receive
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setPayTarget(r);
                setPaidAmount(r.grandTotal);
              }}
            >
              <CreditCard className="h-3.5 w-3.5" /> Pay
            </Button>
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read-only</span>
        ),
    },
  ];

  const poPreviewTotal = items.reduce((s, i) => {
    const sub = Number(i.quantity) * Number(i.rate);
    return s + sub + (sub * Number(i.gstRate)) / 100;
  }, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchase Management"
        description="Procure raw and packaging materials, receive stock into inventory, and update weighted-average valuations."
        actions={
          canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Create Purchase Order
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          title="Total Purchase Orders"
          value={purchases.length}
          icon={<ShoppingCart className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          title="Total Purchase Value"
          value={formatINR(totalSpend)}
          icon={<CreditCard className="h-5 w-5" />}
          tone="indigo"
        />
        <StatCard
          title="Pending Receipts"
          value={pendingReceipts}
          icon={<PackageCheck className="h-5 w-5" />}
          tone={pendingReceipts > 0 ? 'amber' : 'green'}
        />
      </div>

      <Card>
        <DataTable
          data={purchases as Array<PurchaseOrder & Record<string, unknown>>}
          columns={columns}
          loading={loading}
          searchPlaceholder="Search PO number, supplier, material..."
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Purchase Order"
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Supplier"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
            >
              {suppliers.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Input
              label="Purchase Date"
              type="date"
              required
              value={purchaseDate}
              onChange={(e) => setPurchaseDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Line Items
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  materials[0] &&
                  setItems([
                    ...items,
                    {
                      materialId: materials[0]._id,
                      quantity: 10,
                      rate: materials[0].weightedAvgRate || 0,
                      gstRate: 0,
                    },
                  ])
                }
              >
                + Add Line
              </Button>
            </div>
            {items.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-5">
                  <Select
                    label={idx === 0 ? 'Material' : undefined}
                    value={line.materialId}
                    onChange={(e) => {
                      const mat = materials.find((m) => m._id === e.target.value);
                      const next = [...items];
                      next[idx] = {
                        ...next[idx],
                        materialId: e.target.value,
                        rate: mat?.weightedAvgRate ?? next[idx].rate,
                      };
                      setItems(next);
                    }}
                  >
                    {materials.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.unit})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-2">
                  <Input
                    label={idx === 0 ? 'Qty' : undefined}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx].quantity = Number(e.target.value);
                      setItems(next);
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    label={idx === 0 ? 'Rate (₹)' : undefined}
                    type="number"
                    step="0.01"
                    min="0"
                    value={line.rate}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx].rate = Number(e.target.value);
                      setItems(next);
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <Input
                    label={idx === 0 ? 'GST %' : undefined}
                    type="number"
                    step="0.1"
                    min="0"
                    value={line.gstRate}
                    onChange={(e) => {
                      const next = [...items];
                      next[idx].gstRate = Number(e.target.value);
                      setItems(next);
                    }}
                  />
                </div>
                <div className="col-span-1 text-right pb-1">
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setItems(items.filter((_, i) => i !== idx))}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl bg-slate-50 border border-slate-200 px-4 py-3">
            <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
              <input
                type="checkbox"
                checked={receiveImmediately}
                onChange={(e) => setReceiveImmediately(e.target.checked)}
                className="rounded border-slate-300 text-blue-600"
              />
              Receive goods immediately & update stock valuation
            </label>
            <div className="text-sm font-bold text-slate-900">
              PO Total: {formatINR(poPreviewTotal)}
            </div>
          </div>

          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Invoice / delivery challan reference"
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create Purchase Order
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(payTarget)}
        onClose={() => setPayTarget(null)}
        title={`Update Supplier Payment — ${payTarget?.poNumber}`}
        size="sm"
      >
        <form onSubmit={handleUpdatePayment} className="space-y-4">
          <p className="text-xs text-slate-600">
            PO Grand Total: <strong>{formatINR(payTarget?.grandTotal)}</strong>
          </p>
          <Input
            label="Paid Amount (₹)"
            type="number"
            step="0.01"
            min="0"
            max={payTarget?.grandTotal}
            required
            value={paidAmount}
            onChange={(e) => setPaidAmount(Number(e.target.value))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => setPayTarget(null)}>
              Cancel
            </Button>
            <Button type="submit">Update Payment</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
