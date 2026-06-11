import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { adminLogin } from '../lib/adminApi.js';

export default function Login() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setPending(true);
    try {
      await adminLogin(password);
      navigate('/admin');
    } catch (err) {
      setError(err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink px-5">
      <form onSubmit={handleSubmit} className="w-full max-w-sm border border-paper/15 bg-paper p-8">
        <p className="display text-2xl">Maria<span className="text-accent">Clara</span></p>
        <p className="eyebrow mt-1">Admin workspace</p>
        <label className="mt-8 block text-sm font-semibold" htmlFor="admin-password">Password</label>
        <input
          id="admin-password"
          type="password"
          className="field mt-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          autoComplete="current-password"
        />
        {error && <p className="mt-3 text-sm text-accent-deep" role="alert">{error}</p>}
        <button type="submit" className="btn-ink mt-6 w-full" disabled={pending || !password}>
          {pending ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
