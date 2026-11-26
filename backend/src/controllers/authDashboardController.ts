import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { loginUser, createUser } from '../services/authService';
import { DEMO_USERS } from '../services/seedService';
import { User } from '../models/User';
import { getDashboardData } from '../services/dashboardService';
import { Notification } from '../models/Notification';
import { Product } from '../models/Product';
import { Customer } from '../models/Customer';
import { SalesOrder } from '../models/SalesOrder';
import { Invoice } from '../models/Invoice';
import { ProductionRun } from '../models/ProductionRun';
import { Material } from '../models/Material';

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { email, password } = req.body;
  const result = await loginUser(email, password, req.ip);
  res.json({ success: true, data: result });
});

export const getMe = asyncHandler(async (req: Request, res: Response) => {
  res.json({ success: true, data: req.user });
});

export const logout = asyncHandler(async (_req: Request, res: Response) => {
  res.json({ success: true, message: 'Logged out successfully' });
});

export const getDemoAccounts = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: DEMO_USERS.map((u) => ({
      name: u.name,
      email: u.email,
      password: u.password,
      role: u.role,
    })),
  });
});

export const listUsers = asyncHandler(async (_req: Request, res: Response) => {
  const users = await User.find()
    .select('name email role phone isActive lastLoginAt createdAt')
    .sort({ role: 1 })
    .lean();
  res.json({ success: true, data: users });
});

export const registerUser = asyncHandler(async (req: Request, res: Response) => {
  const user = await createUser(req.body);
  res.status(201).json({ success: true, data: user });
});

export const dashboard = asyncHandler(async (req: Request, res: Response) => {
  const { startDate, endDate } = req.query as {
    startDate?: string;
    endDate?: string;
  };
  const data = await getDashboardData(req.user!, { startDate, endDate });
  res.json({ success: true, data });
});

export const getNotifications = asyncHandler(async (req: Request, res: Response) => {
  const items = await Notification.find({ targetRoles: req.user!.role })
    .sort({ createdAt: -1 })
    .limit(25)
    .lean();
  res.json({ success: true, data: items });
});

export const markNotificationRead = asyncHandler(async (req: Request, res: Response) => {
  await Notification.findByIdAndUpdate(req.params.id, {
    $addToSet: { readBy: req.user!.id },
  });
  res.json({ success: true });
});

export const globalSearch = asyncHandler(async (req: Request, res: Response) => {
  const q = String(req.query.q || '').trim();
  if (!q) {
    res.json({ success: true, data: [] });
    return;
  }
  const regex = { $regex: q, $options: 'i' };
  const [products, customers, materials, orders, invoices, runs] = await Promise.all([
    Product.find({ $or: [{ name: regex }, { sku: regex }] }).limit(5).lean(),
    Customer.find({ $or: [{ name: regex }, { gstin: regex }] }).limit(5).lean(),
    Material.find({ $or: [{ name: regex }, { code: regex }] }).limit(5).lean(),
    SalesOrder.find({ $or: [{ orderNumber: regex }, { customerName: regex }] })
      .limit(5)
      .lean(),
    Invoice.find({
      $or: [{ invoiceNumber: regex }, { 'customerSnapshot.name': regex }],
    })
      .limit(5)
      .lean(),
    ProductionRun.find({
      $or: [{ productionNumber: regex }, { productName: regex }],
    })
      .limit(5)
      .lean(),
  ]);

  const results = [
    ...products.map((p) => ({
      type: 'Product',
      title: p.name,
      subtitle: `${p.sku} · Stock: ${p.currentStock} ${p.unit}`,
      link: '/master-data',
    })),
    ...customers.map((c) => ({
      type: 'Customer',
      title: c.name,
      subtitle: `${c.customerType} · ${c.state}`,
      link: '/master-data',
    })),
    ...materials.map((m) => ({
      type: 'Material',
      title: m.name,
      subtitle: `${m.code} · Stock: ${m.currentStock} ${m.unit}`,
      link: '/inventory',
    })),
    ...orders.map((o) => ({
      type: 'Sales Order',
      title: o.orderNumber,
      subtitle: `${o.customerName} · ${o.status}`,
      link: '/orders',
    })),
    ...invoices.map((i) => ({
      type: 'GST Invoice',
      title: i.invoiceNumber,
      subtitle: `${i.customerSnapshot.name} · ₹${i.grandTotal}`,
      link: '/invoices',
    })),
    ...runs.map((r) => ({
      type: 'Production Run',
      title: r.productionNumber,
      subtitle: `${r.productName} · Output: ${r.actualGoodOutput}`,
      link: '/production',
    })),
  ];

  res.json({ success: true, data: results });
});
