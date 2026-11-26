import React, { useEffect, useState, useCallback } from 'react';
import {
  Plus,
  Download,
  Printer,
  FileX2,
  RotateCcw,
  Eye,
  FileText,
} from 'lucide-react';
import { api, downloadBlob, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Invoice, SalesOrder, Customer, Product } from '../types';
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

export const InvoicesPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [orders, setOrders] = useState<SalesOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [mode, setMode] = useState<'order' | 'direct'>('order');
  const [salesOrderId, setSalesOrderId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState(50);
  const [saving, setSaving] = useState(false);

  const [viewInvoice, setViewInvoice] = useState<Invoice | null>(null);
  const [reasonModal, setReasonModal] = useState<{
    invoice: Invoice;
    action: 'cancel' | 'credit-note';
  } | null>(null);
  const [reasonText, setReasonText] = useState('');

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [iRes, oRes, cRes, pRes] = await Promise.all([
        api.get('/invoices'),
        api.get('/orders'),
        api.get('/customers'),
        api.get('/products'),
      ]);
      setInvoices(iRes.data.data || []);
      setOrders(oRes.data.data || []);
      setCustomers(cRes.data.data || []);
      setProducts(pRes.data.data || []);
    } catch (err) {
      toast('Failed to load invoices', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const eligibleOrders = orders.filter((o) =>
    ['APPROVED', 'PARTIALLY_DISPATCHED', 'DISPATCHED'].includes(o.status)
  );

  const openCreate = () => {
    setMode(eligibleOrders.length > 0 ? 'order' : 'direct');
    setSalesOrderId(eligibleOrders[0]?._id || '');
    setCustomerId(customers[0]?._id || '');
    setProductId(products[0]?._id || '');
    setQuantity(50);
    setCreateOpen(true);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload =
        mode === 'order'
          ? { salesOrderId }
          : {
              customerId,
              items: [{ productId, quantity: Number(quantity) }],
            };
      await api.post('/invoices', payload);
      toast('GST Tax Invoice generated', 'success');
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      toast('Invoice creation failed', 'error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancelOrCreditNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reasonModal) return;
    try {
      const { invoice, action } = reasonModal;
      await api.post(`/invoices/${invoice._id}/${action}`, {
        reason: reasonText || 'Adjustment requested',
      });
      toast(
        action === 'cancel' ? 'Invoice cancelled' : 'Credit Note issued',
        'success'
      );
      setReasonModal(null);
      setReasonText('');
      await loadAll();
    } catch (err) {
      toast('Action failed', 'error', getErrorMessage(err));
    }
  };

  const columns: Column<Invoice & Record<string, unknown>>[] = [
    { key: 'invoiceNumber', header: 'Invoice No', sortable: true },
    {
      key: 'invoiceDate',
      header: 'Date',
      sortable: true,
      render: (r) => formatDate(r.invoiceDate),
    },
    {
      key: 'customer',
      header: 'Customer / Place of Supply',
      render: (r) => (
        <div>
          <p className="font-medium text-slate-900">{r.customerSnapshot.name}</p>
          <p className="text-xs text-slate-500">
            {r.placeOfSupply} · {r.isInterState ? 'IGST' : 'CGST+SGST'}
          </p>
        </div>
      ),
    },
    {
      key: 'taxableValue',
      header: 'Taxable',
      align: 'right',
      render: (r) => formatINR(r.taxableValue),
    },
    {
      key: 'tax',
      header: 'GST',
      align: 'right',
      render: (r) => formatINR(r.cgstTotal + r.sgstTotal + r.igstTotal),
    },
    {
      key: 'grandTotal',
      header: 'Grand Total',
      align: 'right',
      render: (r) => <span className="font-semibold">{formatINR(r.grandTotal)}</span>,
    },
    {
      key: 'outstandingAmount',
      header: 'Balance Due',
      align: 'right',
      render: (r) => (
        <Badge variant={r.outstandingAmount > 0 ? 'amber' : 'green'}>
          {formatINR(r.outstandingAmount)}
        </Badge>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (r) => (
        <Badge
          variant={
            r.status === 'ACTIVE' ? 'green' : r.status === 'CREDIT_NOTE' ? 'blue' : 'red'
          }
        >
          {r.status}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onClick={() => setViewInvoice(r)}>
            <Eye className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            title="Download GST PDF"
            onClick={() =>
              downloadBlob(
                `/invoices/${r._id}/pdf`,
                `${r.invoiceNumber.replace(/\//g, '-')}.pdf`
              )
            }
          >
            <Download className="h-4 w-4 text-blue-600" />
          </Button>
          {canManage && r.status === 'ACTIVE' && (
            <>
              <Button
                size="sm"
                variant="ghost"
                title="Issue Credit Note"
                onClick={() => {
                  setReasonModal({ invoice: r, action: 'credit-note' });
                  setReasonText('');
                }}
              >
                <RotateCcw className="h-4 w-4 text-amber-600" />
              </Button>
              {r.paidAmount === 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  title="Cancel Invoice"
                  onClick={() => {
                    setReasonModal({ invoice: r, action: 'cancel' });
                    setReasonText('');
                  }}
                >
                  <FileX2 className="h-4 w-4 text-red-600" />
                </Button>
              )}
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="GST Invoicing & Tax Compliance"
        description="Generate intra-state (CGST+SGST) and inter-state (IGST) invoices with downloadable PDFs, print view, and credit notes."
        actions={
          canManage && (
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" /> Generate GST Invoice
            </Button>
          )
        }
      />

      <Card>
        <DataTable
          data={invoices as Array<Invoice & Record<string, unknown>>}
          columns={columns}
          loading={loading}
          searchPlaceholder="Search invoice number, customer, order ref..."
        />
      </Card>

      {/* Generate Invoice Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Generate GST Tax Invoice"
        size="md"
      >
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant={mode === 'order' ? 'primary' : 'secondary'}
              onClick={() => setMode('order')}
            >
              From Approved Order
            </Button>
            <Button
              type="button"
              size="sm"
              variant={mode === 'direct' ? 'primary' : 'secondary'}
              onClick={() => setMode('direct')}
            >
              Direct Invoice
            </Button>
          </div>

          {mode === 'order' ? (
            <Select
              label="Approved Sales Order"
              value={salesOrderId}
              onChange={(e) => setSalesOrderId(e.target.value)}
            >
              {eligibleOrders.map((o) => (
                <option key={o._id} value={o._id}>
                  {o.orderNumber} — {o.customerName} ({formatINR(o.grandTotal)})
                </option>
              ))}
            </Select>
          ) : (
            <div className="space-y-3">
              <Select
                label="Customer"
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
              >
                {customers.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} ({c.state} · {c.stateCode})
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-2 gap-3">
                <Select
                  label="Product"
                  value={productId}
                  onChange={(e) => setProductId(e.target.value)}
                >
                  {products.map((p) => (
                    <option key={p._id} value={p._id}>
                      {p.name} ({formatINR(p.sellingPrice)})
                    </option>
                  ))}
                </Select>
                <Input
                  label="Quantity"
                  type="number"
                  min="1"
                  required
                  value={quantity}
                  onChange={(e) => setQuantity(Number(e.target.value))}
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              <FileText className="h-4 w-4" /> Issue Invoice
            </Button>
          </div>
        </form>
      </Modal>

      {/* Print Preview & Tax Breakdown Modal */}
      <Modal
        open={Boolean(viewInvoice)}
        onClose={() => setViewInvoice(null)}
        title={`${viewInvoice?.status === 'CREDIT_NOTE' ? 'Credit Note' : 'Tax Invoice'} — ${viewInvoice?.invoiceNumber}`}
        size="lg"
      >
        {viewInvoice && (
          <div className="space-y-5">
            <div className="flex justify-between items-start border-b border-slate-200 pb-4">
              <div>
                <p className="text-base font-bold text-slate-900">{viewInvoice.sellerDetails.name}</p>
                <p className="text-xs text-slate-600">GSTIN: {viewInvoice.sellerDetails.gstin}</p>
                <p className="text-xs text-slate-500">{viewInvoice.sellerDetails.address}</p>
              </div>
              <div className="text-right text-xs">
                <p className="font-semibold text-slate-900">FY: {viewInvoice.financialYear}</p>
                <p className="text-slate-600">Date: {formatDate(viewInvoice.invoiceDate)}</p>
                <p className="text-slate-600">Place of Supply: {viewInvoice.placeOfSupply}</p>
              </div>
            </div>

            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs">
              <p className="font-semibold text-slate-800">
                Billed To: {viewInvoice.customerSnapshot.name}
              </p>
              <p className="text-slate-600">
                GSTIN: {viewInvoice.customerSnapshot.gstin || 'Unregistered'} ·{' '}
                {viewInvoice.customerSnapshot.address}
              </p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full divide-y divide-slate-200 text-xs">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left">Item & HSN</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Rate</th>
                    <th className="px-3 py-2 text-right">Taxable</th>
                    <th className="px-3 py-2 text-right">GST</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewInvoice.items.map((item, idx) => (
                    <tr key={idx}>
                      <td className="px-3 py-2">
                        <p className="font-medium text-slate-900">{item.productName}</p>
                        <p className="text-slate-400">HSN: {item.hsnCode}</p>
                      </td>
                      <td className="px-3 py-2 text-right">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-3 py-2 text-right">{formatINR(item.unitPrice)}</td>
                      <td className="px-3 py-2 text-right">{formatINR(item.taxableValue)}</td>
                      <td className="px-3 py-2 text-right">
                        {viewInvoice.isInterState
                          ? `IGST ${item.igstRate}%: ${formatINR(item.igstAmount)}`
                          : `CGST ${item.cgstRate}% (${formatINR(item.cgstAmount)}) + SGST ${item.sgstRate}% (${formatINR(item.sgstAmount)})`}
                      </td>
                      <td className="px-3 py-2 text-right font-semibold">
                        {formatINR(item.lineTotal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 border-t border-slate-200 pt-4">
              <div className="no-print flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4" /> Print Invoice
                </Button>
                <Button
                  size="sm"
                  onClick={() =>
                    downloadBlob(
                      `/invoices/${viewInvoice._id}/pdf`,
                      `${viewInvoice.invoiceNumber.replace(/\//g, '-')}.pdf`
                    )
                  }
                >
                  <Download className="h-4 w-4" /> Download PDF
                </Button>
              </div>
              <div className="text-xs space-y-1 text-right ml-auto">
                <p>Taxable Value: {formatINR(viewInvoice.taxableValue)}</p>
                {viewInvoice.isInterState ? (
                  <p>IGST: {formatINR(viewInvoice.igstTotal)}</p>
                ) : (
                  <>
                    <p>CGST: {formatINR(viewInvoice.cgstTotal)}</p>
                    <p>SGST: {formatINR(viewInvoice.sgstTotal)}</p>
                  </>
                )}
                <p className="text-base font-bold text-blue-700">
                  Grand Total: {formatINR(viewInvoice.grandTotal)}
                </p>
                <p className="text-slate-500">
                  Paid: {formatINR(viewInvoice.paidAmount)} · Balance:{' '}
                  {formatINR(viewInvoice.outstandingAmount)}
                </p>
              </div>
            </div>
          </div>
        )}
      </Modal>

      {/* Cancel / Credit Note Modal */}
      <Modal
        open={Boolean(reasonModal)}
        onClose={() => setReasonModal(null)}
        title={
          reasonModal?.action === 'cancel'
            ? `Cancel Invoice ${reasonModal?.invoice.invoiceNumber}`
            : `Issue Credit Note for ${reasonModal?.invoice.invoiceNumber}`
        }
        size="sm"
      >
        <form onSubmit={handleCancelOrCreditNote} className="space-y-4">
          <Input
            label="Reason"
            required
            value={reasonText}
            onChange={(e) => setReasonText(e.target.value)}
            placeholder="Enter audit reason..."
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setReasonModal(null)}>
              Close
            </Button>
            <Button variant="danger" type="submit">
              Confirm
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
