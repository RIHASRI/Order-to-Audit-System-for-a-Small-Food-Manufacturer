import dayjs from 'dayjs';
import { Payment, PaymentMethod } from '../models/Payment';
import { Invoice } from '../models/Invoice';
import { withTransaction } from '../config/db';
import { getNextSequence } from '../utils/sequence';
import { roundMoney } from '../utils/decimal';
import { AppError, NotFoundError } from '../utils/errors';
import { recordAuditLog } from './auditService';
import { AuthUser } from '../middleware/auth';

export interface RecordPaymentInput {
  invoiceId: string;
  paymentDate?: string | Date;
  amount: number;
  paymentMethod: PaymentMethod;
  transactionRef: string;
  notes?: string;
}

export async function listPayments(filters: {
  customerId?: string;
  invoiceId?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}) {
  const query: Record<string, unknown> = {};
  if (filters.customerId) query.customer = filters.customerId;
  if (filters.invoiceId) query.invoice = filters.invoiceId;
  if (filters.search) {
    query.$or = [
      { paymentNumber: { $regex: filters.search, $options: 'i' } },
      { invoiceNumber: { $regex: filters.search, $options: 'i' } },
      { customerName: { $regex: filters.search, $options: 'i' } },
      { transactionRef: { $regex: filters.search, $options: 'i' } },
    ];
  }
  if (filters.startDate || filters.endDate) {
    const range: Record<string, Date> = {};
    if (filters.startDate) range.$gte = new Date(filters.startDate);
    if (filters.endDate) {
      const end = new Date(filters.endDate);
      end.setHours(23, 59, 59, 999);
      range.$lte = end;
    }
    query.paymentDate = range;
  }

  return Payment.find(query).sort({ paymentDate: -1, createdAt: -1 }).lean();
}

export async function recordPayment(
  input: RecordPaymentInput,
  actor: AuthUser
) {
  return withTransaction(async (session) => {
    const invoice = await Invoice.findById(input.invoiceId).session(session);
    if (!invoice) throw new NotFoundError('Invoice not found');
    if (invoice.status !== 'ACTIVE') {
      throw new AppError('Payments can only be recorded against ACTIVE invoices');
    }

    const amount = roundMoney(input.amount);
    if (amount <= 0) {
      throw new AppError('Payment amount must be greater than zero');
    }

    const remainingDue = roundMoney(invoice.grandTotal - invoice.paidAmount);
    if (amount > remainingDue) {
      throw new AppError(
        `Payment amount ₹${amount} exceeds remaining balance due ₹${remainingDue}`
      );
    }

    const paymentNumber = await getNextSequence('payment', 'PAY-2026-', 4, session);

    invoice.paidAmount = roundMoney(invoice.paidAmount + amount);
    await invoice.save({ session });

    const [payment] = await Payment.create(
      [
        {
          paymentNumber,
          customer: invoice.customer,
          customerName: invoice.customerSnapshot.name,
          invoice: invoice._id,
          invoiceNumber: invoice.invoiceNumber,
          paymentDate: input.paymentDate ? new Date(input.paymentDate) : new Date(),
          amount,
          paymentMethod: input.paymentMethod,
          transactionRef: input.transactionRef,
          notes: input.notes,
          recordedBy: actor.id,
          recordedByName: actor.name,
        },
      ],
      { session }
    );

    const newOutstanding = roundMoney(invoice.grandTotal - invoice.paidAmount);

    await recordAuditLog({
      userId: actor.id,
      userName: actor.name,
      userRole: actor.role,
      action: 'RECORD_PAYMENT',
      entityType: 'PAYMENT',
      entityId: String(payment._id),
      entityRef: paymentNumber,
      summary: `Recorded ₹${amount} payment (${paymentNumber}) from ${invoice.customerSnapshot.name} against ${invoice.invoiceNumber}. Outstanding: ₹${newOutstanding}`,
      session,
    });

    return {
      payment: payment.toObject(),
      invoiceOutstanding: newOutstanding,
    };
  });
}

export async function getReceivablesAndAgeing(asOfDate: Date = new Date()) {
  const activeInvoices = await Invoice.find({ status: 'ACTIVE' })
    .sort({ invoiceDate: -1 })
    .lean();

  const refDate = dayjs(asOfDate);
  const customerMap = new Map<
    string,
    {
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
  >();

  const invoiceBalances = [];

  for (const inv of activeInvoices) {
    const outstanding = roundMoney(Math.max(0, inv.grandTotal - inv.paidAmount));
    const daysOld = Math.max(0, refDate.diff(dayjs(inv.invoiceDate), 'day'));

    const bucket =
      daysOld <= 30
        ? '0-30'
        : daysOld <= 60
        ? '31-60'
        : daysOld <= 90
        ? '61-90'
        : '90+';

    invoiceBalances.push({
      invoiceId: String(inv._id),
      invoiceNumber: inv.invoiceNumber,
      invoiceDate: inv.invoiceDate,
      customerId: String(inv.customer),
      customerName: inv.customerSnapshot.name,
      grandTotal: inv.grandTotal,
      paidAmount: inv.paidAmount,
      outstanding,
      daysOld,
      ageingBucket: bucket,
    });

    const cid = String(inv.customer);
    if (!customerMap.has(cid)) {
      customerMap.set(cid, {
        customerId: cid,
        customerName: inv.customerSnapshot.name,
        state: inv.customerSnapshot.state,
        totalBilled: 0,
        totalPaid: 0,
        outstanding: 0,
        bucket0_30: 0,
        bucket31_60: 0,
        bucket61_90: 0,
        bucket90Plus: 0,
        invoiceCount: 0,
      });
    }
    const agg = customerMap.get(cid)!;
    agg.totalBilled = roundMoney(agg.totalBilled + inv.grandTotal);
    agg.totalPaid = roundMoney(agg.totalPaid + inv.paidAmount);
    agg.outstanding = roundMoney(agg.outstanding + outstanding);
    agg.invoiceCount += 1;

    if (outstanding > 0) {
      if (bucket === '0-30') agg.bucket0_30 = roundMoney(agg.bucket0_30 + outstanding);
      else if (bucket === '31-60') agg.bucket31_60 = roundMoney(agg.bucket31_60 + outstanding);
      else if (bucket === '61-90') agg.bucket61_90 = roundMoney(agg.bucket61_90 + outstanding);
      else agg.bucket90Plus = roundMoney(agg.bucket90Plus + outstanding);
    }
  }

  const customers = Array.from(customerMap.values()).sort(
    (a, b) => b.outstanding - a.outstanding
  );

  const summary = {
    totalReceivables: roundMoney(customers.reduce((s, c) => s + c.outstanding, 0)),
    bucket0_30: roundMoney(customers.reduce((s, c) => s + c.bucket0_30, 0)),
    bucket31_60: roundMoney(customers.reduce((s, c) => s + c.bucket31_60, 0)),
    bucket61_90: roundMoney(customers.reduce((s, c) => s + c.bucket61_90, 0)),
    bucket90Plus: roundMoney(customers.reduce((s, c) => s + c.bucket90Plus, 0)),
  };

  return { summary, customers, invoices: invoiceBalances };
}
