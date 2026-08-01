import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { DEFAULT_STOREFRONT_SETTINGS, loadStorefrontSettings } from '../lib/storeSettings.js';

export default function InfoPage({ title, pageKey }) {
  const [sections, setSections] = useState(DEFAULT_STOREFRONT_SETTINGS.infoPages[pageKey] || []);

  useEffect(() => {
    let active = true;
    setSections(DEFAULT_STOREFRONT_SETTINGS.infoPages[pageKey] || []);
    loadStorefrontSettings().then((settings) => {
      const rows = settings.infoPages?.[pageKey];
      if (active && Array.isArray(rows) && rows.length) setSections(rows);
    });
    return () => {
      active = false;
    };
  }, [pageKey]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-5 sm:py-14 lg:px-8">
      <p className="eyebrow">Maria Clara Clothing</p>
      <h1 className="display mt-2 text-4xl sm:text-5xl">{title}</h1>
      <div className="mt-10">
        {sections.map((section, index) => (
          <details key={section.heading} className="group border-t border-line py-5" open={index === 0}>
            <summary className="flex min-w-0 cursor-pointer items-center justify-between gap-4 text-sm font-semibold uppercase tracking-[0.12em]">
              {section.heading}
              <span className="text-accent transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-3 break-words text-sm leading-relaxed text-ink-soft">{section.body}</p>
            {section.imageUrl && (
              <img
                src={section.imageUrl}
                alt={section.imageAltText || section.heading}
                className="mt-4 w-full rounded-sm border border-line bg-white object-contain"
                loading="lazy"
              />
            )}
            {section.linkHref && section.linkText && (
              section.linkHref.startsWith('/') ? (
                <Link to={section.linkHref} className="btn-ghost mt-4 inline-flex !px-4 !py-2 text-xs">
                  {section.linkText}
                </Link>
              ) : (
                <a href={section.linkHref} target="_blank" rel="noreferrer" className="btn-ghost mt-4 inline-flex !px-4 !py-2 text-xs">
                  {section.linkText}
                </a>
              )
            )}
          </details>
        ))}
        <div className="hairline" />
      </div>
    </div>
  );
}
