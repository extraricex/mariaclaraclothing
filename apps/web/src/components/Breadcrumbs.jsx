import { Link } from 'react-router-dom';

export default function Breadcrumbs({ items = [], className = '' }) {
  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-clay">
        {items.map((item, index) => {
          const hideLongCurrentItemOnPhone = items.length > 2 && index === items.length - 1 && !item.to;
          return (
            <li key={`${item.label}-${index}`} className={`items-center gap-2 ${hideLongCurrentItemOnPhone ? 'hidden sm:flex' : 'flex'}`}>
              {index > 0 && <span aria-hidden="true">/</span>}
              {item.to ? <Link to={item.to} className="hover:text-accent">{item.label}</Link> : <span aria-current="page">{item.label}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
