import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { responsiveImageAttributes } from '../lib/responsiveImage.js';

function Destination({ href, openInNewTab, children, ...props }) {
  if (!href) return null;
  const target = openInNewTab ? '_blank' : undefined;
  const rel = openInNewTab ? 'noopener noreferrer' : undefined;
  if (href.startsWith('/') || href.startsWith('#')) {
    return <Link to={href} target={target} rel={rel} {...props}>{children}</Link>;
  }
  return <a href={href} target={target} rel={rel} {...props}>{children}</a>;
}

export default function CollectionBanner({ banner }) {
  const desktopImage = banner?.desktopImage || {};
  const mobileImage = banner?.mobileImage || {};
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [desktopImage.url, mobileImage.url]);

  if (!banner?.visible || !desktopImage.url || failed) return null;

  const hasText = Boolean(banner.label || banner.title || banner.subtitle || banner.buttonText);
  const alignment = banner.textAlignment === 'center'
    ? 'items-center text-center'
    : banner.textAlignment === 'right'
      ? 'items-end text-right'
      : 'items-start text-left';
  const textColor = banner.textColor === 'dark' ? 'text-ink' : 'text-white';
  const linkLabel = banner.title || banner.altText || 'View Maria Clara Clothing collection';

  return (
    <section className="mx-auto mt-10 max-w-7xl px-5 sm:mt-14 lg:mt-20 lg:px-8" aria-label="Freedom of Mind collection banner">
      <div className="relative isolate overflow-hidden bg-cream">
        <picture>
          {mobileImage.url && (
            <source
              media="(max-width: 639px)"
              srcSet={mobileImage.url}
              width={mobileImage.width || undefined}
              height={mobileImage.height || undefined}
            />
          )}
          <img
            src={desktopImage.url}
            {...responsiveImageAttributes(desktopImage.url)}
            width={desktopImage.width || undefined}
            height={desktopImage.height || undefined}
            alt={banner.altText || 'Maria Clara Clothing collection banner'}
            loading="lazy"
            decoding="async"
            className="block h-auto w-full"
            onError={() => setFailed(true)}
          />
        </picture>
        {banner.overlayOpacity > 0 && (
          <div className="pointer-events-none absolute inset-0 z-[1] bg-black" style={{ opacity: banner.overlayOpacity / 100 }} aria-hidden="true" />
        )}
        {banner.link && (
          <Destination
            href={banner.link}
            openInNewTab={banner.openInNewTab}
            className="absolute inset-0 z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white"
            aria-label={linkLabel}
          />
        )}
        {hasText && (
          <div className={`pointer-events-none absolute inset-0 z-20 flex flex-col justify-end p-5 sm:p-8 lg:p-12 ${alignment} ${textColor}`}>
            {banner.label && <p className="text-xs font-semibold uppercase tracking-[0.14em] sm:text-sm">{banner.label}</p>}
            {banner.title && <h2 className="display mt-2 max-w-3xl text-3xl sm:text-5xl lg:text-6xl">{banner.title}</h2>}
            {banner.subtitle && <p className="mt-3 max-w-xl text-sm leading-relaxed sm:text-base">{banner.subtitle}</p>}
            {banner.buttonText && banner.buttonLink ? (
              <Destination
                href={banner.buttonLink}
                openInNewTab={banner.openInNewTab}
                className="pointer-events-auto mt-5 inline-flex min-h-11 items-center border border-current px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                {banner.buttonText}
              </Destination>
            ) : banner.buttonText ? (
              <span className="mt-5 inline-flex min-h-11 items-center border border-current px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em]">{banner.buttonText}</span>
            ) : null}
          </div>
        )}
      </div>
    </section>
  );
}
