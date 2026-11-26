import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Pencil, Trash2, Package, Users, Truck, FlaskConical } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Product, Customer, Supplier, Material } from '../types';
import {
  PageHeader,
  Button,
  Badge,
  Modal,
  Input,
  Select,
  ConfirmDialog,
  Card,
} from '../components/ui/Primitives';
import { DataTable, Column } from '../components/ui/DataTable';
import { formatINR } from '../utils/format';

type Tab = 'products' | 'customers' | 'suppliers' | 'materials';

export const MasterDataPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [tab, setTab] = useState<Tab>('products');
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const [form, setForm] = useState<Record<string, string | number>>({});

  const canEditMaster = user?.role === 'OWNER' || user?.role === 'ADMIN';
  const canEditMaterial = canEditMaster || user?.role === 'PRODUCTION_SUPERVISOR';
  const canDelete = user?.role === 'OWNER' || user?.role === 'ADMIN';

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const requests: Promise<unknown>[] = [
        api.get('/products').then((r) => setProducts(r.data.data || [])),
        api.get('/materials').then((r) => setMaterials(r.data.data || [])),
        api.get('/suppliers').then((r) => setSuppliers(r.data.data || [])),
      ];
      if (user?.role !== 'PRODUCTION_SUPERVISOR') {
        requests.push(api.get('/customers').then((r) => setCustomers(r.data.data || [])));
      }
      await Promise.all(requests);
    } catch (err) {
      toast('Error loading master data', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [user?.role, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openAdd = () => {
    setEditingId(null);
    if (tab === 'products') {
      setForm({
        name: '',
        sku: '',
        category: 'Traditional Savouries',
        packSize: '200 g',
        hsnCode: '21069099',
        sellingPrice: 50,
        gstRate: 5,
        unit: 'packets',
        reorderLevel: 50,
        openingStock: 0,
        weightedAvgCost: 0,
      });
    } else if (tab === 'customers') {
      setForm({
        name: '',
        customerType: 'RETAILER',
        gstin: '',
        address: '',
        state: 'Tamil Nadu',
        stateCode: '33',
        contactPerson: '',
        phone: '',
        email: '',
        creditLimit: 50000,
        paymentTerms: 'Net 15 Days',
      });
    } else if (tab === 'suppliers') {
      setForm({
        name: '',
        gstin: '',
        address: '',
        state: 'Tamil Nadu',
        stateCode: '33',
        contactPerson: '',
        phone: '',
        email: '',
        paymentTerms: 'Net 15 Days',
      });
    } else {
      setForm({
        name: '',
        code: '',
        category: 'RAW_MATERIAL',
        subCategory: 'FLOUR',
        unit: 'kg',
        reorderLevel: 15,
        openingStock: 0,
        weightedAvgRate: 0,
      });
    }
    setModalOpen(true);
  };

  const openEdit = (item: Record<string, unknown>) => {
    setEditingId(String(item._id));
    const copy: Record<string, string | number> = {};
    Object.entries(item).forEach(([k, v]) => {
      if (typeof v === 'string' || typeof v === 'number') copy[k] = v;
    });
    setForm(copy);
    setModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const endpoint = `/${tab}`;
      const payload = { ...form };
      if (tab === 'products') {
        payload.sellingPrice = Number(payload.sellingPrice);
        payload.gstRate = Number(payload.gstRate);
        payload.reorderLevel = Number(payload.reorderLevel);
        if (!editingId) {
          payload.openingStock = Number(payload.openingStock || 0);
          payload.weightedAvgCost = Number(payload.weightedAvgCost || 0);
        }
      } else if (tab === 'customers') {
        payload.creditLimit = Number(payload.creditLimit || 0);
      } else if (tab === 'materials') {
        payload.reorderLevel = Number(payload.reorderLevel || 0);
        payload.weightedAvgRate = Number(payload.weightedAvgRate || 0);
        if (!editingId) payload.openingStock = Number(payload.openingStock || 0);
      }

      if (editingId) {
        await api.put(`${endpoint}/${editingId}`, payload);
        toast('Record updated successfully', 'success');
      } else {
        await api.post(endpoint, payload);
        toast('Record created successfully', 'success');
      }
      setModalOpen(false);
      await loadAll();
    } catch (err) {
      toast('Save failed', 'error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.delete(`/${tab}/${deleteTarget.id}`);
      toast(`Deleted ${deleteTarget.name}`, 'success');
      setDeleteTarget(null);
      await loadAll();
    } catch (err) {
      toast('Delete blocked by business rules', 'error', getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  const productCols: Column<Product & Record<string, unknown>>[] = [
    { key: 'sku', header: 'SKU', sortable: true },
    { key: 'name', header: 'Product Name', sortable: true },
    { key: 'packSize', header: 'Pack Size' },
    { key: 'hsnCode', header: 'HSN' },
    {
      key: 'sellingPrice',
      header: 'Price',
      align: 'right',
      sortable: true,
      render: (r) => formatINR(r.sellingPrice),
    },
    { key: 'gstRate', header: 'GST %', align: 'right', render: (r) => `${r.gstRate}%` },
    {
      key: 'currentStock',
      header: 'Stock',
      align: 'right',
      render: (r) => (
        <Badge variant={r.currentStock <= r.reorderLevel ? 'red' : 'green'}>
          {r.currentStock} {r.unit}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        canEditMaster ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget({ id: r._id, name: r.name })}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read-only</span>
        ),
    },
  ];

  const customerCols: Column<Customer & Record<string, unknown>>[] = [
    { key: 'name', header: 'Customer', sortable: true },
    {
      key: 'customerType',
      header: 'Type',
      render: (r) => <Badge variant="blue">{r.customerType}</Badge>,
    },
    { key: 'gstin', header: 'GSTIN', render: (r) => r.gstin || 'Unregistered' },
    { key: 'state', header: 'State', render: (r) => `${r.state} (${r.stateCode})` },
    { key: 'phone', header: 'Phone' },
    {
      key: 'creditLimit',
      header: 'Credit Limit',
      align: 'right',
      render: (r) => formatINR(r.creditLimit),
    },
    { key: 'paymentTerms', header: 'Terms' },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        canEditMaster ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget({ id: r._id, name: r.name })}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read-only</span>
        ),
    },
  ];

  const supplierCols: Column<Supplier & Record<string, unknown>>[] = [
    { key: 'name', header: 'Supplier', sortable: true },
    { key: 'gstin', header: 'GSTIN', render: (r) => r.gstin || '-' },
    { key: 'contactPerson', header: 'Contact' },
    { key: 'phone', header: 'Phone' },
    { key: 'paymentTerms', header: 'Payment Terms' },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        canEditMaster ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget({ id: r._id, name: r.name })}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read-only</span>
        ),
    },
  ];

  const materialCols: Column<Material & Record<string, unknown>>[] = [
    { key: 'code', header: 'Code', sortable: true },
    { key: 'name', header: 'Material Name', sortable: true },
    {
      key: 'category',
      header: 'Category',
      render: (r) => (
        <Badge variant={r.category === 'RAW_MATERIAL' ? 'indigo' as never : 'amber'}>
          {r.category === 'RAW_MATERIAL' ? 'Raw Material' : 'Packaging'}
        </Badge>
      ),
    },
    { key: 'subCategory', header: 'Sub-Type' },
    {
      key: 'currentStock',
      header: 'Stock',
      align: 'right',
      render: (r) => (
        <Badge variant={r.currentStock <= r.reorderLevel ? 'red' : 'green'}>
          {r.currentStock} {r.unit}
        </Badge>
      ),
    },
    {
      key: 'weightedAvgRate',
      header: 'Wtd Avg Rate',
      align: 'right',
      render: (r) => `${formatINR(r.weightedAvgRate)} / ${r.unit}`,
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (r) =>
        canEditMaterial ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" variant="ghost" onClick={() => openEdit(r)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            {canDelete && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDeleteTarget({ id: r._id, name: r.name })}
              >
                <Trash2 className="h-3.5 w-3.5 text-red-600" />
              </Button>
            )}
          </div>
        ) : (
          <span className="text-xs text-slate-400">Read-only</span>
        ),
    },
  ];

  const showAddBtn =
    (tab === 'materials' && canEditMaterial) || (tab !== 'materials' && canEditMaster);

  const tabs: Array<{ id: Tab; label: string; icon: React.ReactNode; hide?: boolean }> = [
    { id: 'products', label: `Products (${products.length})`, icon: <Package className="h-4 w-4" /> },
    {
      id: 'customers',
      label: `Customers (${customers.length})`,
      icon: <Users className="h-4 w-4" />,
      hide: user?.role === 'PRODUCTION_SUPERVISOR',
    },
    { id: 'suppliers', label: `Suppliers (${suppliers.length})`, icon: <Truck className="h-4 w-4" /> },
    {
      id: 'materials',
      label: `Raw & Packaging (${materials.length})`,
      icon: <FlaskConical className="h-4 w-4" />,
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Master Data Management"
        description="Manage finished products, customers, suppliers, raw materials, and packaging SKUs."
        actions={
          showAddBtn && (
            <Button onClick={openAdd}>
              <Plus className="h-4 w-4" />
              Add {tab === 'products' ? 'Product' : tab === 'customers' ? 'Customer' : tab === 'suppliers' ? 'Supplier' : 'Material'}
            </Button>
          )
        }
      />

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {tabs
          .filter((t) => !t.hide)
          .map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors ${
                tab === t.id
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
      </div>

      <Card>
        {tab === 'products' && (
          <DataTable
            data={products as Array<Product & Record<string, unknown>>}
            columns={productCols}
            loading={loading}
            searchPlaceholder="Search by SKU, name, HSN..."
          />
        )}
        {tab === 'customers' && (
          <DataTable
            data={customers as Array<Customer & Record<string, unknown>>}
            columns={customerCols}
            loading={loading}
            searchPlaceholder="Search by customer, GSTIN, state..."
          />
        )}
        {tab === 'suppliers' && (
          <DataTable
            data={suppliers as Array<Supplier & Record<string, unknown>>}
            columns={supplierCols}
            loading={loading}
            searchPlaceholder="Search supplier name, GSTIN..."
          />
        )}
        {tab === 'materials' && (
          <DataTable
            data={materials as Array<Material & Record<string, unknown>>}
            columns={materialCols}
            loading={loading}
            searchPlaceholder="Search raw & packaging materials..."
          />
        )}
      </Card>

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={`${editingId ? 'Edit' : 'Create'} ${tab.slice(0, -1)}`}
        size="md"
      >
        <form onSubmit={handleSave} className="space-y-4">
          {tab === 'products' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Product Name"
                required
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                label="SKU"
                required
                value={form.sku ?? ''}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
              />
              <Input
                label="Category"
                required
                value={form.category ?? ''}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              />
              <Input
                label="Pack Size"
                required
                value={form.packSize ?? ''}
                onChange={(e) => setForm({ ...form, packSize: e.target.value })}
              />
              <Input
                label="HSN Code"
                required
                value={form.hsnCode ?? ''}
                onChange={(e) => setForm({ ...form, hsnCode: e.target.value })}
              />
              <Input
                label="Unit"
                required
                value={form.unit ?? 'packets'}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              <Input
                label="Selling Price (₹)"
                type="number"
                step="0.01"
                required
                value={form.sellingPrice ?? 0}
                onChange={(e) => setForm({ ...form, sellingPrice: e.target.value })}
              />
              <Input
                label="GST Rate (%)"
                type="number"
                step="0.1"
                required
                value={form.gstRate ?? 5}
                onChange={(e) => setForm({ ...form, gstRate: e.target.value })}
              />
              <Input
                label="Reorder Level"
                type="number"
                required
                value={form.reorderLevel ?? 50}
                onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
              />
              {!editingId && (
                <Input
                  label="Opening Stock"
                  type="number"
                  value={form.openingStock ?? 0}
                  onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                />
              )}
            </div>
          )}

          {tab === 'customers' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Customer Name"
                required
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Select
                label="Type"
                value={form.customerType ?? 'RETAILER'}
                onChange={(e) => setForm({ ...form, customerType: e.target.value })}
              >
                <option value="RETAILER">Retailer</option>
                <option value="DISTRIBUTOR">Distributor</option>
              </Select>
              <Input
                label="GSTIN"
                value={form.gstin ?? ''}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              />
              <Input
                label="Contact Person"
                required
                value={form.contactPerson ?? ''}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
              <Input
                label="State"
                required
                value={form.state ?? ''}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
              <Input
                label="State Code (e.g. 33 for TN, 29 for KA)"
                required
                value={form.stateCode ?? ''}
                onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
              />
              <Input
                label="Phone"
                required
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Input
                label="Email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
              <Input
                label="Credit Limit (₹)"
                type="number"
                value={form.creditLimit ?? 50000}
                onChange={(e) => setForm({ ...form, creditLimit: e.target.value })}
              />
              <Input
                label="Payment Terms"
                required
                value={form.paymentTerms ?? 'Net 15 Days'}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Address"
                  required
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>
          )}

          {tab === 'suppliers' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Supplier Name"
                required
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                label="GSTIN"
                value={form.gstin ?? ''}
                onChange={(e) => setForm({ ...form, gstin: e.target.value })}
              />
              <Input
                label="Contact Person"
                required
                value={form.contactPerson ?? ''}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
              />
              <Input
                label="Phone"
                required
                value={form.phone ?? ''}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
              <Input
                label="State"
                required
                value={form.state ?? 'Tamil Nadu'}
                onChange={(e) => setForm({ ...form, state: e.target.value })}
              />
              <Input
                label="Payment Terms"
                required
                value={form.paymentTerms ?? 'Net 15 Days'}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
              />
              <div className="sm:col-span-2">
                <Input
                  label="Address"
                  required
                  value={form.address ?? ''}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                />
              </div>
            </div>
          )}

          {tab === 'materials' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input
                label="Material Name"
                required
                value={form.name ?? ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
              <Input
                label="Code"
                required
                value={form.code ?? ''}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
              />
              <Select
                label="Category"
                value={form.category ?? 'RAW_MATERIAL'}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
              >
                <option value="RAW_MATERIAL">Raw Material</option>
                <option value="PACKAGING">Packaging Material</option>
              </Select>
              <Input
                label="Sub-Category (e.g. FLOUR, COOKING_OIL, POUCH, CARTON, LABEL)"
                required
                value={form.subCategory ?? ''}
                onChange={(e) => setForm({ ...form, subCategory: e.target.value })}
              />
              <Input
                label="Storage Unit (kg, litre, pieces)"
                required
                value={form.unit ?? 'kg'}
                onChange={(e) => setForm({ ...form, unit: e.target.value })}
              />
              <Input
                label="Reorder Level"
                type="number"
                required
                value={form.reorderLevel ?? 10}
                onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
              />
              <Input
                label="Weighted Avg Rate (₹)"
                type="number"
                step="0.01"
                required
                value={form.weightedAvgRate ?? 0}
                onChange={(e) => setForm({ ...form, weightedAvgRate: e.target.value })}
              />
              {!editingId && (
                <Input
                  label="Opening Stock"
                  type="number"
                  step="0.01"
                  value={form.openingStock ?? 0}
                  onChange={(e) => setForm({ ...form, openingStock: e.target.value })}
                />
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              {editingId ? 'Save Changes' : 'Create'}
            </Button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Delete Master Record"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? Records linked to existing BOMs, orders, purchases, or stock ledgers are protected.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        loading={deleting}
      />
    </div>
  );
};
