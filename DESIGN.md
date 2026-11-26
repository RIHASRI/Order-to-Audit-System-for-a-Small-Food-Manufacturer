# FactoryFlow ERP — System Architecture & Design Document

## 1. Architecture Overview

FactoryFlow follows a clean layered architecture separating HTTP transport, validation, domain services, and persistence:

```
frontend/ (React 18 + Vite + Tailwind + Recharts)
   │  REST (Axios + JWT Bearer Interceptor + IndexedDB Offline Queue)
   ▼
backend/src/
   ├── routes/         -> Role-protected Express routes (authenticate + authorize)
   ├── validators/     -> Zod request schemas
   ├── controllers/    -> Thin HTTP adapters delegating to services
   ├── services/       -> Domain engines (BOM, Production, Inventory, GST, Costing, Reports)
   ├── models/         -> Mongoose schemas & indexes
   └── utils/          -> Integer-paisa decimal math, unit converter, GST calculator, sequences
```

## 2. Key Engineering Decisions

### ACID Transactions & Stock Integrity
- Every inventory mutation routes through `postStockMovement()` in `backend/src/services/inventoryService.ts`.
- Production runs, purchase receipts, dispatches, and opening stock entries execute inside `withTransaction()` (`mongoose.startSession()` + `session.withTransaction()`).
- Local development uses `MongoMemoryReplSet` (`wiredTiger`) when `USE_IN_MEMORY_DB=true` so multi-document transactions behave identically to MongoDB Atlas production clusters.
- Direct overwrites of `currentStock` in master-data `PUT` endpoints are stripped (`delete data.currentStock`) so the `StockLedger` remains the single source of truth.

### Precision Monetary & Tax Arithmetic
- `backend/src/utils/decimal.ts` uses `Decimal.js` for quantity/rate rounding (`roundQty`, `roundRate`, `roundMoney`) and integer-paisa conversions (`toPaisa`, `fromPaisa`) for GST totals, preventing IEEE-754 floating-point drift.
- `backend/src/utils/gst.ts` determines intra-state vs inter-state taxation from `COMPANY_STATE_CODE` (`33` Tamil Nadu) vs `customer.stateCode`.

### Offline-Capable Field Sales & Idempotency
- `frontend/src/utils/offlineDb.ts` persists field orders in IndexedDB when offline or explicitly saved offline.
- `POST /api/orders/sync-offline` deduplicates using `SalesOrder.offlineId`.
- `POST /api/dispatches` deduplicates using `Dispatch.idempotencyKey` and checks remaining approved order quantities as well as available finished goods stock.

### Role-Based Access Control (RBAC)
- Backend middleware (`authenticate`, `authorize(...roles)`) enforces permissions at the route layer.
- Frontend `ProtectedRoute` and `AppLayout` filter navigation and hide mutation controls for read-only roles (such as `ACCOUNTANT`).

## 3. UI/UX Design Principles
- **Theme**: Clean light enterprise workspace (`#f8fafc` canvas, white cards with subtle `slate-200` borders) paired with a high-contrast deep navy (`slate-900`) collapsible sidebar.
- **Semantic Color Coding**: Blue (`#2563eb`) primary actions, Emerald (`#10b981`) healthy stock/success, Red (`#ef4444`) stock shortages & >3% variance alerts, Amber (`#f59e0b`) pending approvals & receivables.
- **Operational Ergonomics**: Global search bar across orders/invoices/batches/SKUs, role-filtered notification bell, print-ready GST tax invoice modal, and one-click Excel/CSV/PDF exports across all 17 reports.
