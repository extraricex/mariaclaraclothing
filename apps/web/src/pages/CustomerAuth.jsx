import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { customerJson, customerLogin, customerRegister } from '../lib/customerAuth.js';
import { fetchWithRecovery } from '../lib/network.js';

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
  const [notice] = useState(() => location.state?.message || '');
  const [pending, setPending] = useState(false);
  const [socialProviders, setSocialProviders] = useState({ google: false, facebook: false });
  const redirectTo = typeof location.state?.from === 'string' && location.state.from.startsWith('/')
    ? location.state.from
    : '/account';

  useEffect(() => {
    fetchWithRecovery('/api/customer/oauth/status', { credentials: 'same-origin', cache: 'no-store' })
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
          {socialProviders.google && (
            <a className="flex min-h-12 w-full items-center justify-center border border-line bg-white px-5 py-3 text-sm font-semibold text-ink transition-colors hover:bg-mist" href={socialUrl('google')}>
              Continue with Google
            </a>
          )}
          {socialProviders.facebook && (
            <a className="flex min-h-12 w-full items-center justify-center border border-[#1877f2] bg-[#1877f2] px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#166fe5]" href={socialUrl('facebook')}>
              Continue with Facebook
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
        <label className="block text-sm font-semibold">Email<input className="field mt-1" type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        <label className="block text-sm font-semibold">Password<input className="field mt-1" type="password" required placeholder="Your password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" /></label>
        <p className="text-right text-xs"><Link to="/forgot-password" className="text-accent underline">Forgot password?</Link></p>
        {notice && <p className="text-sm text-green-700" role="status">{notice}</p>}
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
  const [socialProviders, setSocialProviders] = useState({ google: false, facebook: false });

  useEffect(() => {
    fetchWithRecovery('/api/customer/oauth/status', { credentials: 'same-origin', cache: 'no-store' })
      .then((response) => response.json())
      .then((body) => setSocialProviders(body.providers || { google: false, facebook: false }))
      .catch(() => setSocialProviders({ google: false, facebook: false }));
  }, []);
  const socialUrl = (provider) => `/api/customer/oauth/${provider}/start?returnTo=${encodeURIComponent('/account')}`;

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
    <AuthShell title="Create account" subtitle="Save your address once for a faster checkout next time.">
      {(socialProviders.google || socialProviders.facebook) && (
        <div className="mt-8 space-y-3">
          {socialProviders.google && <a className="flex min-h-12 w-full items-center justify-center border border-line bg-white px-5 py-3 text-sm font-semibold text-ink" href={socialUrl('google')}>Continue with Google</a>}
          {socialProviders.facebook && <a className="flex min-h-12 w-full items-center justify-center border border-[#1877f2] bg-[#1877f2] px-5 py-3 text-sm font-semibold text-white" href={socialUrl('facebook')}>Continue with Facebook</a>}
          <div className="flex items-center gap-3 py-2" aria-hidden="true"><span className="h-px flex-1 bg-line" /><span className="text-xs uppercase text-clay">or use email</span><span className="h-px flex-1 bg-line" /></div>
        </div>
      )}
      <form onSubmit={handleSubmit} className={`${socialProviders.google || socialProviders.facebook ? '' : 'mt-8'} space-y-4`}>
        <label className="block text-sm font-semibold">Full Name<input className="field mt-1" required placeholder="Your full name" value={form.fullName} onChange={(e) => update('fullName', e.target.value)} autoComplete="name" /></label>
        <label className="block text-sm font-semibold">Email<input className="field mt-1" type="email" required placeholder="you@example.com" value={form.email} onChange={(e) => update('email', e.target.value)} autoComplete="email" /></label>
        <label className="block text-sm font-semibold">Mobile Number<input className="field mt-1" type="tel" required placeholder="09XXXXXXXXX" value={form.phone} onChange={(e) => update('phone', e.target.value)} autoComplete="tel" /></label>
        <label className="block text-sm font-semibold">Password<input className="field mt-1" type="password" required minLength="8" placeholder="8 or more characters" value={form.password} onChange={(e) => update('password', e.target.value)} autoComplete="new-password" /></label>
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

export function CustomerForgotPassword() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    try {
      const body = await customerJson('/api/customer/password-reset/request', {
        method: 'POST', body: JSON.stringify({ email })
      });
      setMessage(body.message);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPending(false);
    }
  }

  return <AuthShell title="Reset password" subtitle="Enter your account email and we’ll send a secure, one-time reset link.">
    <form className="mt-8 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-semibold">Email<input className="field mt-1" type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@example.com" /></label>
      {message && <p className="text-sm text-ink-soft" role="status">{message}</p>}
      <button type="submit" className="btn-ink w-full" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</button>
    </form>
    <p className="mt-6 text-sm"><Link to="/login" className="text-accent underline">Return to login</Link></p>
  </AuthShell>;
}

export function CustomerResetPassword() {
  const navigate = useNavigate();
  const location = useLocation();
  const token = new URLSearchParams(location.search).get('token') || '';
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState(token ? '' : 'This password reset link is invalid.');
  const [pending, setPending] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (password !== confirmation) {
      setMessage('Passwords do not match.');
      return;
    }
    setPending(true);
    setMessage('');
    try {
      const body = await customerJson('/api/customer/password-reset/complete', {
        method: 'POST', body: JSON.stringify({ token, password })
      });
      navigate('/login', { replace: true, state: { message: body.message } });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setPending(false);
    }
  }

  return <AuthShell title="Choose a new password" subtitle="Use 8 or more characters and keep your account password private.">
    <form className="mt-8 space-y-4" onSubmit={submit}>
      <label className="block text-sm font-semibold">New password<input className="field mt-1" type="password" required minLength="8" maxLength="200" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label className="block text-sm font-semibold">Confirm new password<input className="field mt-1" type="password" required minLength="8" maxLength="200" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
      {message && <p className="text-sm text-accent-deep" role="alert">{message}</p>}
      <button type="submit" className="btn-ink w-full" disabled={pending || !token}>{pending ? 'Saving…' : 'Reset password'}</button>
    </form>
  </AuthShell>;
}
