import PDFDocument from 'pdfkit';
import { Invoice } from '../models/Invoice';
import { SalesOrder } from '../models/SalesOrder';
import { Customer } from '../models/Customer';
import { Product } from '../models/Product';
import { env } from '../config/env';
import { calculateGstLine, getFinancialYear } from '../utils/gst';
import { getNextSequence } from '../utils/sequence';
import { roundMoney, toPaisa, fromPaisa } from '../utils/decimal';
import { AppError, NotFoundError } from '../utils/errors';
import { recordAuditLog } from './auditService';
import { AuthUser } from '../middleware/auth';

export interface CreateInvoiceInput {
  salesOrderId?: string;
  customerId?: string;
  invoiceDate?: string | Date;
  items?: Array<{ productId: string; quantity: number; unitPrice?: number }>;
}

export async function listInvoices(filters: {
  customerId?: string;
  status?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
}) {
  const query: Record<string, unknown> = {};
  if (filters.customerId) query.customer = filters.customerId;
  if (filters.status) query.status = filters.status;
  if (filters.search) {
    query.$or = [
      { invoiceNumber: { $regex: filters.search, $options: 'i' } },
      { 'customerSnapshot.name': { $regex: filters.search, $options: 'i' } },
      { salesOrderNumber: { $regex: filters.search, $options: 'i' } },
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
    query.invoiceDate = range;
  }

  const invoices = await Invoice.find(query)
    .sort({ invoiceDate: -1, createdAt: -1 })
    .lean();

  return invoices.map((inv) => ({
    ...inv,
    outstandingAmount: roundMoney(Math.max(0, inv.grandTotal - inv.paidAmount)),
  }));
}

export async function getInvoiceById(id: string) {
  const inv = await Invoice.findById(id).lean();
  if (!inv) throw new NotFoundError('Invoice not found');
  return {
    ...inv,
    outstandingAmount: roundMoney(Math.max(0, inv.grandTotal - inv.paidAmount)),
  };
}

export async function createGstInvoice(
  input: CreateInvoiceInput,
  actor: AuthUser
) {
  const invoiceDate = input.invoiceDate ? new Date(input.invoiceDate) : new Date();
  const fy = getFinancialYear(invoiceDate);

  let customerDoc;
  let salesOrderDoc = null;
  let lineInputs: Array<{ productId: string; quantity: number; unitPrice?: number }> = [];

  if (input.salesOrderId) {
    salesOrderDoc = await SalesOrder.findById(input.salesOrderId).lean();
    if (!salesOrderDoc) throw new NotFoundError('Sales order not found');
    if (['REJECTED', 'CANCELLED'].includes(salesOrderDoc.status)) {
      throw new AppError('Cannot create invoice for a rejected or cancelled order');
    }
    customerDoc = await Customer.findById(salesOrderDoc.customer).lean();
    lineInputs =
      input.items && input.items.length > 0
        ? input.items
        : salesOrderDoc.items.map((i) => ({
            productId: String(i.product),
            quantity: i.approvedQty || i.requestedQty,
            unitPrice: i.unitPrice,
          }));
  } else if (input.customerId && input.items && input.items.length > 0) {
    customerDoc = await Customer.findById(input.customerId).lean();
    lineInputs = input.items;
  } else {
    throw new AppError('Provide either salesOrderId or customerId with items');
  }

  if (!customerDoc) throw new NotFoundError('Customer not found');

  const isInterState =
    env.company.stateCode.trim() !== customerDoc.stateCode.trim();

  const invoiceItems = [];
  let taxablePaisa = 0;
  let cgstPaisa = 0;
  let sgstPaisa = 0;
  let igstPaisa = 0;
  let grandPaisa = 0;

  for (const line of lineInputs) {
    const product = await Product.findById(line.productId).lean();
    if (!product) throw new NotFoundError(`Product ${line.productId} not found`);

    const unitPrice = roundMoney(line.unitPrice ?? product.sellingPrice);
    const gst = calculateGstLine(
      { quantity: line.quantity, unitPrice, gstRate: product.gstRate },
      env.company.stateCode,
      customerDoc.stateCode
    );

    taxablePaisa += toPaisa(gst.taxableValue);
    cgstPaisa += toPaisa(gst.cgstAmount);
    sgstPaisa += toPaisa(gst.sgstAmount);
    igstPaisa += toPaisa(gst.igstAmount);
    grandPaisa += toPaisa(gst.lineTotal);

    invoiceItems.push({
      product: product._id,
      productName: product.name,
      sku: product.sku,
      hsnCode: product.hsnCode,
      unit: product.unit,
      quantity: line.quantity,
      unitPrice,
      taxableValue: gst.taxableValue,
      gstRate: product.gstRate,
      cgstRate: gst.cgstRate,
      sgstRate: gst.sgstRate,
      igstRate: gst.igstRate,
      cgstAmount: gst.cgstAmount,
      sgstAmount: gst.sgstAmount,
      igstAmount: gst.igstAmount,
      lineTotal: gst.lineTotal,
    });
  }

  const invoiceNumber = await getNextSequence(`invoice_${fy}`, `FF/${fy}/`, 4);

  const invoice = await Invoice.create({
    invoiceNumber,
    financialYear: fy,
    invoiceDate,
    sellerDetails: { ...env.company },
    customer: customerDoc._id,
    customerSnapshot: {
      name: customerDoc.name,
      gstin: customerDoc.gstin,
      address: customerDoc.address,
      state: customerDoc.state,
      stateCode: customerDoc.stateCode,
      phone: customerDoc.phone,
    },
    salesOrder: salesOrderDoc?._id,
    salesOrderNumber: salesOrderDoc?.orderNumber,
    placeOfSupply: `${customerDoc.state} (${customerDoc.stateCode})`,
    isInterState,
    items: invoiceItems,
    taxableValue: fromPaisa(taxablePaisa),
    cgstTotal: fromPaisa(cgstPaisa),
    sgstTotal: fromPaisa(sgstPaisa),
    igstTotal: fromPaisa(igstPaisa),
    grandTotal: fromPaisa(grandPaisa),
    paidAmount: 0,
    status: 'ACTIVE',
    createdBy: actor.id,
  });

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'CREATE_GST_INVOICE',
    entityType: 'INVOICE',
    entityId: String(invoice._id),
    entityRef: invoice.invoiceNumber,
    summary: `Generated GST Invoice ${invoice.invoiceNumber} for ${customerDoc.name} (Total ₹${invoice.grandTotal})`,
  });

  return {
    ...invoice.toObject(),
    outstandingAmount: invoice.grandTotal,
  };
}

