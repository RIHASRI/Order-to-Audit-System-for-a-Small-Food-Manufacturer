import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Truck, AlertTriangle } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Dispatch, SalesOrder, Invoice } from '../types';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Modal,
  Input,
  Select,
} from '../components/ui/Primitives';
import { DataTable, Column } from '../components/ui/DataTable';
import { formatDate } from '../utils/format';

export const DispatchesPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [dispatches, setDispatches] = useState<Dispatch[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [salesOrderId, setSalesOrderId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [dispatchQtyMap, setDispatchQtyMap] = useState<Record<string, number>>({});

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [dRes, oRes, iRes] = await Promise.all([
        api.get('/dispatches'),
        api.get('/orders'),
        api.get('/invoices'),
      ]);
      setDispatches(dRes.data.data || []);
      setOrders(oRes.data.data || []);
      setInvoices(iRes.data.data || []);
    } catch (err) {
      toast('Failed to load dispatches', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const dispatchableOrders = orders.filter((o) =>
    ['APPROVED', 'PARTIALLY_DISPATCHED'].includes(o.status)
  );

  const selectedOrder = dispatchableOrders.find((o) => o._id === salesOrderId);

  const selectOrder = (id: string) => {
    setSalesOrderId(id);
    const ord = dispatchableOrders.find((o) => o._id === id);
    const matchingInv = invoices.find((i) => i.salesOrder === id && i.status === 'ACTIVE');
    setInvoiceId(matchingInv?._id || '');
    const map: Record<string, number> = {};
    ord?.items.forEach((item) => {
      const remaining = Math.max(0, (item.approvedQty || item.requestedQty) - item.dispatchedQty);
      const maxAllowed = Math.min(remaining, item.availableStock ?? remaining);
      map[item.product] = maxAllowed;
    });
    setDispatchQtyMap(map);
  };

  const openCreate = () => {
    if (dispatchableOrders[0]) {
      selectOrder(dispatchableOrders[0]._id);
    } else {
      setSalesOrderId('');
    }
    setVehicleNumber('');
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) return;
    setSaving(true);
    try {
      const lineItems = selectedOrder.items
        .map((i) => ({
          productId: i.product,
          quantity: Number(dispatchQtyMap[i.product] || 0),
        }))
        .filter((i) => i.quantity > 0);

      await api.post('/dispatches', {
        salesOrderId: selectedOrder._id,
        invoiceId: invoiceId || undefined,
        items: lineItems,
        vehicleNumber,
        idempotencyKey: `DISP-${selectedOrder._id}-${Date.now()}`,
      });
      toast('Dispatch confirmed & finished-goods stock deducted', 'success');
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      toast('Dispatch blocked', 'error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const updateDelivery = async (id: string, deliveryStatus: 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED') => {
    try {
      await api.patch(`/dispatches/${id}/status`, { deliveryStatus });
      toast(`Delivery status updated to ${deliveryStatus}`, 'success');
      await loadAll();
    } catch (err) {
      toast('Status update failed', 'error', getErrorMessage(err));
    }
  };

  const columns: Column<Dispatch & Record<string, unknown>>[] = [
    { key: 'dispatchNumber', header: 'Dispatch No', sortable: true },
    {
      key: 'dispatchDate',
      header: 'Date',
      sortable: true,
      render: (r) => formatDate(r.dispatchDate),
    },
    { key: 'salesOrderNumber', header: 'Order Ref' },
    { key: 'invoiceNumber', header: 'Invoice Ref', render: (r) => r.invoiceNumber || '-' },
    { key: 'customerName', header: 'Customer' },
    {
      key: 'totalDispatchedQty',
      header: 'Dispatched Qty',
      align: 'right',
      render: (r) => `${r.totalDispatchedQty} pkts`,
    },
    {
      key: 'deliveryStatus',
      header: 'Delivery Status',
      render: (r) =>
        canManage ? (
          <Select
            value={r.deliveryStatus}
            onChange={(e) =>
              updateDelivery(
                r._id,
                e.target.value as 'DISPATCHED' | 'IN_TRANSIT' | 'DELIVERED'
              )
            }
            className="w-36 text-xs py-1"
          >
            <option value="DISPATCHED">Dispatched</option>
            <option value="IN_TRANSIT">In Transit</option>
            <option value="DELIVERED">Delivered</option>
          </Select>
        ) : (
          <Badge variant={r.deliveryStatus === 'DELIVERED' ? 'green' : 'blue'}>
            {r.deliveryStatus}
          </Badge>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dispatch Management"
        description="Confirm partial or full dispatches linked to approved orders & GST invoices with strict available-stock enforcement."
        actions={
          canManage && (
            <Button onClick={openCreate} disabled={dispatchableOrders.length === 0}>
              <Plus className="h-4 w-4" /> Create Dispatch
            </Button>
          )
        }
      />

      <Card>
        <DataTable
          data={dispatches as Array<Dispatch & Record<string, unknown>>}
          columns={columns}
          loading={loading}
          searchPlaceholder="Search dispatch, order, invoice, customer..."
        />
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Confirm Goods Dispatch"
        subtitle="Deducts finished-goods inventory atomically and updates order fulfillment status."
        size="lg"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select
              label="Approved / Partially Dispatched Order"
              value={salesOrderId}
              onChange={(e) => selectOrder(e.target.value)}
            >
              {dispatchableOrders.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.orderNumber} — {o.customerName}
                </option>
              ))}
            </Select>
            <Select
              label="Linked GST Invoice (Optional)"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
            >
              <option value="">No linked invoice</option>
              {invoices
                .filter((i) => i.status === 'ACTIVE')
                .map((i) => (
                  <option key={i._id} value={i._id}>
                    {i.invoiceNumber} — {i.customerSnapshot.name}
                  </option>
                ))}
            </Select>
          </div>

          {selectedOrder && (
            <div className="space-y-2">
              {selectedOrder.items.map((item) => {
                const remaining = Math.max(
                  0,
                  (item.approvedQty || item.requestedQty) - item.dispatchedQty
                );
                const avail = item.availableStock ?? 0;
                const qty = dispatchQtyMap[item.product] ?? 0;
                const exceedsStock = qty > avail;
                return (
                  <div
                    key={item.product}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center rounded-xl border border-slate-200 p-3"
                  >
                    <div className="sm:col-span-6">
                      <p className="text-sm font-semibold text-slate-900">{item.productName}</p>
                      <p className="text-xs text-slate-500">
                        Remaining Order Qty: <strong>{remaining}</strong> · Available Stock:{' '}
                        <strong>{avail}</strong>
                      </p>
                      {exceedsStock && (
                        <Badge variant="red" className="mt-1">
                          <AlertTriangle className="h-3 w-3" /> Exceeds stock by {qty - avail}
                        </Badge>
                      )}
                    </div>
                    <div className="sm:col-span-6">
                      <Input
                        label="Dispatch Quantity"
                        type="number"
                        min="0"
                        max={remaining}
                        value={qty}
                        onChange={(e) =>
                          setDispatchQtyMap({
                            ...dispatchQtyMap,
                            [item.product]: Number(e.target.value),
                          })
                        }
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Input
            label="Vehicle / Transport Number"
            value={vehicleNumber}
            onChange={(e) => setVehicleNumber(e.target.value)}
            placeholder="e.g. TN-45-AX-4412"
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <Truck className="h-4 w-4" /> Confirm Dispatch
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
