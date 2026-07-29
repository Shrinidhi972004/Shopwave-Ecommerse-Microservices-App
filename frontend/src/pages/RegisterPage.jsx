import { useState, useMemo } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { Spinner } from '../components/ui';
import { classNames } from '../utils/format';

/**
 * Mirrors the backend policy in auth-service/src/routes/authRoutes.js:
 * 8+ characters, at least one letter and one digit.
 * Client-side checks are for feedback only — the server enforces the real rule.
 */
function scorePassword(password) {
  const checks = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Contains a letter', met: /[A-Za-z]/.test(password) },
    { label: 'Contains a number', met: /\d/.test(password) },
  ];
  return { checks, met: checks.filter((c) => c.met).length, valid: checks.every((c) => c.met) };
}

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const toast = useToast();

  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const redirectTo = location.state?.from?.pathname || '/';
  const strength = useMemo(() => scorePassword(form.password), [form.password]);
  const passwordsMatch =
    form.confirmPassword.length === 0 || form.password === form.confirmPassword;

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

    if (form.password !== form.confirmPassword) {
      setFieldErrors({ confirmPassword: 'Passwords do not match' });
      return;
    }

    setSubmitting(true);
    setFormError(null);
    setFieldErrors({});

    try {
      const user = await register({
        fullName: form.fullName,
        email: form.email,
        password: form.password,
      });
      toast.success(`Welcome to ShopWave, ${user.fullName.split(' ')[0]}`);
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setFieldErrors(err.fieldErrors || {});
      setFormError(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-16rem)] max-w-md flex-col justify-center px-4 py-12">
      <div className="text-center">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink-900">Create your account</h1>
        <p className="mt-2 text-sm text-ink-500">Track orders and check out faster</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="card mt-8 space-y-5 p-6 sm:p-8">
        {formError && (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800">{formError}</p>
          </div>
        )}

        <div>
          <label htmlFor="fullName" className="label">
            Full name
          </label>
          <input
            id="fullName"
            name="fullName"
            type="text"
            autoComplete="name"
            value={form.fullName}
            onChange={update('fullName')}
            placeholder="Ada Lovelace"
            aria-invalid={Boolean(fieldErrors.fullName)}
            className={`input ${fieldErrors.fullName ? 'input-error' : ''}`}
          />
          {fieldErrors.fullName && <p className="field-error">{fieldErrors.fullName}</p>}
        </div>

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
            autoComplete="new-password"
            value={form.password}
            onChange={update('password')}
            placeholder="••••••••"
            aria-invalid={Boolean(fieldErrors.password)}
            className={`input ${fieldErrors.password ? 'input-error' : ''}`}
          />

          {form.password.length > 0 && (
            <div className="mt-3">
              <div className="flex gap-1" aria-hidden="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className={classNames(
                      'h-1 flex-1 rounded-full transition-colors',
                      strength.met > i
                        ? strength.valid
                          ? 'bg-emerald-500'
                          : 'bg-amber-400'
                        : 'bg-ink-200'
                    )}
                  />
                ))}
              </div>
              <ul className="mt-2 space-y-1">
                {strength.checks.map((check) => (
                  <li
                    key={check.label}
                    className={classNames(
                      'flex items-center gap-1.5 text-xs',
                      check.met ? 'text-emerald-700' : 'text-ink-400'
                    )}
                  >
                    <span aria-hidden="true">{check.met ? '✓' : '○'}</span>
                    {check.label}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fieldErrors.password && <p className="field-error">{fieldErrors.password}</p>}
        </div>

        <div>
          <label htmlFor="confirmPassword" className="label">
            Confirm password
          </label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={form.confirmPassword}
            onChange={update('confirmPassword')}
            placeholder="••••••••"
            aria-invalid={!passwordsMatch || Boolean(fieldErrors.confirmPassword)}
            className={`input ${!passwordsMatch || fieldErrors.confirmPassword ? 'input-error' : ''}`}
          />
          {!passwordsMatch && <p className="field-error">Passwords do not match</p>}
          {fieldErrors.confirmPassword && <p className="field-error">{fieldErrors.confirmPassword}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting || !strength.valid || !passwordsMatch}
          className="btn-primary w-full py-3"
        >
          {submitting && <Spinner className="h-4 w-4" />}
          {submitting ? 'Creating account…' : 'Create account'}
        </button>

        <p className="text-center text-sm text-ink-500">
          Already have an account?{' '}
          <Link
            to="/login"
            state={location.state}
            className="font-semibold text-brand-600 hover:text-brand-700"
          >
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