export async function cancelInvoice(
  invoiceId: string,
  reason: string,
  actor: AuthUser
) {
  const invoice = await Invoice.findById(invoiceId);
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.status !== 'ACTIVE') {
    throw new AppError('Only active invoices can be cancelled');
  }
  if (invoice.paidAmount > 0) {
    throw new AppError(
      'Cannot cancel invoice with recorded payments. Issue a Credit Note instead.'
    );
  }
  invoice.status = 'CANCELLED';
  invoice.cancellationReason = reason;
  await invoice.save();

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'CANCEL_INVOICE',
    entityType: 'INVOICE',
    entityId: invoiceId,
    entityRef: invoice.invoiceNumber,
    summary: `Cancelled invoice ${invoice.invoiceNumber}: ${reason}`,
  });

  return invoice.toObject();
}

export async function createCreditNote(
  invoiceId: string,
  reason: string,
  actor: AuthUser
) {
  const original = await Invoice.findById(invoiceId).lean();
  if (!original) throw new NotFoundError('Original invoice not found');
  if (original.status === 'CREDIT_NOTE') {
    throw new AppError('Cannot create a credit note from another credit note');
  }

  const fy = getFinancialYear(new Date());
  const creditNumber = await getNextSequence(`credit_note_${fy}`, `CN/${fy}/`, 4);

  const creditNote = await Invoice.create({
    invoiceNumber: creditNumber,
    financialYear: fy,
    invoiceDate: new Date(),
    sellerDetails: original.sellerDetails,
    customer: original.customer,
    customerSnapshot: original.customerSnapshot,
    salesOrder: original.salesOrder,
    salesOrderNumber: original.salesOrderNumber,
    placeOfSupply: original.placeOfSupply,
    isInterState: original.isInterState,
    items: original.items,
    taxableValue: original.taxableValue,
    cgstTotal: original.cgstTotal,
    sgstTotal: original.sgstTotal,
    igstTotal: original.igstTotal,
    grandTotal: original.grandTotal,
    paidAmount: 0,
    status: 'CREDIT_NOTE',
    linkedInvoiceId: original._id,
    creditNoteReason: reason,
    createdBy: actor.id,
  });

  await recordAuditLog({
    userId: actor.id,
    userName: actor.name,
    userRole: actor.role,
    action: 'CREATE_CREDIT_NOTE',
    entityType: 'INVOICE',
    entityId: String(creditNote._id),
    entityRef: creditNote.invoiceNumber,
    summary: `Issued Credit Note ${creditNote.invoiceNumber} against ${original.invoiceNumber}: ${reason}`,
  });

  return creditNote.toObject();
}

