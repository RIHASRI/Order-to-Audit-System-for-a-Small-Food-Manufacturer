import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, useNavigate, Outlet } from 'react-router-dom';
import {
  LayoutDashboard,
  Database,
  Layers,
  Factory,
  Boxes,
  ShoppingCart,
  ClipboardList,
  FileText,
  Truck,
  CreditCard,
  Calculator,
  BarChart3,
  Bell,
  Search,
  LogOut,
  Menu,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronRight as BreadcrumbArrow,
  ShieldCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';
import { ROLE_LABELS, formatDateTime } from '../utils/format';
import { api } from '../services/api';
import { Badge } from '../components/ui/Primitives';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  roles: UserRole[];
}

const NAV_ITEMS: NavItem[] = [
  {
    to: '/',
    label: 'Dashboard',
    icon: <LayoutDashboard className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'SALESMAN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
  },
  {
    to: '/master-data',
    label: 'Master Data',
    icon: <Database className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
  },
  {
    to: '/bom',
    label: 'Bill of Materials',
    icon: <Layers className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
  },
  {
    to: '/production',
    label: 'Production Runs',
    icon: <Factory className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
  },
  {
    to: '/inventory',
    label: 'Inventory & Ledger',
    icon: <Boxes className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT', 'SALESMAN'],
  },
  {
    to: '/purchases',
    label: 'Purchases',
    icon: <ShoppingCart className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
  },
  {
    to: '/orders',
    label: 'Sales Orders',
    icon: <ClipboardList className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT'],
  },
  {
    to: '/invoices',
    label: 'GST Invoicing',
    icon: <FileText className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT'],
  },
  {
    to: '/dispatches',
    label: 'Dispatches',
    icon: <Truck className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'SALESMAN', 'ACCOUNTANT'],
  },
  {
    to: '/payments',
    label: 'Payments & Ageing',
    icon: <CreditCard className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'ACCOUNTANT'],
  },
  {
    to: '/costing',
    label: 'Costing Analysis',
    icon: <Calculator className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
  },
  {
    to: '/reports',
    label: 'Reports & Audit',
    icon: <BarChart3 className="h-4 w-4" />,
    roles: ['OWNER', 'ADMIN', 'PRODUCTION_SUPERVISOR', 'ACCOUNTANT'],
  },
];

interface SearchResult {
  type: string;
  title: string;
  subtitle: string;
  link: string;
}

