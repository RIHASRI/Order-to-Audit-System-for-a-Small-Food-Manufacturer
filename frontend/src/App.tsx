import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { UserRole } from './types';
import { AppLayout } from './layouts/AppLayout';
import { LoadingSpinner } from './components/ui/Primitives';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { MasterDataPage } from './pages/MasterDataPage';
import { BomPage } from './pages/BomPage';
import { ProductionPage } from './pages/ProductionPage';
import { InventoryPage } from './pages/InventoryPage';
import { PurchasesPage } from './pages/PurchasesPage';
import { OrdersPage } from './pages/OrdersPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { DispatchesPage } from './pages/DispatchesPage';
import { PaymentsPage } from './pages/PaymentsPage';
import { CostingPage } from './pages/CostingPage';
import { ReportsPage } from './pages/ReportsPage';

const ProtectedRoute: React.FC<{
  children: React.ReactNode;
  roles?: UserRole[];
}> = ({ children, roles }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner label="Verifying session..." />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/master-data"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}>
              <MasterDataPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/bom"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}>
              <BomPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/production"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}>
              <ProductionPage />
            </ProtectedRoute>
          }
        />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route
          path="/purchases"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}>
              <PurchasesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/orders"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT']}>
              <OrdersPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/invoices"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT']}>
              <InvoicesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/dispatches"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT']}>
              <DispatchesPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/payments"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'ACCOUNTANT']}>
              <PaymentsPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/costing"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}>
              <CostingPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute roles={['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT']}>
              <ReportsPage />
            </ProtectedRoute>
          }
        />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
