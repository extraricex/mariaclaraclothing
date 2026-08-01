import { useStorefrontSettings } from '../lib/storeSettings.js';

function ContactLink({ href, label, value }) {
  if (!href || !value) return null;
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noreferrer' : undefined}
      className="group flex flex-col items-start gap-1.5 border-t border-line py-4 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-4"
      aria-label={`${label}: ${value}`}
    >
      <span className="font-semibold uppercase tracking-[0.12em]">{label}</span>
      <span className="min-w-0 max-w-full break-words text-left text-ink-soft group-hover:text-accent sm:text-right">{value}</span>
    </a>
  );
}

function ContactDetail({ label, value }) {
  if (!value) return null;
  return (
    <div className="flex flex-col items-start gap-1.5 border-t border-line py-4 text-sm sm:flex-row sm:justify-between sm:gap-4">
      <span className="font-semibold uppercase tracking-[0.12em]">{label}</span>
      <span className="min-w-0 break-words text-left leading-relaxed text-ink-soft sm:text-right">{value}</span>
    </div>
  );
}

export default function Contact() {
  const settings = useStorefrontSettings();
  const facebook = settings.socialLinks?.facebook || 'https://www.facebook.com/mariaclaraclothing';
  const instagram = settings.socialLinks?.instagram || 'https://www.instagram.com/mariaclaraclothingshop/';
  const messenger = settings.messengerUrl || 'https://m.me/mariaclaraclothing';
  const email = settings.contactEmail || '';
  const phone = settings.contactNumber || '';
  const address = settings.storeAddress || '';

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-5 sm:py-14 lg:px-8">
      <p className="eyebrow">Maria Clara Clothing</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">Contact</h1>
      <p className="mt-4 text-sm leading-relaxed text-ink-soft">
        Message us for order help, sizing questions, delivery updates, and product availability.
      </p>

      <div className="mt-10 border-b border-line">
        <ContactLink href={messenger} label="Messenger" value="Message us on Messenger" />
        <ContactLink href={facebook} label="Facebook" value="Maria Clara Clothing Facebook" />
        <ContactLink href={instagram} label="Instagram" value="Maria Clara Clothing Instagram" />
        <ContactLink href={email ? `mailto:${email}` : ''} label="Email" value={email} />
        <ContactLink href={phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : ''} label="Phone" value={phone} />
        <ContactDetail label="Store location" value={address} />
      </div>
    </div>
  );
}
