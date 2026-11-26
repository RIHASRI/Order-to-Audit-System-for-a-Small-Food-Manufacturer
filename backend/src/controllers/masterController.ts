import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import * as masterService from '../services/masterService';

export const getProducts = asyncHandler(async (req: Request, res: Response) => {
  const { search, category } = req.query as { search?: string; category?: string };
  const data = await masterService.listProducts(search, category);
  res.json({ success: true, data });
});

export const postProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = await masterService.createProduct(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const putProduct = asyncHandler(async (req: Request, res: Response) => {
  const data = await masterService.updateProduct(String(req.params.id), req.body, req.user!);
  res.json({ success: true, data });
});

export const removeProduct = asyncHandler(async (req: Request, res: Response) => {
  await masterService.deleteProduct(String(req.params.id), req.user!);
  res.json({ success: true, message: 'Product deleted' });
});

export const getCustomers = asyncHandler(async (req: Request, res: Response) => {
  const { search, customerType } = req.query as {
    search?: string;
    customerType?: string;
  };
  const data = await masterService.listCustomers(search, customerType);
  res.json({ success: true, data });
});

export const postCustomer = asyncHandler(async (req: Request, res: Response) => {
  const data = await masterService.createCustomer(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const putCustomer = asyncHandler(async (req: Request, res: Response) => {
  const data = await masterService.updateCustomer(String(req.params.id), req.body, req.user!);
  res.json({ success: true, data });
});

export const removeCustomer = asyncHandler(async (req: Request, res: Response) => {
  await masterService.deleteCustomer(String(req.params.id), req.user!);
  res.json({ success: true, message: 'Customer deleted' });
});

export const getSuppliers = asyncHandler(async (req: Request, res: Response) => {
  const { search } = req.query as { search?: string };
  const data = await masterService.listSuppliers(search);
  res.json({ success: true, data });
});

export const postSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = await masterService.createSupplier(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const putSupplier = asyncHandler(async (req: Request, res: Response) => {
  const data = await masterService.updateSupplier(String(req.params.id), req.body, req.user!);
  res.json({ success: true, data });
});

export const removeSupplier = asyncHandler(async (req: Request, res: Response) => {
  await masterService.deleteSupplier(String(req.params.id), req.user!);
  res.json({ success: true, message: 'Supplier deleted' });
});

export const getMaterials = asyncHandler(async (req: Request, res: Response) => {
  const { category, search } = req.query as { category?: string; search?: string };
  const data = await masterService.listMaterials(category, search);
  res.json({ success: true, data });
});

export const postMaterial = asyncHandler(async (req: Request, res: Response) => {
  const data = await masterService.createMaterial(req.body, req.user!);
  res.status(201).json({ success: true, data });
});

export const putMaterial = asyncHandler(async (req: Request, res: Response) => {
  const data = await masterService.updateMaterial(String(req.params.id), req.body, req.user!);
  res.json({ success: true, data });
});

export const removeMaterial = asyncHandler(async (req: Request, res: Response) => {
  await masterService.deleteMaterial(String(req.params.id), req.user!);
  res.json({ success: true, message: 'Material deleted' });
});
