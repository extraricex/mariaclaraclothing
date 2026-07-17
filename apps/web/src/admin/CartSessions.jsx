import { useCallback, useEffect, useState } from 'react';
import { adminJson, adminSend } from '../lib/adminApi.js';
import { formatMoney } from '../lib/money.js';

const PAGE_COPY = {
  draft: {
    eyebrow: 'Orders / Draft',
    title: 'Draft carts',
    description: 'Customers with items still in their cart. Anonymous means they have not entered checkout contact details yet.'
  },
  abandoned_checkout: {
    eyebrow: 'Orders / Abandoned Checkout',
    title: 'Abandoned checkouts',
    description: 'Customers who started checkout but have not placed an order.'
  }
};

export default function CartSessions({ status }) {
  const [sessions, setSessions] = useState([]);
  const [message, setMessage] = useState('');
  const [sendingSessionId, setSendingSessionId] = useState('');
  const copy = PAGE_COPY[status] || PAGE_COPY.draft;

  const load = useCallback(() => {
    adminJson(`/api/admin/cart-sessions?status=${status}`)
      .then((body) => setSessions(body.sessions || []))
      .catch((error) => setMessage(error.message));
  }, [status]);

  useEffect(() => { load(); }, [load]);

  async function deleteSession(session) {
    const label = status === 'abandoned_checkout' ? 'abandoned checkout' : 'draft cart';
    if (!window.confirm(`Delete this ${label}? This cannot be undone.`)) return;
    try {
      await adminSend('DELETE', `/api/admin/cart-sessions/${encodeURIComponent(session.sessionId)}`);
      setSessions((previous) => previous.filter((item) => item.sessionId !== session.sessionId));
      setMessage(`${label[0].toUpperCase()}${label.slice(1)} deleted.`);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function sendRecoveryEmail(session) {
    setSendingSessionId(session.sessionId);
    setMessage('');
    try {
      const body = await adminSend('POST', `/api/admin/cart-sessions/${encodeURIComponent(session.sessionId)}/recovery-email`, {});
      setSessions((current) => current.map((item) => item.sessionId === session.sessionId
        ? {
            ...item,
            recoveryStatus: 'sent',
            recoveryEmailSentAt: body.notification?.sentAt || new Date().toISOString(),
            recoveryError: ''
          }
        : item));
      setMessage('The one-time cart reminder was sent.');
    } catch (error) {
      setMessage(error.message);
      load();
    } finally {
      setSendingSessionId('');
    }
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="display mt-1 text-3xl">{copy.title}</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-soft">{copy.description}</p>
        </div>
        <button type="button" className="btn-ghost" onClick={load}>Refresh</button>
      </div>

      {message && <p className="mt-4 text-sm text-accent-deep" role="status">{message}</p>}

      <div className="mt-6 overflow-x-auto border border-line bg-paper">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-[11px] uppercase tracking-[0.12em] text-clay">
              <th className="p-3">Customer</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Items</th>
              <th className="p-3">Subtotal</th>
              <th className="p-3">Cart contents</th>
              <th className="p-3">Last activity</th>
              {status === 'abandoned_checkout' && <th className="p-3">Reminder</th>}
              <th className="p-3">Action</th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => (
              <tr key={session.sessionId} className="border-b border-line/60 align-top hover:bg-cream/60">
                <td className="p-3 font-semibold">{session.customerName || 'Anonymous'}</td>
                <td className="p-3 text-xs text-clay">
                  <span className="block">{session.phone || 'No phone yet'}</span>
                  <span className="block">{session.email || 'No email'}</span>
                  <span className="block">{session.addressLine || 'No address yet'}</span>
                </td>
                <td className="p-3">{session.itemCount}</td>
                <td className="p-3">{formatMoney(session.subtotalCents)}</td>
                <td className="p-3">
                  <ul className="space-y-1 text-xs text-ink-soft">
                    {(session.items || []).map((item) => (
                      <li key={`${session.sessionId}-${item.variantId}`}>
                        {item.quantity}x {item.productName} {item.size ? `(${item.size})` : ''}
                      </li>
                    ))}
                  </ul>
                </td>
                <td className="p-3 text-xs text-clay">{session.lastActivityAt ? new Date(session.lastActivityAt).toLocaleString('en-PH') : ''}</td>
                {status === 'abandoned_checkout' && (
                  <td className="p-3 text-xs">
                    {session.recoveryStatus === 'sent' ? (
                      <span className="text-green-700">Sent {session.recoveryEmailSentAt ? new Date(session.recoveryEmailSentAt).toLocaleString('en-PH') : ''}</span>
                    ) : session.recoveryConsent && session.email ? (
                      <div>
                        <button
                          type="button"
                          className="font-semibold text-accent underline disabled:opacity-50"
                          disabled={sendingSessionId === session.sessionId || session.recoveryStatus === 'sending'}
                          onClick={() => sendRecoveryEmail(session)}
                        >
                          {sendingSessionId === session.sessionId || session.recoveryStatus === 'sending'
                            ? 'Sending...'
                            : session.recoveryStatus === 'failed' ? 'Retry reminder' : 'Send one-time reminder'}
                        </button>
                        {session.recoveryError && <span className="mt-1 block text-red-700">{session.recoveryError}</span>}
                      </div>
                    ) : <span className="text-clay">No consent</span>}
                  </td>
                )}
                <td className="p-3"><button type="button" className="text-xs font-semibold text-red-700 underline" onClick={() => deleteSession(session)}>Delete</button></td>
              </tr>
            ))}
            {!sessions.length && (
              <tr><td colSpan={status === 'abandoned_checkout' ? 8 : 7} className="p-6 text-center text-sm text-clay">No sessions found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
