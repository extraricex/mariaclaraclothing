import { useEffect, useState } from 'react';
import { loadStorefrontSettings } from '../lib/storeSettings.js';

export default function MaintenanceGate({ children }) {
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    loadStorefrontSettings().then((settings) => setMaintenance(Boolean(settings.maintenanceMode)));
  }, []);

  if (!maintenance) return children;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <p className="display text-4xl">Maria<span className="text-accent">Clara</span></p>
      <h1 className="mt-6 text-sm font-semibold uppercase tracking-[0.18em]">We'll be right back</h1>
      <p className="mt-3 max-w-sm text-sm text-ink-soft">
        The store is briefly down for maintenance. Follow our socials for updates — we won't be long.
      </p>
    </div>
  );
}
