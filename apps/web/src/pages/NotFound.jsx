import { useEffect } from 'react';
import { Link } from 'react-router-dom';

export default function NotFound({
  eyebrow = '404',
  title = 'Page not found',
  message = 'The page you requested does not exist or is no longer available.'
}) {
  useEffect(() => {
    const previousTitle = document.title;
    let robots = document.querySelector('meta[name="robots"]');
    const createdRobots = !robots;
    const previousRobots = robots?.getAttribute('content') || '';
    if (!robots) {
      robots = document.createElement('meta');
      robots.setAttribute('name', 'robots');
      document.head.appendChild(robots);
    }
    document.title = `${title} | Maria Clara Clothing`;
    robots.setAttribute('content', 'noindex, nofollow');
    return () => {
      document.title = previousTitle;
      if (createdRobots) robots.remove();
      else robots.setAttribute('content', previousRobots);
    };
  }, [title]);

  return (
    <section className="mx-auto min-h-[55vh] max-w-3xl px-5 py-20 text-center sm:py-24 lg:px-8" role="status">
      <p className="eyebrow">{eyebrow}</p>
      <h1 className="display mt-3 text-4xl leading-tight sm:text-6xl">{title}</h1>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-ink-soft">{message}</p>
      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Link to="/" className="btn-ink customer-compact-button">Back to shop</Link>
        <Link to="/contact" className="btn-ghost customer-compact-button">Contact support</Link>
      </div>
    </section>
  );
}

