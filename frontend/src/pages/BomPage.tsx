import React, { useEffect, useState, useCallback } from 'react';
import { Plus, Layers, Scale, Trash2 } from 'lucide-react';
import { api, getErrorMessage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { BOM, Product, Material } from '../types';
import {
  PageHeader,
  Card,
  Badge,
  Button,
  Modal,
  Input,
  Select,
  LoadingSpinner,
  EmptyState,
} from '../components/ui/Primitives';
import { formatINR, formatDate } from '../utils/format';

interface ScaledPreview {
  expectedOutput: number;
  standardLabourCost: number;
  standardPowerCost: number;
  plannedMaterials: Array<{
    materialId: string;
    materialName: string;
    materialCode: string;
    category: 'RAW_MATERIAL' | 'PACKAGING';
    plannedQty: number;
    unit: string;
  }>;
}

export const BomPage: React.FC = () => {
  const { user } = useAuth();
  const { toast } = useToast();

  const [boms, setBoms] = useState<BOM[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);

  const [scaleBom, setScaleBom] = useState<BOM | null>(null);
  const [batchSize, setBatchSize] = useState(1);
  const [scaled, setScaled] = useState<ScaledPreview | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const [productId, setProductId] = useState('');
  const [newBatchSize, setNewBatchSize] = useState(1);
  const [expectedOutput, setExpectedOutput] = useState(200);
  const [standardLabourCost, setStandardLabourCost] = useState(1200);
  const [standardPowerCost, setStandardPowerCost] = useState(600);
  const [notes, setNotes] = useState('');
  const [rawLines, setRawLines] = useState<Array<{ materialId: string; quantity: number; unit: string }>>([]);
  const [pkgLines, setPkgLines] = useState<Array<{ materialId: string; quantity: number; unit: string }>>([]);

  const canCreateBom = user?.role === 'OWNER' || user?.role === 'PRODUCTION_SUPERVISOR';

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [bRes, pRes, mRes] = await Promise.all([
        api.get('/boms'),
        api.get('/products'),
        api.get('/materials'),
      ]);
      setBoms(bRes.data.data || []);
      setProducts(pRes.data.data || []);
      setMaterials(mRes.data.data || []);
    } catch (err) {
      toast('Failed to load BOMs', 'error', getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const previewScale = async (bom: BOM, batches: number) => {
    setScaleBom(bom);
    setBatchSize(batches);
    try {
      const res = await api.get(`/boms/${bom._id}/scale`, {
        params: { batchSize: batches },
      });
      setScaled(res.data.data.scaled);
    } catch (err) {
      toast('Scaling failed', 'error', getErrorMessage(err));
    }
  };

  const openCreateModal = () => {
    const rawMats = materials.filter((m) => m.category === 'RAW_MATERIAL');
    const pkgMats = materials.filter((m) => m.category === 'PACKAGING');
    setProductId(products[0]?._id || '');
    setNewBatchSize(1);
    setExpectedOutput(200);
    setStandardLabourCost(1200);
    setStandardPowerCost(600);
    setNotes('');
    setRawLines(
      rawMats.length > 0
        ? [{ materialId: rawMats[0]._id, quantity: 10, unit: rawMats[0].unit }]
        : []
    );
    setPkgLines(
      pkgMats.length > 0
        ? [{ materialId: pkgMats[0]._id, quantity: 200, unit: pkgMats[0].unit }]
        : []
    );
    setCreateOpen(true);
  };

  const handleCreateBom = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/boms', {
        productId,
        batchSize: Number(newBatchSize),
        expectedOutput: Number(expectedOutput),
        rawMaterials: rawLines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
        packagingMaterials: pkgLines.map((l) => ({ ...l, quantity: Number(l.quantity) })),
        standardLabourCost: Number(standardLabourCost),
        standardPowerCost: Number(standardPowerCost),
        notes,
      });
      toast('New BOM version created and activated', 'success');
      setCreateOpen(false);
      await loadData();
    } catch (err) {
      toast('Failed to create BOM', 'error', getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const rawMaterials = materials.filter((m) => m.category === 'RAW_MATERIAL');
  const packagingMaterials = materials.filter((m) => m.category === 'PACKAGING');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Bill of Materials (BOM)"
        description="Manage versioned food recipes, packaging standards, unit conversions (kg/g, litre/ml, cartons/packets), and batch scaling."
        actions={
          canCreateBom && (
            <Button onClick={openCreateModal}>
              <Plus className="h-4 w-4" /> New BOM Version
            </Button>
          )
        }
      />

      {loading ? (
        <LoadingSpinner />
      ) : boms.length === 0 ? (
        <EmptyState title="No BOM recipes found" description="Create your first product BOM recipe to start production runs." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {boms.map((bom) => (
            <Card
              key={bom._id}
              title={`${bom.productName} · ${bom.bomCode}`}
              subtitle={`Created ${formatDate(bom.createdAt)} · Standard Batch ${bom.batchSize} -> ${bom.expectedOutput} ${bom.outputUnit}`}
              action={
                <div className="flex items-center gap-2">
                  <Badge variant={bom.isActive ? 'green' : 'slate'}>
                    v{bom.version} {bom.isActive ? 'Active' : 'Archived'}
                  </Badge>
                  <Button size="sm" variant="secondary" onClick={() => previewScale(bom, 1)}>
                    <Scale className="h-3.5 w-3.5" /> Scale Batch
                  </Button>
                </div>
              }
            >
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Raw Materials (Per Batch)
                  </p>
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {bom.rawMaterials.map((r, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="font-medium text-slate-800">
                          {r.materialName}{' '}
                          <span className="text-xs text-slate-400">({r.materialCode})</span>
                        </span>
                        <span className="font-semibold text-slate-900">
                          {r.quantity} {r.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2">
                    Packaging Materials (Per Batch)
                  </p>
                  <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {bom.packagingMaterials.map((p, i) => (
                      <div key={i} className="flex items-center justify-between px-3 py-2 text-sm">
                        <span className="font-medium text-slate-800">
                          {p.materialName}{' '}
                          <span className="text-xs text-slate-400">({p.materialCode})</span>
                        </span>
                        <span className="font-semibold text-slate-900">
                          {p.quantity} {p.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs text-slate-600">
                  <span>Std Labour: {formatINR(bom.standardLabourCost)}</span>
                  <span>Std Gas/Power: {formatINR(bom.standardPowerCost)}</span>
                  <span>Expected Output: {bom.expectedOutput} {bom.outputUnit}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Batch Scaler & Unit Conversion Modal */}
      <Modal
        open={Boolean(scaleBom)}
        onClose={() => setScaleBom(null)}
        title={`BOM Batch Scaler — ${scaleBom?.bomCode}`}
        subtitle="Automatically converts g/kg, ml/litre, cartons/packets into inventory storage units."
        size="md"
      >
        {scaleBom && (
          <div className="space-y-4">
            <div className="flex items-end gap-3">
              <Input
                label="Target Batch Size (e.g. 0.5, 1, 2.5)"
                type="number"
                step="0.25"
                min="0.1"
                value={batchSize}
                onChange={(e) => previewScale(scaleBom, Number(e.target.value || 1))}
              />
              <div className="pb-1 shrink-0">
                <Badge variant="blue">
                  Expected Output: {scaled?.expectedOutput ?? 0} {scaleBom.outputUnit}
                </Badge>
              </div>
            </div>

            {scaled && (
              <div className="rounded-xl border border-slate-200 divide-y divide-slate-100">
                {scaled.plannedMaterials.map((m) => (
                  <div key={m.materialId} className="flex items-center justify-between px-4 py-2.5 text-sm">
                    <div>
                      <p className="font-medium text-slate-900">{m.materialName}</p>
                      <p className="text-xs text-slate-400">{m.category}</p>
                    </div>
                    <span className="font-bold text-blue-700">
                      {m.plannedQty} {m.unit}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create New BOM Version Modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New BOM Version"
        subtitle="Automatically increments version and activates the new recipe for production."
        size="lg"
      >
        <form onSubmit={handleCreateBom} className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Select
              label="Finished Product"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
            >
              {products.map((p) => (
                <option key={p._id} value={p._id}>
                  {p.name} ({p.sku})
                </option>
              ))}
            </Select>
            <Input
              label="Standard Batch Size"
              type="number"
              step="0.1"
              min="0.1"
              required
              value={newBatchSize}
              onChange={(e) => setNewBatchSize(Number(e.target.value))}
            />
            <Input
              label="Expected Good Output (packets)"
              type="number"
              min="1"
              required
              value={expectedOutput}
              onChange={(e) => setExpectedOutput(Number(e.target.value))}
            />
          </div>

          {/* Raw Materials */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                <Layers className="h-3.5 w-3.5" /> Raw Materials
              </label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  rawMaterials[0] &&
                  setRawLines([
                    ...rawLines,
                    { materialId: rawMaterials[0]._id, quantity: 1, unit: rawMaterials[0].unit },
                  ])
                }
              >
                + Add Raw Material
              </Button>
            </div>
            {rawLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6">
                  <Select
                    value={line.materialId}
                    onChange={(e) => {
                      const mat = rawMaterials.find((m) => m._id === e.target.value);
                      const next = [...rawLines];
                      next[idx] = {
                        ...next[idx],
                        materialId: e.target.value,
                        unit: mat?.unit || next[idx].unit,
                      };
                      setRawLines(next);
                    }}
                  >
                    {rawMaterials.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.unit})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...rawLines];
                      next[idx].quantity = Number(e.target.value);
                      setRawLines(next);
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <Select
                    value={line.unit}
                    onChange={(e) => {
                      const next = [...rawLines];
                      next[idx].unit = e.target.value;
                      setRawLines(next);
                    }}
                  >
                    <option value="kg">kg</option>
                    <option value="g">g</option>
                    <option value="litre">litre</option>
                    <option value="ml">ml</option>
                  </Select>
                </div>
                <div className="col-span-1 text-right">
                  {rawLines.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setRawLines(rawLines.filter((_, i) => i !== idx))}
                      className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Packaging Materials */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-600">
                Packaging Materials
              </label>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  packagingMaterials[0] &&
                  setPkgLines([
                    ...pkgLines,
                    { materialId: packagingMaterials[0]._id, quantity: 10, unit: packagingMaterials[0].unit },
                  ])
                }
              >
                + Add Packaging
              </Button>
            </div>
            {pkgLines.map((line, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                <div className="col-span-6">
                  <Select
                    value={line.materialId}
                    onChange={(e) => {
                      const mat = packagingMaterials.find((m) => m._id === e.target.value);
                      const next = [...pkgLines];
                      next[idx] = {
                        ...next[idx],
                        materialId: e.target.value,
                        unit: mat?.unit || next[idx].unit,
                      };
                      setPkgLines(next);
                    }}
                  >
                    {packagingMaterials.map((m) => (
                      <option key={m._id} value={m._id}>
                        {m.name} ({m.unit})
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="col-span-3">
                  <Input
                    type="number"
                    step="1"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => {
                      const next = [...pkgLines];
                      next[idx].quantity = Number(e.target.value);
                      setPkgLines(next);
                    }}
                  />
                </div>
                <div className="col-span-2">
                  <Select
                    value={line.unit}
                    onChange={(e) => {
                      const next = [...pkgLines];
                      next[idx].unit = e.target.value;
                      setPkgLines(next);
                    }}
                  >
                    <option value="pieces">pieces</option>
                    <option value="cartons">cartons</option>
                    <option value="packets">packets</option>
                  </Select>
                </div>
                <div className="col-span-1 text-right">
                  <button
                    type="button"
                    onClick={() => setPkgLines(pkgLines.filter((_, i) => i !== idx))}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input
              label="Standard Labour Cost (₹)"
              type="number"
              value={standardLabourCost}
              onChange={(e) => setStandardLabourCost(Number(e.target.value))}
            />
            <Input
              label="Standard Gas / Electricity Cost (₹)"
              type="number"
              value={standardPowerCost}
              onChange={(e) => setStandardPowerCost(Number(e.target.value))}
            />
          </div>

          <Input
            label="Recipe Notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional version notes"
          />

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
            <Button variant="secondary" type="button" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save & Activate BOM
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
