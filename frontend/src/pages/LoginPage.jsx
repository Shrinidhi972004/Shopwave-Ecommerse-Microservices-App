import { useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Where the user was headed before ProtectedRoute intercepted them.
  const redirectTo = location.state?.from?.pathname || '/';

  const update = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
    setFormError(null);
  };

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const user = await login(form);
      toast.success(`Welcome back, ${user.fullName.split(' ')[0]}`);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFieldErrors(err.fieldErrors || {});
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  /** Fills the demo credentials so a reviewer can get in without reading the README. */
  function useDemoAccount(role) {
    setForm(
      role === 'admin'
        ? { email: 'admin@shopwave.io', password: 'Admin@123' }
        : { email: 'demo@shopwave.io', password: 'Demo@1234' }
    );
    setFormError(null);
    setFieldErrors({});
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Welcome back</h1>
        <p className="mt-2 text-sm text-ink-500">Sign in to your ShopWave account</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="card mt-8 space-y-5 p-6 sm:p-8">
        {formError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800">{formError}</p>
          </div>
        )}

        <div>
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={update('email')}
            placeholder="you@example.com"
            aria-invalid={Boolean(fieldErrors.email)}
            className={`input ${fieldErrors.email ? 'input-error' : ''}`}
          />
          {fieldErrors.email && <p className="field-error">{fieldErrors.email}</p>}
        </div>

        <div>
          <label htmlFor="password" className="label">
            Password
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={form.password}
            onChange={update('password')}
            placeholder="••••••••"
            aria-invalid={Boolean(fieldErrors.password)}
            className={`input ${fieldErrors.password ? 'input-error' : ''}`}
          />
          {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
        </div>

        <button type="submit" disabled={submitting} className="btn-primary w-full py-3">
          {submitting && <Spinner className="h-4 w-4" />}
          {submitting ? 'Signing in…' : 'Sign in'}
        </button>

        <p className="text-center text-sm text-ink-500">
          Don't have an account?{' '}
          <Link
            to="/register"
            state={location.state}
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            Create one
          </Link>
        </p>
      </form>

      {/* Demo credentials — remove before this ever faces real users. */}
      <div className="mt-6 rounded-xl border border-dashed border-ink-300 bg-white/60 p-4">
        <p className="text-xs font-bold uppercase tracking-wider text-ink-500">Demo accounts</p>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => useDemoAccount('customer')} className="btn-secondary flex-1 py-2 text-xs">
            Customer
          </button>
          <button type="button" onClick={() => useDemoAccount('admin')} className="btn-secondary flex-1 py-2 text-xs">
            Admin
          </button>
        </div>
        <p className="mt-2.5 text-[11px] leading-relaxed text-ink-400">
          Seeded by <code className="font-mono">db/seed.sql</code>. Customer:
          demo@shopwave.io / Demo@1234 · Admin: admin@shopwave.io / Admin@123
        </p>
      </div>
    </div>
  );
}
