import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { customerLogin, customerRegister } from '../lib/customerAuth.js';

function AuthShell({ title, subtitle, children }) {
  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <p className="eyebrow">Account</p>
      <h1 className="display mt-1 text-4xl">{title}</h1>
      <p className="mt-2 text-sm text-ink-soft">{subtitle}</p>
      {children}
    </div>
  );
}

export function CustomerLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const redirectTo = location.state?.from || '/account';

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await customerLogin(email, password);
      navigate(redirectTo);
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Log in" subtitle="Order history, saved address, faster checkout.">
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input className="field" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        <input className="field" type="password" required placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        {error && <p className="text-sm text-accent-deep" role="alert">{error}</p>}
        <button type="submit" className="btn-ink w-full" disabled={pending}>{pending ? 'Logging in…' : 'Log in'}</button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        No account yet? <Link to="/register" className="text-accent underline">Create one</Link> — or just{' '}
        <Link to="/checkout" className="underline">checkout as guest</Link>, no account needed.
      </p>
    </AuthShell>
  );
}

export function CustomerRegister() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  function update(field, value) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await customerRegister(form);
      navigate('/account');
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthShell title="Create account" subtitle="Save your address once, breeze through every COD checkout after.">
      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <input className="field" required placeholder="Full name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} autoComplete="name" />
        <input className="field" type="email" required placeholder="Email" value={form.email} onChange={(e) => update('email', e.target.value)} autoComplete="email" />
        <input className="field" type="tel" required placeholder="Mobile number (09XXXXXXXXX)" value={form.phone} onChange={(e) => update('phone', e.target.value)} autoComplete="tel" />
        <input className="field" type="password" required minLength="8" placeholder="Password (8+ characters)" value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" />
        {error && <p className="text-sm text-accent-deep" role="alert">{error}</p>}
        <button type="submit" className="btn-ink w-full" disabled={pending}>{pending ? 'Creating…' : 'Create account'}</button>
      </form>
      <p className="mt-6 text-sm text-ink-soft">
        Already registered? <Link to="/login" className="text-accent underline">Log in</Link>. Past orders made
        with the same mobile number show up automatically.
      </p>
    </AuthShell>
  );
}