export async function generateInvoicePdfBuffer(invoiceId: string): Promise<{
  buffer: Buffer;
  filename: string;
}> {
  const invoice = await Invoice.findById(invoiceId).lean();
  if (!invoice) throw new NotFoundError('Invoice not found');

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 40, size: 'A4' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () =>
      resolve({
        buffer: Buffer.concat(chunks),
        filename: `${invoice.invoiceNumber.replace(/\//g, '-')}.pdf`,
      })
    );
    doc.on('error', reject);

    // Header banner
    doc.rect(40, 35, 515, 62).fill('#1e293b');
    doc
      .fillColor('#ffffff')
      .fontSize(18)
      .font('Helvetica-Bold')
      .text(invoice.sellerDetails.name, 54, 46);
    doc
      .fontSize(9)
      .font('Helvetica')
      .text(
        `GSTIN: ${invoice.sellerDetails.gstin} | ${invoice.sellerDetails.address}`,
        54,
        69
      );
    doc
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(invoice.status === 'CREDIT_NOTE' ? 'CREDIT NOTE' : 'TAX INVOICE', 400, 52, {
        align: 'right',
        width: 140,
      });

    doc.fillColor('#0f172a');
    let y = 115;

    // Metadata & Customer box
    doc.fontSize(9).font('Helvetica-Bold').text('Invoice Details', 40, y);
    doc.text('Billed To (Recipient)', 310, y);
    y += 14;

    doc.font('Helvetica');
    doc.text(`Invoice No: ${invoice.invoiceNumber}`, 40, y);
    doc.text(`Customer: ${invoice.customerSnapshot.name}`, 310, y);
    y += 13;
    doc.text(
      `Date: ${new Date(invoice.invoiceDate).toLocaleDateString('en-IN')}`,
      40,
      y
    );
    doc.text(
      `GSTIN: ${invoice.customerSnapshot.gstin || 'Unregistered'}`,
      310,
      y
    );
    y += 13;
    doc.text(`Financial Year: ${invoice.financialYear}`, 40, y);
    doc.text(`Address: ${invoice.customerSnapshot.address}`, 310, y, { width: 240 });
    y += 13;
    doc.text(`Place of Supply: ${invoice.placeOfSupply}`, 40, y);
    y += 13;
    if (invoice.salesOrderNumber) {
      doc.text(`Order Ref: ${invoice.salesOrderNumber}`, 40, y);
    }
    doc.text(`Status: ${invoice.status}`, 310, y);

    y += 28;
    // Table Header
    doc.rect(40, y, 515, 22).fill('#f1f5f9');
    doc.fillColor('#0f172a').font('Helvetica-Bold').fontSize(8.5);
    doc.text('#', 46, y + 7);
    doc.text('Product / Description', 68, y + 7);
    doc.text('HSN', 235, y + 7);
    doc.text('Qty', 280, y + 7, { width: 45, align: 'right' });
    doc.text('Rate', 330, y + 7, { width: 55, align: 'right' });
    doc.text('Taxable', 390, y + 7, { width: 65, align: 'right' });
    doc.text('GST', 458, y + 7, { width: 35, align: 'right' });
    doc.text('Total', 495, y + 7, { width: 55, align: 'right' });
    y += 26;

    doc.font('Helvetica').fontSize(8.5);
    invoice.items.forEach((item, idx) => {
      const gstAmt = roundMoney(item.cgstAmount + item.sgstAmount + item.igstAmount);
      doc.text(String(idx + 1), 46, y);
      doc.text(`${item.productName} (${item.sku})`, 68, y, { width: 162 });
      doc.text(item.hsnCode, 235, y);
      doc.text(`${item.quantity} ${item.unit}`, 280, y, { width: 45, align: 'right' });
      doc.text(`Rs. ${item.unitPrice.toFixed(2)}`, 330, y, { width: 55, align: 'right' });
      doc.text(`Rs. ${item.taxableValue.toFixed(2)}`, 390, y, {
        width: 65,
        align: 'right',
      });
      doc.text(`${item.gstRate}%`, 458, y, { width: 35, align: 'right' });
      doc.text(`Rs. ${item.lineTotal.toFixed(2)}`, 495, y, { width: 55, align: 'right' });
      y += 18;
      doc
        .fontSize(7.5)
        .fillColor('#64748b')
        .text(
          invoice.isInterState
            ? `IGST @ ${item.igstRate}%: Rs. ${item.igstAmount.toFixed(2)}`
            : `CGST @ ${item.cgstRate}%: Rs. ${item.cgstAmount.toFixed(2)} | SGST @ ${item.sgstRate}%: Rs. ${item.sgstAmount.toFixed(2)}`,
          68,
          y - 4
        );
      doc.fillColor('#0f172a').fontSize(8.5);
      y += 14;
      doc.moveTo(40, y - 3).lineTo(555, y - 3).strokeColor('#e2e8f0').stroke();
    });

    y += 14;
    const summaryX = 350;
    doc.font('Helvetica').fontSize(9.5);
    doc.text('Taxable Value:', summaryX, y);
    doc.text(`Rs. ${invoice.taxableValue.toFixed(2)}`, 460, y, {
      width: 90,
      align: 'right',
    });
    y += 16;

    if (invoice.isInterState) {
      doc.text('IGST:', summaryX, y);
      doc.text(`Rs. ${invoice.igstTotal.toFixed(2)}`, 460, y, {
        width: 90,
        align: 'right',
      });
      y += 16;
    } else {
      doc.text('CGST:', summaryX, y);
      doc.text(`Rs. ${invoice.cgstTotal.toFixed(2)}`, 460, y, {
        width: 90,
        align: 'right',
      });
      y += 16;
      doc.text('SGST:', summaryX, y);
      doc.text(`Rs. ${invoice.sgstTotal.toFixed(2)}`, 460, y, {
        width: 90,
        align: 'right',
      });
      y += 16;
    }

    doc.rect(summaryX - 8, y - 2, 215, 24).fill('#eff6ff');
    doc.fillColor('#1d4ed8').font('Helvetica-Bold').fontSize(11);
    doc.text('Grand Total:', summaryX, y + 4);
    doc.text(`Rs. ${invoice.grandTotal.toFixed(2)}`, 460, y + 4, {
      width: 90,
      align: 'right',
    });

    y += 34;
    doc.fillColor('#0f172a').font('Helvetica').fontSize(9);
    const outstanding = roundMoney(Math.max(0, invoice.grandTotal - invoice.paidAmount));
    doc.text(`Amount Paid: Rs. ${invoice.paidAmount.toFixed(2)}`, summaryX, y);
    doc.text(`Balance Due: Rs. ${outstanding.toFixed(2)}`, summaryX, y + 14);

    doc
      .fontSize(8)
      .fillColor('#64748b')
      .text(
        'This is a computer-generated GST Tax Invoice from FactoryFlow ERP.',
        40,
        760,
        { align: 'center', width: 515 }
      );

    doc.end();
  });
}