interface NotificationItem {
  _id: string;
  title: string;
  message: string;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  link?: string;
  readBy: string[];
  createdAt: string;
}

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [profileOpen, setProfileOpen] = useState(false);

  const visibleNav = NAV_ITEMS.filter((item) =>
    user ? item.roles.includes(user.role) : false
  );

  useEffect(() => {
    setMobileOpen(false);
    setSearchOpen(false);
    setNotifOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    api
      .get('/notifications')
      .then((res) => setNotifications(res.data.data || []))
      .catch(() => {});
  }, [location.pathname]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .get(`/search?q=${encodeURIComponent(q)}`)
        .then((res) => {
          setSearchResults(res.data.data || []);
          setSearchOpen(true);
        })
        .catch(() => {});
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const unreadCount = notifications.filter(
    (n) => user && !n.readBy?.includes(user.id)
  ).length;

  const markRead = async (n: NotificationItem) => {
    await api.patch(`/notifications/${n._id}/read`).catch(() => {});
    setNotifications((prev) =>
      prev.map((item) =>
        item._id === n._id && user
          ? { ...item, readBy: [...(item.readBy || []), user.id] }
          : item
      )
    );
    if (n.link) navigate(n.link);
    setNotifOpen(false);
  };

  const currentNav = visibleNav.find((n) => n.to === location.pathname);

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`no-print fixed lg:sticky top-0 left-0 z-40 h-screen flex flex-col bg-slate-900 text-slate-200 transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-64'
        } ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}`}
      >
        {/* Brand */}
        <div className="flex items-center justify-between h-16 px-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <div className="h-9 w-9 rounded-xl bg-blue-600 flex items-center justify-center shrink-0 shadow-inner">
              <Factory className="h-5 w-5 text-white" />
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <span className="font-bold text-white text-base tracking-tight block">
                  FactoryFlow
                </span>
                <span className="text-[10px] uppercase tracking-wider text-blue-300 font-semibold">
                  Food Mfg ERP
                </span>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed((c) => !c)}
            className="hidden lg:inline-flex rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white"
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
          </button>
          <button
            onClick={() => setMobileOpen(false)}
            className="lg:hidden rounded-lg p-1 text-slate-400 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 overflow-y-auto px-2.5 py-4 space-y-1">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`
              }
              title={collapsed ? item.label : undefined}
            >
              <span className="shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </NavLink>
          ))}
        </nav>

        {/* Sidebar Footer Role Pill */}
        {!collapsed && user && (
          <div className="p-3 border-t border-slate-800 bg-slate-950/40">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-slate-200 truncate">{user.name}</p>
                <p className="text-[11px] text-blue-300 truncate">
                  {ROLE_LABELS[user.role]}
                </p>
              </div>
            </div>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 h-16 bg-white border-b border-slate-200 px-4 lg:px-6 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobileOpen(true)}
              className="lg:hidden rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* Breadcrumbs */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-500">
              <span className="font-medium text-slate-700">FactoryFlow</span>
              <BreadcrumbArrow className="h-3.5 w-3.5 text-slate-400" />
              <span className="font-semibold text-blue-600">
                {currentNav?.label || 'Workspace'}
              </span>
            </div>
          </div>

          {/* Global Search */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onFocus={() => searchResults.length > 0 && setSearchOpen(true)}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Global search: orders, invoices, batches, SKU..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-3 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500"
            />
            {searchOpen && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 rounded-xl border border-slate-200 bg-white shadow-xl z-50 max-h-80 overflow-y-auto divide-y divide-slate-100">
                {searchResults.map((r, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      navigate(r.link);
                      setSearchOpen(false);
                      setSearchQuery('');
                    }}
                    className="w-full text-left px-4 py-2.5 hover:bg-slate-50 flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">{r.title}</p>
                      <p className="text-xs text-slate-500">{r.subtitle}</p>
                    </div>
                    <Badge variant="blue">{r.type}</Badge>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Notifications + Profile */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setNotifOpen((o) => !o)}
                className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
                title="Notifications"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-red-600 text-[10px] font-bold text-white flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notifOpen && (
                <div className="absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-xl z-50">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
                    <span className="text-sm font-semibold text-slate-900">
                      Alerts & Notifications
                    </span>
                    <Badge variant={unreadCount > 0 ? 'red' : 'slate'}>
                      {unreadCount} unread
                    </Badge>
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <p className="p-4 text-xs text-slate-500 text-center">
                        No alerts right now.
                      </p>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n._id}
                          onClick={() => markRead(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 ${
                            user && !n.readBy?.includes(user.id) ? 'bg-blue-50/40' : ''
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-900">
                              {n.title}
                            </span>
                            <Badge
                              variant={
                                n.severity === 'CRITICAL'
                                  ? 'red'
                                  : n.severity === 'WARNING'
                                  ? 'amber'
                                  : 'blue'
                              }
                            >
                              {n.severity}
                            </Badge>
                          </div>
                          <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                          <p className="text-[10px] text-slate-400 mt-1">
                            {formatDateTime(n.createdAt)}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="relative">
              <button
                onClick={() => setProfileOpen((o) => !o)}
                className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 hover:bg-slate-50"
              >
                <div className="h-7 w-7 rounded-full bg-indigo-900 text-white text-xs font-bold flex items-center justify-center">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div className="hidden md:block text-left leading-tight">
                  <p className="text-xs font-semibold text-slate-800">{user?.name}</p>
                  <p className="text-[10px] text-slate-500">
                    {user ? ROLE_LABELS[user.role] : ''}
                  </p>
                </div>
              </button>

              {profileOpen && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white shadow-xl z-50 p-2">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-xs font-semibold text-slate-900">{user?.name}</p>
                    <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      navigate('/login');
                    }}
                    className="mt-1 w-full flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Body */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1600px] w-full mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
