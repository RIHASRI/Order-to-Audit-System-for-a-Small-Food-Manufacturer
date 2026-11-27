# FactoryFlow — Smart Food Manufacturing, Inventory, Production & Audit ERP

*Developed by:** Rihasri J S

**GitHub Profile:** [RIHASRI](https://github.com/RIHASRI)

**Personal Portfolio:** [Visit My Portfolio](https://rihasri-portfolio.vercel.app/)



FactoryFlow is a production-ready **Order-to-Audit ERP** built for small food manufacturers (NIT Tiruchirappalli benchmark scenario), covering Raw & Packaging Procurement, Bill of Materials (BOM) Versioning & Scaling, Production Runs with Variance Alerts (>3%), Weighted-Average Costing, Immutable Stock Ledgers, Mobile-First Field Sales Orders (with IndexedDB offline sync), GST Invoicing (PDF), Dispatch & Partial Fulfillment, Payments & Ageing, and 17 Statutory/Operational Audit Reports (Excel, CSV, PDF).

---

## 1. Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, React Router v7, Axios, React Hook Form + Zod, Recharts, Lucide React, IndexedDB (`offlineDb.ts`)
- **Backend**: Node.js, Express, TypeScript, JWT Authentication, `bcryptjs`, Zod Validation, PDFKit, ExcelJS, Decimal.js, Day.js
- **Database**: MongoDB Atlas / Mongoose ODM with multi-document ACID transactions (`MongoMemoryReplSet` supported out-of-the-box for zero-config local execution)
- **Testing**: Vitest, Supertest, Playwright

---

## 2. Quick Start & Local Installation

### Prerequisites
- Node.js 20+
- npm 10+
- MongoDB Atlas URI (optional locally — `USE_IN_MEMORY_DB=true` runs a full MongoDB replica set with ACID transactions automatically)

### Setup
1. Copy environment variables:
   ```bash
   cp .env.example backend/.env
   ```
   *(Optional)* Create `frontend/.env` with `VITE_API_URL=http://localhost:5000/api` (or rely on the Vite `/api` proxy in local dev).

2. Install dependencies:
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

3. Run Backend & Frontend in separate terminals:
   ```bash
   # Terminal 1 — Backend (auto-seeds benchmark data if DB is empty)
   cd backend && npm run dev

   # Terminal 2 — Frontend
   cd frontend && npm run dev
   ```
   Open `http://localhost:5173`.

4. Optional standalone database seed:
   ```bash
   cd backend && npm run seed
   ```

---

## 3. Demo Accounts (All 5 Roles)

All demo accounts use password **`Password@123`**:

| Role | Email | Capabilities |
|---|---|---|
| `OWNER` | `owner@factoryflow.in` | Full executive dashboard, revenue, stock, production, costing, variance alerts, all reports & user creation |
| `ADMIN` | `admin@factoryflow.in` | Master data CRUD, purchases, order review/approval, GST invoices, dispatches, payments |
| `SALESMAN` | `sales@factoryflow.in` | Mobile-first order entry, offline IndexedDB capture & sync, own order tracking, finished goods availability |
| `PRODUCTION_SUPERVISOR` | `production@factoryflow.in` | BOM creation/scaling, production run posting, wastage/variance tracking, raw/packaging stock view |
| `ACCOUNTANT` | `accountant@factoryflow.in` | Strictly read-only access to sales, purchases, GST, stock ledger, production, costing, receivables & all 17 reports |

---

## 4. Database Schema Overview

Core Mongoose collections in `backend/src/models/`:
- `User`: Role-based authentication accounts (`OWNER`, `ADMIN`, `SALESMAN`, `PRODUCTION_SUPERVISOR`, `ACCOUNTANT`).
- `Product`: Finished goods (`sku`, `hsnCode`, `sellingPrice`, `gstRate`, `currentStock`, `weightedAvgCost`).
- `Material`: Raw & packaging materials (`category: RAW_MATERIAL | PACKAGING`, `unit`, `currentStock`, `weightedAvgRate`).
- `Customer` / `Supplier`: Party master with `gstin`, `state`, `stateCode`, `creditLimit`, `paymentTerms`.
- `BOM`: Versioned product recipes (`batchSize`, `expectedOutput`, `rawMaterials[]`, `packagingMaterials[]`, `standardLabourCost`, `standardPowerCost`).
- `ProductionRun`: Immutable batch record with `bomSnapshot`, planned vs actual material lines, `yieldVariancePct`, `hasVarianceAlert`, `costPerPacket`.
- `PurchaseOrder`: Supplier procurement with receipt status and payment tracking.
- `SalesOrder`: Customer orders with `DRAFT` → `SUBMITTED` → `UNDER_REVIEW` → `APPROVED` / `REJECTED` → `PARTIALLY_DISPATCHED` → `DISPATCHED`, plus `offlineId` idempotency.
- `Invoice`: GST Tax Invoices & Credit Notes (`CGST/SGST` intra-state vs `IGST` inter-state) using integer-paisa math.
- `Dispatch`: Partial/full dispatch linked to order & invoice with `idempotencyKey`.
- `Payment`: Customer payments linked to invoices.
- `StockLedger`: Append-only ledger (`previousBalance`, `signedQuantity`, `newBalance`, `unitCost`, `sourceDocNumber`).
- `AuditLog` & `Notification`: Immutable change trail and role-targeted alerts (>3% variance, low stock, new orders).

---

## 5. Business Calculations & Assumptions

### Stock Reconciliation Formula
$$\text{Closing Stock} = \text{Opening Stock} + \text{Receipts} - \text{Issues} - \text{Sales} + \text{Returns} + \text{Adjustments}$$
All stock changes go exclusively through `postStockMovement()` inside MongoDB ACID transactions (`withTransaction`), preventing arbitrary overwrites.

### Weighted-Average Material Valuation
When stock enters (`PURCHASE_RECEIPT` or `OPENING_STOCK`):
$$\text{New Weighted Avg Rate} = \frac{(\text{Prev Balance} \times \text{Prev Rate}) + (\text{Receipt Qty} \times \text{Receipt Rate})}{\text{New Balance}}$$

### Production Variance & Costing
- **Consumption Variance (%)**: $\frac{\text{Actual Qty} - \text{Planned Qty}}{\text{Planned Qty}} \times 100$
- **Yield Variance (%)**: $\frac{\text{Actual Good Output} - \text{Expected Output}}{\text{Expected Output}} \times 100$
- Any variance exceeding **±3%** sets `isAlert = true` / `hasVarianceAlert = true` and emits a `CRITICAL` notification.
- **Total Production Cost**: $\text{Material Cost} + \text{Packaging Cost} + \text{Labour} + \text{Gas/Power} + \text{Other Overheads}$
- **Cost Per Packet**: $\frac{\text{Total Production Cost}}{\text{Actual Good Output}}$

### Unit Conversions & Packaging Assumptions
- `1 kg = 1000 g`, `1 litre = 1000 ml`, `1 carton = 20 packets` (default standard carton pack), `1 piece = 1 packet` (for pouches).
- **Packaging Reconciliation**: Pouches consumed = `actualGoodOutput + damagedPouches`. Cartons consumed = explicit `cartonsUsed` if provided, otherwise `floor(actualGoodOutput / 20)`.
- **GST Arithmetic**: All monetary lines are computed in integer paisa (`toPaisa` / `fromPaisa`). Intra-state (`sellerStateCode === buyerStateCode`, e.g. TN `33` → TN `33`) splits GST equally into `CGST 2.5% + SGST 2.5%`. Inter-state (e.g. TN `33` → KA `29`) applies `IGST 5%`.

---

## 6. Exact Benchmark Verification Results

The seeded NIT Tiruchirappalli scenario automatically produces and passes automated tests for:
- **Flour Closing Stock**: `120 kg` (`100` opening @ ₹42 + `60` purchase @ ₹45 = `160 kg` @ weighted avg `₹43.125/kg`, minus `40 kg` issued = `120 kg`)
- **Cooking Oil Closing Stock**: `19.5 litres` (`30 - 10.5`)
- **Pouches Closing Stock**: `306 pieces` (`500 - (188 good + 6 damaged)`)
- **Cartons Closing Stock**: `21 pieces` (`30 - 9`)
- **Finished Goods After Production**: `238 packets` (`50 opening + 188 produced`)
- **Finished Goods After Dispatch**: `88 packets` (`238 - 150 dispatched to Retailer A`)
- **Yield Variance**: `-6%` (`(188 - 200) / 200 × 100`, triggers alert)
- **Oil Consumption Variance**: `+5%` (`(10.5 - 10) / 10 × 100`, triggers alert)
- **Batch Production Cost**: Material `₹3,435` + Packaging `₹620` + Overheads `₹1,800` = `₹5,855` (`₹31.1436/pkt`)
- **Retailer A GST Invoice**: Taxable `₹7,500`, CGST `₹187.50`, SGST `₹187.50`, Grand Total `₹7,875`
- **Retailer A Outstanding**: `₹3,875` (`₹7,875 - ₹4,000` paid)
- **Distributor B Shortage**: `32 packets` (`120` ordered − `88` available; dispatch > `88` blocked with `INSUFFICIENT_STOCK`)

---

## 7. Automated Tests

```bash
# Backend unit + full benchmark E2E suite
cd backend && npm test

# Frontend unit tests
cd frontend && npm test

# Frontend Playwright E2E (requires backend & frontend running)
cd frontend && npm run test:e2e
```

---

## 8. Deployment

- **Backend (Render)**: [https://order-to-audit-system-for-a-small-food.onrender.com/](https://order-to-audit-system-for-a-small-food.onrender.com/)  
  Configured via `render.yaml` (`rootDir: backend`, `buildCommand: npm install && npm run build`, `startCommand: npm start`). Set `MONGO_URI` (MongoDB Atlas replica set connection string), `USE_IN_MEMORY_DB=false`, `JWT_SECRET`, and `CORS_ORIGIN`.

- **Frontend (Vercel)**: [https://order-to-audit-system-for-a-small-f.vercel.app/login](https://order-to-audit-system-for-a-small-f.vercel.app/login)  
  Configured via `frontend/vercel.json` with SPA fallback rewrites. Set `VITE_API_URL` to  Render API base URL

- **Demo Video**: [Watch Project Demonstration](https://drive.google.com/file/d/1vNGGfJ1A4KaQVvqmJKsVjwsJkUx1qIcs/view?usp=sharing)

- **Access FactoryFlow here**: https://order-to-audit-system-for-a-small-f.vercel.app/login

- **NOTE**: "Please try logging in with all five demo accounts and explore the different roles and features of the application."
