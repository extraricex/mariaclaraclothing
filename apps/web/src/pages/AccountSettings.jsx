import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { customerJson, useCustomerLoggedIn } from '../lib/customerAuth.js';
import { loadBarangays, loadCities, loadProvinces } from '../lib/addressGuide.js';

export default function AccountSettings() {
  const navigate = useNavigate();
  const loggedIn = useCustomerLoggedIn();
  const [customer, setCustomer] = useState(null);
  const [message, setMessage] = useState({ tone: 'neutral', text: '' });
  const [profile, setProfile] = useState({ fullName: '', phone: '' });
  const [editAddress, setEditAddress] = useState(false);
  const [provinces, setProvinces] = useState([]);
  const [cities, setCities] = useState([]);
  const [barangays, setBarangays] = useState([]);
  const [draft, setDraft] = useState({ house: '', provinceCode: '', cityCode: '', barangayCode: '' });

  useEffect(() => {
    if (!loggedIn) {
      navigate('/login');
      return;
    }
    customerJson('/api/customer/me')
      .then((body) => {
        setCustomer(body.customer);
        setProfile({ fullName: body.customer.fullName, phone: body.customer.phone });
      })
      .catch((err) => setMessage({ tone: 'error', text: err.message }));
  }, [loggedIn, navigate]);

  useEffect(() => {
    if (editAddress && !provinces.length) loadProvinces().then(setProvinces);
  }, [editAddress, provinces.length]);
  useEffect(() => {
    setCities([]);
    if (draft.provinceCode) loadCities(draft.provinceCode).then(setCities);
  }, [draft.provinceCode]);
  useEffect(() => {
    setBarangays([]);
    if (draft.cityCode) loadBarangays(draft.cityCode).then(setBarangays);
  }, [draft.cityCode]);

  if (!customer) {
    return <div className="mx-auto max-w-7xl px-5 py-16 text-sm text-clay lg:px-8">{message.text || 'Loading settings…'}</div>;
  }

  async function save() {
    setMessage({ tone: 'neutral', text: '' });
    try {
      const changes = { fullName: profile.fullName, phone: profile.phone };
      if (editAddress) {
        const province = provinces.find((item) => item.code === draft.provinceCode);
        const city = cities.find((item) => item.code === draft.cityCode);
        const barangay = barangays.find((item) => item.code === draft.barangayCode);
        if (!draft.house.trim() || !province || !city || !barangay) {
          setMessage({ tone: 'error', text: 'Complete all address fields before saving.' });
          return;
        }
        changes.savedAddress = {
          houseAddress: draft.house.trim(),
          barangay: barangay.name,
          city: city.name,
          province: province.name,
          postalCode: ''
        };
      }
      const body = await customerJson('/api/customer/me', { method: 'PUT', body: JSON.stringify(changes) });
      setCustomer(body.customer);
      setEditAddress(false);
      setMessage({ tone: 'success', text: 'Settings saved.' });
    } catch (error) {
      setMessage({ tone: 'error', text: error.message });
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-5 py-10 lg:px-8">
      <Link to="/account" className="text-xs uppercase tracking-[0.12em] text-clay hover:text-accent">← Back to account</Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Account settings</p>
          <h1 className="display mt-1 text-4xl">Your details</h1>
        </div>
        <button type="button" className="btn-ink" onClick={save}>Save changes</button>
      </div>
      {message.text && (
        <p className={`mt-4 text-sm ${message.tone === 'error' ? 'text-accent-deep' : message.tone === 'success' ? 'text-[#2f7d32]' : 'text-ink-soft'}`} role="status">
          {message.text}
        </p>
      )}

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="border border-line bg-white p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Profile</h2>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="eyebrow">Full name</span>
              <input className="field mt-1" value={profile.fullName} onChange={(e) => setProfile((p) => ({ ...p, fullName: e.target.value }))} autoComplete="name" />
            </label>
            <label className="block">
              <span className="eyebrow">Mobile number</span>
              <input className="field mt-1" value={profile.phone} onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))} autoComplete="tel" />
            </label>
            <p className="text-xs text-clay">
              Email: <strong className="text-ink">{customer.email}</strong> (used for login — contact us to change it)
            </p>
            <p className="text-xs text-clay">
              Your mobile number also links your past guest orders to this account.
            </p>
          </div>
        </section>

        <section className="border border-line bg-white p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.12em]">Saved shipping address</h2>
            <button type="button" className="text-xs text-accent underline" onClick={() => setEditAddress((value) => !value)}>
              {editAddress ? 'Cancel' : customer.savedAddress ? 'Change' : 'Add'}
            </button>
          </div>
          {!editAddress ? (
            <p className="mt-4 text-sm text-ink-soft">
              {customer.savedAddress
                ? `${customer.savedAddress.houseAddress}, ${customer.savedAddress.barangay}, ${customer.savedAddress.city}, ${customer.savedAddress.province}`
                : 'None yet — save one and checkout prefills automatically.'}
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <input className="field" placeholder="House no. / Street / Unit" value={draft.house} onChange={(e) => setDraft((d) => ({ ...d, house: e.target.value }))} autoComplete="street-address" />
              <select className="field" value={draft.provinceCode} onChange={(e) => setDraft((d) => ({ ...d, provinceCode: e.target.value, cityCode: '', barangayCode: '' }))}>
                <option value="">Select province</option>
                {provinces.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              <select className="field" value={draft.cityCode} disabled={!cities.length} onChange={(e) => setDraft((d) => ({ ...d, cityCode: e.target.value, barangayCode: '' }))}>
                <option value="">Select city / municipality</option>
                {cities.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
              <select className="field" value={draft.barangayCode} disabled={!barangays.length} onChange={(e) => setDraft((d) => ({ ...d, barangayCode: e.target.value }))}>
                <option value="">Select barangay</option>
                {barangays.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
              </select>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
