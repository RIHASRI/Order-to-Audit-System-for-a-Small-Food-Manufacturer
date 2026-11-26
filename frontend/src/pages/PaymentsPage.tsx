import React, { useEffect, useState, useCallback } from 'react';
import { Plus, CreditCard, Wallet, Clock } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Payment, Invoice } from '../types';
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
import { formatINR, formatDate } from '../utils/format';

interface AgeingCustomer {
  customerId: string;
  customerName: string;
  state: string;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  bucket0_30: number;
  bucket31_60: number;
  bucket61_90: number;
  bucket90Plus: number;
  invoiceCount: number;
}

interface ReceivablesPayload {
  summary: {
    totalReceivables: number;
    bucket0_30: number;
    bucket31_60: number;
    bucket61_90: number;
    bucket90Plus: number;
  };
  customers: AgeingCustomer[];
}

export const PaymentsPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<'ageing' | 'payments'>('ageing');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [receivables, setReceivables] = useState<ReceivablesPayload>({
    summary: {
      totalReceivables: 0,
      bucket0_30: 0,
      bucket31_60: 0,
      bucket61_90: 0,
      bucket90Plus: 0,
    },
    customers: [],
  });
  const [loading, setLoading] = useState(true);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [invoiceId, setInvoiceId] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<
    'CASH' | 'BANK_TRANSFER' | 'UPI' | 'CHEQUE' | 'NEFT' | 'RTGS'
  >('UPI');
  const [transactionRef, setTransactionRef] = useState('');
  const [notes, setNotes] = useState('');

  const canManage = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [pRes, rRes, iRes] = await Promise.all([
        api.get('/payments'),
        api.get('/receivables'),
        api.get('/invoices'),
      ]);
      setPayments(pRes.data.data || []);
      setReceivables(rRes.data.data);
      setInvoices(iRes.data.data || []);
    } catch (err) {
      toast('Failed to load payments & ageing', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const unpaidInvoices = invoices.filter(
    (i) => i.status === 'ACTIVE' && i.outstandingAmount > 0
  );

  const openRecordPayment = () => {
    const first = unpaidInvoices[0];
    setInvoiceId(first?._id || '');
    setAmount(first?.outstandingAmount || 0);
    setPaymentMethod('UPI');
    setTransactionRef('');
    setNotes('');
    setCreateOpen(true);
  };

  const handleRecord = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/payments', {
        invoiceId,
        paymentDate,
        amount: Number(amount),
        paymentMethod,
        transactionRef,
        notes,
      });
      toast('Payment recorded & invoice balance updated', 'success');
      setCreateOpen(false);
      await loadAll();
    } catch (err) {
      toast('Failed to record payment', 'error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const ageingCols: Column<AgeingCustomer & Record<string, unknown>>[] = [
    { key: 'customerName', header: 'Customer', sortable: true },
    { key: 'state', header: 'State' },
    {
      key: 'totalBilled',
      header: 'Total Billed',
      align: 'right',
      render: (r) => formatINR(r.totalBilled),
    },
    {
      key: 'totalPaid',
      header: 'Total Paid',
      align: 'right',
      render: (r) => formatINR(r.totalPaid),
    },
    {
      key: 'outstanding',
      header: 'Outstanding',
      align: 'right',
      sortable: true,
      render: (r) => (
        <Badge variant={r.outstanding > 0 ? 'amber' : 'green'}>
          {formatINR(r.outstanding)}
        </Badge>
      ),
    },
    {
      key: 'bucket0_30',
      header: '0–30 Days',
      align: 'right',
      render: (r) => formatINR(r.bucket0_30),
    },
    {
      key: 'bucket31_60',
      header: '31–60 Days',
      align: 'right',
      render: (r) => formatINR(r.bucket31_60),
    },
    {
      key: 'bucket61_90',
      header: '61–90 Days',
      align: 'right',
      render: (r) => formatINR(r.bucket61_90),
    },
    {
      key: 'bucket90Plus',
      header: '>90 Days',
      align: 'right',
      render: (r) => formatINR(r.bucket90Plus),
    },
  ];

  const paymentCols: Column<Payment & Record<string, unknown>>[] = [
    { key: 'paymentNumber', header: 'Receipt No', sortable: true },
    {
      key: 'paymentDate',
      header: 'Date',
      sortable: true,
      render: (r) => formatDate(r.paymentDate),
    },
    { key: 'customerName', header: 'Customer', sortable: true },
    { key: 'invoiceNumber', header: 'Invoice Ref' },
    {
      key: 'paymentMethod',
      header: 'Method',
      render: (r) => <Badge variant="blue">{r.paymentMethod}</Badge>,
    },
    { key: 'transactionRef', header: 'Transaction Ref' },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (r) => <span className="font-semibold text-emerald-700">{formatINR(r.amount)}</span>,
    },
    { key: 'recordedByName', header: 'Recorded By' },
  ];

  const totalCollected = payments.reduce((s, p) => s + p.amount, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments & Receivables Ageing"
        description="Track partial/multiple customer receipts, outstanding balances, and 0–30 / 31–60 / 61–90 / >90 day ageing buckets."
        actions={
          canManage && (
            <Button onClick={openRecordPayment} disabled={unpaidInvoices.length === 0}>
              <Plus className="h-4 w-4" /> Record Payment
            </Button>
          )
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <StatCard
          title="Total Outstanding Receivables"
          value={formatINR(receivables.summary.totalReceivables)}
          icon={<Wallet className="h-5 w-5" />}
          tone="amber"
        />
        <StatCard
          title="Total Collections"
          value={formatINR(totalCollected)}
          icon={<CreditCard className="h-5 w-5" />}
          tone="green"
        />
        <StatCard
          title="0–30 Days Bucket"
          value={formatINR(receivables.summary.bucket0_30)}
          icon={<Clock className="h-5 w-5" />}
          tone="blue"
        />
        <StatCard
          title="Overdue (>30 Days)"
          value={formatINR(
            receivables.summary.bucket31_60 +
              receivables.summary.bucket61_90 +
              receivables.summary.bucket90Plus
          )}
          icon={<Clock className="h-5 w-5" />}
          tone="red"
        />
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => setTab('ageing')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${
            tab === 'ageing'
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Customer Receivables & Ageing ({receivables.customers.length})
        </button>
        <button
          onClick={() => setTab('payments')}
          className={`rounded-lg px-3.5 py-2 text-xs font-semibold ${
            tab === 'payments'
              ? 'bg-blue-600 text-white'
              : 'bg-white border border-slate-200 text-slate-600'
          }`}
        >
          Payment Receipts ({payments.length})
        </button>
      </div>

      <Card>
        {tab === 'ageing' ? (
          <DataTable
            data={receivables.customers as Array<AgeingCustomer & Record<string, unknown>>}
            columns={ageingCols}
            loading={loading}
            searchPlaceholder="Search customer..."
          />
        ) : (
          <DataTable
            data={payments as Array<Payment & Record<string, unknown>>}
            columns={paymentCols}
            loading={loading}
            searchPlaceholder="Search receipt no, invoice, transaction ref..."
          />
        )}
      </Card>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Record Customer Payment"
        size="md"
      >
        <form onSubmit={handleRecord} className="space-y-4">
          <Select
            label="Unpaid / Partially Paid Invoice"
            value={invoiceId}
            onChange={(e) => {
              const inv = unpaidInvoices.find((i) => i._id === e.target.value);
              setInvoiceId(e.target.value);
              if (inv) setAmount(inv.outstandingAmount);
            }}
          >
            {unpaidInvoices.map((i) => (
              <option key={i._id} value={i._id}>
                {i.invoiceNumber} — {i.customerSnapshot.name} (Due: {formatINR(i.outstandingAmount)})
              </option>
            ))}
          </Select>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Payment Date"
              type="date"
              required
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
            <Input
              label="Amount Received (₹)"
              type="number"
              step="0.01"
              min="0.01"
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <Select
              label="Payment Method"
              value={paymentMethod}
              onChange={(e) =>
                setPaymentMethod(
                  e.target.value as
                    | 'CASH'
                    | 'BANK_TRANSFER'
                    | 'UPI'
                    | 'CHEQUE'
                    | 'NEFT'
                    | 'RTGS'
                )
              }
            >
              <option value="UPI">UPI</option>
              <option value="BANK_TRANSFER">Bank Transfer</option>
              <option value="NEFT">NEFT</option>
              <option value="RTGS">RTGS</option>
              <option value="CHEQUE">Cheque</option>
              <option value="CASH">Cash</option>
            </Select>
            <Input
              label="Transaction Reference"
              required
              minLength={2}
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="UTR / UPI Ref / Cheque No"
            />
          </div>

          <Input
            label="Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Partial or final settlement note"
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Record Payment
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
