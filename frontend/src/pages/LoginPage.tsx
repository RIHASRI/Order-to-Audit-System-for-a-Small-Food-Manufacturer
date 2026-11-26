import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Factory, ShieldCheck, ArrowRight, Lock, Mail, Server } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, API_BASE, getErrorMessage } from '../services/api';
import { Button, Input, Badge } from '../components/ui/Primitives';
import { ROLE_LABELS } from '../utils/format';
import { UserRole } from '../types';

const loginSchema = z.object({
  email: z.string().email('Enter a valid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

interface DemoAccount {
  name: string;
  email: string;
  password: string;
  role: UserRole;
}

const DEFAULT_DEMO_ACCOUNTS: DemoAccount[] = [
  { name: 'Arvind Subramanian', email: 'owner@factoryflow.in', password: 'Password@123', role: 'OWNER' },
  { name: 'Priya Krishnan', email: 'admin@factoryflow.in', password: 'Password@123', role: 'ADMIN' },
  { name: 'Karthik Rajan', email: 'sales@factoryflow.in', password: 'Password@123', role: 'SALESMAN' },
  { name: 'Murugan Selvam', email: 'production@factoryflow.in', password: 'Password@123', role: 'PRODUCTION_SUPERVISOR' },
  { name: 'Lakshmi Narayanan', email: 'accountant@factoryflow.in', password: 'Password@123', role: 'ACCOUNTANT' },
];

export const LoginPage: React.FC = () => {
  const { login, user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>(DEFAULT_DEMO_ACCOUNTS);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: 'owner@factoryflow.in', password: 'Password@123' },
  });

  useEffect(() => {
    if (user) navigate('/', { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    api
      .get('/auth/demo-accounts')
      .then((res) => {
        if (Array.isArray(res.data?.data) && res.data.data.length > 0) {
          setDemoAccounts(res.data.data);
        }
      })
      .catch(() => {
        // Retain default demo accounts if backend is temporarily unreachable
      });
  }, []);

  const onSubmit = async (data: LoginForm) => {
    setSubmitting(true);
    try {
      await login(data.email, data.password);
      toast('Signed in to FactoryFlow ERP', 'success');
      navigate('/', { replace: true });
    } catch (err) {
      toast('Authentication failed', 'error', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleQuickLogin = async (acc: DemoAccount) => {
    setValue('email', acc.email);
    setValue('password', acc.password);
    setSubmitting(true);
    try {
      await login(acc.email, acc.password);
      toast(`Signed in as ${acc.name}`, 'success', ROLE_LABELS[acc.role]);
      navigate('/', { replace: true });
    } catch (err) {
      toast('Demo sign-in failed', 'error', getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Enterprise Hero */}
      <div className="lg:w-1/2 bg-slate-900 text-white p-8 lg:p-14 flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-xl bg-blue-600 flex items-center justify-center shadow-lg">
              <Factory className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">FactoryFlow ERP</h1>
              <p className="text-xs text-blue-300 font-medium">
                Smart Food Manufacturing & Order-to-Audit System
              </p>
            </div>
          </div>

          <div className="mt-12 max-w-lg">
            <Badge variant="blue" className="bg-blue-500/20 text-blue-200 border-blue-400/30 mb-4">
              NIT Tiruchirappalli Production & Audit Benchmark
            </Badge>
            <h2 className="text-3xl lg:text-4xl font-bold leading-tight tracking-tight">
              End-to-End Traceability from Raw Material to GST Audit.
            </h2>
            <p className="mt-4 text-slate-300 text-sm leading-relaxed">
              Manage BOM recipes, production variance alerts (&gt;3% tolerance), weighted-average
              costing, ACID inventory ledgers, field sales orders, GST billing, and GSTR-1 audit
              reports in one unified platform.
            </p>
          </div>
        </div>

        <div className="mt-10 grid grid-cols-2 sm:grid-cols-3 gap-4 border-t border-slate-800 pt-6 text-xs">
          <div>
            <p className="text-slate-400">Stock Valuation</p>
            <p className="font-semibold text-white mt-0.5">Weighted-Average Ledger</p>
          </div>
          <div>
            <p className="text-slate-400">Tax Compliance</p>
            <p className="font-semibold text-white mt-0.5">CGST / SGST / IGST PDF</p>
          </div>
          <div>
            <p className="text-slate-400">Audit Exports</p>
            <p className="font-semibold text-white mt-0.5">17 Reports (XLSX/CSV/PDF)</p>
          </div>
        </div>
      </div>

      {/* Right Sign-in + Role Switcher */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-md space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <h3 className="text-xl font-bold text-slate-900">Sign in to workspace</h3>
            <p className="text-xs text-slate-500 mt-1">
              Enter your credentials or select one of the five role demo accounts below.
            </p>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-4">
              <div className="relative">
                <Input
                  label="Work Email"
                  type="email"
                  placeholder="owner@factoryflow.in"
                  error={errors.email?.message}
                  {...register('email')}
                />
                <Mail className="h-4 w-4 text-slate-400 absolute right-3 top-8 pointer-events-none" />
              </div>

              <div className="relative">
                <Input
                  label="Password"
                  type="password"
                  placeholder="••••••••"
                  error={errors.password?.message}
                  {...register('password')}
                />
                <Lock className="h-4 w-4 text-slate-400 absolute right-3 top-8 pointer-events-none" />
              </div>

              <Button type="submit" loading={submitting} className="w-full" size="lg">
                Sign In <ArrowRight className="h-4 w-4" />
              </Button>
            </form>
          </div>

          {demoAccounts.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <ShieldCheck className="h-4 w-4 text-emerald-600" />
                  Quick Demo Sign-In (5 Roles)
                </span>
                <span className="text-[11px] text-slate-400">Password@123</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {demoAccounts.map((acc) => (
                  <button
                    key={acc.email}
                    type="button"
                    disabled={submitting}
                    onClick={() => handleQuickLogin(acc)}
                    className="text-left rounded-xl border border-slate-200 px-3 py-2 hover:border-blue-400 hover:bg-blue-50/50 transition-colors disabled:opacity-50"
                  >
                    <p className="text-xs font-semibold text-slate-900 truncate">{acc.name}</p>
                    <p className="text-[11px] text-blue-600 font-medium truncate">
                      {ROLE_LABELS[acc.role]}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
            <Server className="h-3 w-3" />
            <span>Target API: <code className="text-slate-500 font-mono">{API_BASE}</code></span>
          </div>
        </div>
      </div>
    </div>
  );
};
