import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  WifiOff,
  RefreshCw,
  Trash2,
  ClipboardCheck,
} from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { SalesOrder, Customer, Product, OrderStatus } from '../types';
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
import { formatINR, formatDate } from '../utils/format';
import {
  OfflineOrderPayload,
  listOfflineOrders,
  saveOfflineOrder,
  clearOfflineOrders,
} from '../utils/offlineDb';

const STATUS_BADGE: Record<OrderStatus, 'slate' | 'blue' | 'amber' | 'green' | 'red'> = {
  DRAFT: 'slate',
  SUBMITTED: 'blue',
  UNDER_REVIEW: 'amber',
  APPROVED: 'green',
  REJECTED: 'red',
  PARTIALLY_DISPATCHED: 'amber',
  DISPATCHED: 'green',
  CANCELLED: 'red',
};

export const OrdersPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [offlineQueue, setOfflineQueue] = useState<OfflineOrderPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');

  // Mobile-first Order Entry Modal
  const [entryOpen, setEntryOpen] = useState(false);
  const [customerId, setCustomerId] = useState('');
  const [orderItems, setOrderItems] = useState<
    Array<{ productId: string; quantity: number; unitPrice: number }>
  >([]);
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Admin Review Modal
  const [reviewOrder, setReviewOrder] = useState<SalesOrder | null>(null);
  const [reviewItems, setReviewItems] = useState<
    Array<{ productId: string; productName: string; approvedQty: number; unitPrice: number; availableStock: number }>
  >([]);
  const [rejectionReason, setRejectionReason] = useState('');
  const [reviewSaving, setReviewSaving] = useState(false);

  const canCreate = user?.role === 'SALESMAN' || user?.role === 'ADMIN' || user?.role === 'OWNER';
  const canApprove = user?.role === 'ADMIN' || user?.role === 'OWNER';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [oRes, cRes, pRes, offList] = await Promise.all([
        api.get('/orders', { params: statusFilter ? { status: statusFilter } : undefined }),
        api.get('/customers'),
        api.get('/products'),
        listOfflineOrders().catch(() => []),
      ]);
      setOrders(oRes.data.data || []);
      setCustomers(cRes.data.data || []);
      setProducts(pRes.data.data || []);
      setOfflineQueue(offList);
    } catch (err) {
      toast('Failed to load orders', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openEntryModal = () => {
    setCustomerId(customers[0]?._id || '');
    setOrderNotes('');
    setOrderItems(
      products[0]
        ? [{ productId: products[0]._id, quantity: 10, unitPrice: products[0].sellingPrice }]
        : []
    );
    setEntryOpen(true);
  };

  const selectedCustomer = customers.find((c) => c._id === customerId);
  const estSubtotal = orderItems.reduce(
    (s, i) => s + Number(i.quantity) * Number(i.unitPrice),
    0
  );
  const estGst = orderItems.reduce((s, i) => {
    const p = products.find((pr) => pr._id === i.productId);
    const rate = p?.gstRate ?? 5;
    return s + (Number(i.quantity) * Number(i.unitPrice) * rate) / 100;
  }, 0);
  const estGrandTotal = estSubtotal + estGst;

  const submitOrder = async (asOffline = false, status: 'DRAFT' | 'SUBMITTED' = 'SUBMITTED') => {
    setSubmitting(true);
    try {
      if (asOffline || !navigator.onLine) {
        const offlinePayload: OfflineOrderPayload = {
          offlineId: `OFF-${Date.now()}`,
          customerId,
          customerName: selectedCustomer?.name || 'Customer',
          items: orderItems.map((i) => ({
            productId: i.productId,
            productName: products.find((p) => p._id === i.productId)?.name || '',
            quantity: Number(i.quantity),
            unitPrice: Number(i.unitPrice),
          })),
          grandTotal: estGrandTotal,
          notes: orderNotes,
          createdAt: new Date().toISOString(),
        };
        await saveOfflineOrder(offlinePayload);
        toast('Order saved offline to IndexedDB', 'info', 'Sync whenever network is available.');
        setEntryOpen(false);
        setOfflineQueue(await listOfflineOrders());
        return;
      }

      await api.post('/orders', {
        customerId,
        items: orderItems.map((i) => ({
          productId: i.productId,
          quantity: Number(i.quantity),
          unitPrice: Number(i.unitPrice),
        })),
        status,
        notes: orderNotes,
      });
      toast(`Sales order ${status === 'DRAFT' ? 'saved as draft' : 'submitted'}`, 'success');
      setEntryOpen(false);
      await loadAll();
    } catch (err) {
      toast('Order submission failed', 'error', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const syncOfflineQueue = async () => {
    if (offlineQueue.length === 0) return;
    try {
      await api.post('/orders/sync-offline', {
        orders: offlineQueue.map((o) => ({
          customerId: o.customerId,
          items: o.items.map((i) => ({
            productId: i.productId,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
          })),
          status: 'SUBMITTED',
          notes: o.notes,
          offlineId: o.offlineId,
        })),
      });
      await clearOfflineOrders(offlineQueue.map((o) => o.offlineId));
      toast(`Synced ${offlineQueue.length} offline order(s) idempotently`, 'success');
      await loadAll();
    } catch (err) {
      toast('Offline sync failed', 'error', getErrorMessage(err));
    }
  };

  const openReviewModal = (order: SalesOrder) => {
    setReviewOrder(order);
    setRejectionReason(order.rejectionReason || '');
    setReviewItems(
      order.items.map((i) => ({
        productId: i.product,
        productName: i.productName,
        approvedQty: i.approvedQty || i.requestedQty,
        unitPrice: i.unitPrice,
        availableStock: i.availableStock ?? 0,
      }))
    );
  };

  const handleReviewAction = async (status: 'APPROVED' | 'REJECTED' | 'UNDER_REVIEW') => {
    if (!reviewOrder) return;
    setReviewSaving(true);
    try {
      await api.patch(`/orders/${reviewOrder._id}`, {
        status,
        items: reviewItems.map((i) => ({
          productId: i.productId,
          approvedQty: Number(i.approvedQty),
          unitPrice: Number(i.unitPrice),
        })),
        rejectionReason: status === 'REJECTED' ? rejectionReason : undefined,
      });
      toast(`Order ${reviewOrder.orderNumber} updated to ${status}`, 'success');
      setReviewOrder(null);
      await loadAll();
    } catch (err) {
      toast('Order review failed', 'error', getErrorMessage(err));
    } finally {
      setReviewSaving(false);
    }
  };

  const columns: Column<SalesOrder & Record<string, unknown>>[] = [
    { key: 'orderNumber', header: 'Order No', sortable: true },
    {
      key: 'orderDate',
      header: 'Date',
      sortable: true,
      render: (r) => formatDate(r.orderDate),
    },
    {
      key: 'customerName',
      header: 'Customer',
      sortable: true,
      render: (r) => (
        <div>
          <p className="font-medium text-slate-900">{r.customerName}</p>
          <p className="text-xs text-slate-500">
            {r.customerState} · Sales: {r.salesmanName}
          </p>
        </div>
      ),
    },
    {
      key: 'items',
      header: 'Qty / Stock Check',
      render: (r) => (
        <div className="text-xs space-y-0.5">
          {r.items.map((i, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <span>
                {i.productName}: <strong>{i.approvedQty || i.requestedQty}</strong> {i.unit}
              </span>
              {(i.shortage ?? 0) > 0 && r.status !== 'DISPATCHED' && (
                <Badge variant="red">
                  Short: {i.shortage} (Avail: {i.availableStock})
                </Badge>
              )}
            </div>
          ))}
        </div>
      ),
    },
    {
      key: 'grandTotal',
      header: 'Grand Total',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatINR(r.grandTotal)}</span>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => <Badge variant={STATUS_BADGE[r.status]}>{r.status}</Badge>,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        canApprove && !['DISPATCHED', 'CANCELLED'].includes(r.status) ? (
          <Button size="sm" variant="secondary" onClick={() => openReviewModal(r)}>
            <ClipboardCheck className="h-3.5 w-3.5" /> Review
          </Button>
        ) : (
          <span className="text-xs text-slate-400">
            {r.rejectionReason ? `Reason: ${r.rejectionReason}` : '-'}
          </span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sales Orders & Field Entry"
        description="Mobile-first salesman ordering (with IndexedDB offline sync) and admin stock-verified approval workflow."
        actions={
          <div className="flex flex-wrap gap-2">
            {offlineQueue.length > 0 && (
              <Button variant="secondary" onClick={syncOfflineQueue}>
                <RefreshCw className="h-4 w-4" /> Sync Offline ({offlineQueue.length})
              </Button>
            )}
            {canCreate && (
              <Button onClick={openEntryModal}>
                <Plus className="h-4 w-4" /> New Sales Order
              </Button>
            )}
          </div>
        }
      />

      {offlineQueue.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-amber-900">
            <WifiOff className="h-4 w-4 text-amber-600" />
            <span>
              <strong>{offlineQueue.length} order(s)</strong> queued in IndexedDB offline storage.
            </span>
          </div>
          <Button size="sm" onClick={syncOfflineQueue}>
            <RefreshCw className="h-3.5 w-3.5" /> Sync Now
          </Button>
        </div>
      )}

      <Card>
        <DataTable
          data={orders as Array<SalesOrder & Record<string, unknown>>}
          columns={columns}
          loading={loading}
          searchPlaceholder="Search order no, customer, salesman..."
          toolbarExtra={
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-48"
            >
              <option value="">All Statuses</option>
              <option value="SUBMITTED">Submitted</option>
              <option value="UNDER_REVIEW">Under Review</option>
              <option value="APPROVED">Approved</option>
              <option value="PARTIALLY_DISPATCHED">Partially Dispatched</option>
              <option value="DISPATCHED">Dispatched</option>
              <option value="REJECTED">Rejected</option>
            </Select>
          }
        />
      </Card>

      {/* Mobile-First Sales Order Entry Modal */}
      <Modal
        open={entryOpen}
        onClose={() => setEntryOpen(false)}
        title="New Sales Order"
        subtitle="Select customer, pick finished products, verify live pricing & GST, and submit."
        size="lg"
      >
        <div className="space-y-4">
          <Select
            label="Customer"
            value={customerId}
            onChange={(e) => setCustomerId(e.target.value)}
          >
            {customers.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name} ({c.state} · {c.customerType})
              </option>
            ))}
          </Select>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Order Items
              </span>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  products[0] &&
                  setOrderItems([
                    ...orderItems,
                    { productId: products[0]._id, quantity: 10, unitPrice: products[0].sellingPrice },
                  ])
                }
              >
                + Add Product
              </Button>
            </div>

            {orderItems.map((line, idx) => {
              const prod = products.find((p) => p._id === line.productId);
              return (
                <div
                  key={idx}
                  className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end rounded-xl border border-slate-200 p-3 bg-slate-50/50"
                >
                  <div className="sm:col-span-5">
                    <Select
                      label="Product"
                      value={line.productId}
                      onChange={(e) => {
                        const p = products.find((pr) => pr._id === e.target.value);
                        const next = [...orderItems];
                        next[idx] = {
                          ...next[idx],
                          productId: e.target.value,
                          unitPrice: p?.sellingPrice ?? next[idx].unitPrice,
                        };
                        setOrderItems(next);
                      }}
                    >
                      {products.map((p) => (
                        <option key={p._id} value={p._id}>
                          {p.name} (Stock: {p.currentStock} {p.unit})
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      label="Quantity"
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => {
                        const next = [...orderItems];
                        next[idx].quantity = Number(e.target.value);
                        setOrderItems(next);
                      }}
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      label={`Unit Price (${prod?.gstRate ?? 5}% GST)`}
                      type="number"
                      step="0.01"
                      value={line.unitPrice}
                      onChange={(e) => {
                        const next = [...orderItems];
                        next[idx].unitPrice = Number(e.target.value);
                        setOrderItems(next);
                      }}
                    />
                  </div>
                  <div className="sm:col-span-1 text-right">
                    {orderItems.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setOrderItems(orderItems.filter((_, i) => i !== idx))}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Input
            label="Order Notes"
            value={orderNotes}
            onChange={(e) => setOrderNotes(e.target.value)}
            placeholder="Delivery schedule or special instructions"
          />

          <div className="rounded-xl bg-blue-50 border border-blue-200 p-4 flex flex-wrap justify-between gap-2 text-xs">
            <div>
              <span className="text-blue-700">Taxable Subtotal: </span>
              <strong>{formatINR(estSubtotal)}</strong>
              <span className="text-blue-700 ml-3">GST: </span>
              <strong>{formatINR(estGst)}</strong>
            </div>
            <div className="text-sm font-bold text-blue-900">
              Order Total: {formatINR(estGrandTotal)}
            </div>
          </div>

          <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => submitOrder(true)}>
              <WifiOff className="h-4 w-4" /> Save Offline
            </Button>
            <Button
              variant="secondary"
              type="button"
              disabled={submitting}
              onClick={() => submitOrder(false, 'DRAFT')}
            >
              Save Draft
            </Button>
            <Button type="button" loading={submitting} onClick={() => submitOrder(false, 'SUBMITTED')}>
              Submit Order
            </Button>
          </div>
        </div>
      </Modal>

      {/* Admin Stock-Verified Review Modal */}
      <Modal
        open={Boolean(reviewOrder)}
        onClose={() => setReviewOrder(null)}
        title={`Review Order ${reviewOrder?.orderNumber}`}
        subtitle={`${reviewOrder?.customerName} (${reviewOrder?.customerState})`}
        size="lg"
      >
        {reviewOrder && (
          <div className="space-y-4">
            <div className="space-y-2">
              {reviewItems.map((item, idx) => {
                const shortage = Math.max(0, item.approvedQty - item.availableStock);
                return (
                  <div
                    key={item.productId}
                    className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-center rounded-xl border border-slate-200 p-3"
                  >
                    <div className="sm:col-span-5">
                      <p className="text-sm font-semibold text-slate-900">{item.productName}</p>
                      <p className="text-xs text-slate-500">
                        Available Finished Stock: <strong>{item.availableStock}</strong>
                      </p>
                      {shortage > 0 && (
                        <Badge variant="red" className="mt-1">
                          <AlertTriangle className="h-3 w-3" /> Shortage: {shortage} pkts
                        </Badge>
                      )}
                    </div>
                    <div className="sm:col-span-3">
                      <Input
                        label="Approved Qty"
                        type="number"
                        min="0"
                        value={item.approvedQty}
                        onChange={(e) => {
                          const next = [...reviewItems];
                          next[idx].approvedQty = Number(e.target.value);
                          setReviewItems(next);
                        }}
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <Input
                        label="Unit Price (₹)"
                        type="number"
                        step="0.01"
                        value={item.unitPrice}
                        onChange={(e) => {
                          const next = [...reviewItems];
                          next[idx].unitPrice = Number(e.target.value);
                          setReviewItems(next);
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <Input
              label="Rejection Reason (required only if rejecting)"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g. Credit limit exceeded or customer cancelled"
            />

            <div className="flex flex-wrap justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                variant="danger"
                loading={reviewSaving}
                onClick={() => handleReviewAction('REJECTED')}
              >
                <XCircle className="h-4 w-4" /> Reject
              </Button>
              <Button
                variant="secondary"
                loading={reviewSaving}
                onClick={() => handleReviewAction('UNDER_REVIEW')}
              >
                Mark Under Review
              </Button>
              <Button
                variant="success"
                loading={reviewSaving}
                onClick={() => handleReviewAction('APPROVED')}
              >
                <CheckCircle2 className="h-4 w-4" /> Approve Order
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
