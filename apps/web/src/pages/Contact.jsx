import { useStorefrontSettings } from '../lib/storeSettings.js';

function ContactLink({ href, label, value }) {
  if (!href || !value) return null;
  return (
    <a
      href={href}
      target={href.startsWith('http') ? '_blank' : undefined}
      rel={href.startsWith('http') ? 'noreferrer' : undefined}
      className="group flex items-center justify-between gap-4 border-t border-line py-4 text-sm"
    >
      <span className="font-semibold uppercase tracking-[0.12em]">{label}</span>
      <span className="min-w-0 truncate text-right text-ink-soft group-hover:text-accent">{value}</span>
    </a>
  );
}

export default function Contact() {
  const settings = useStorefrontSettings();
  const facebook = settings.socialLinks?.facebook || 'https://www.facebook.com/mariaclaraclothing';
  const instagram = settings.socialLinks?.instagram || 'https://www.instagram.com/mariaclaraclothing/';
  const messenger = settings.messengerUrl || 'https://m.me/mariaclaraclothing';
  const email = settings.contactEmail || '';
  const phone = settings.contactNumber || '';

  return (
    <div className="mx-auto max-w-3xl px-5 py-14 lg:px-8">
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
      </div>
    </div>
  );
}
