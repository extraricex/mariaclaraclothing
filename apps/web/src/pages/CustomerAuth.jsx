import { useEffect, useState } from 'react';
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
  const [error, setError] = useState(() => new URLSearchParams(location.search).get('oauthError') || '');
  const [pending, setPending] = useState(false);
  const [socialProviders, setSocialProviders] = useState({ google: false, facebook: false });
  const redirectTo = typeof location.state?.from === 'string' && location.state.from.startsWith('/')
    ? location.state.from
    : '/account';

  useEffect(() => {
    fetch('/api/customer/oauth/status', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('Social login status unavailable')))
      .then((body) => setSocialProviders(body.providers || {}))
      .catch(() => setSocialProviders({ google: false, facebook: false }));
  }, []);

  const socialUrl = (provider) => `/api/customer/oauth/${provider}/start?returnTo=${encodeURIComponent(redirectTo)}`;

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
      {(socialProviders.google || socialProviders.facebook) && (
        <div className="mt-8 space-y-3">
          {socialProviders.facebook && (
            <a className="flex min-h-12 w-full items-center justify-center border border-[#1877f2] bg-[#1877f2] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#166fe5]" href={socialUrl('facebook')}>
              Continue with Facebook
            </a>
          )}
          {socialProviders.google && (
            <a className="flex min-h-12 w-full items-center justify-center border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-mist" href={socialUrl('google')}>
              Continue with Google
            </a>
          )}
          <div className="flex items-center gap-3 py-2" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            <span className="text-xs uppercase text-clay">or use email</span>
            <span className="h-px flex-1 bg-line" />
          </div>
        </div>
      )}
      <form onSubmit={handleSubmit} className={`${socialProviders.google || socialProviders.facebook ? '' : 'mt-8'} space-y-4`}>
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
