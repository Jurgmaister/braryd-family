import Icon from './Icon.jsx';

const TABS = [
  { id: 'uke', label: 'Ukeplan', icon: 'calendar', href: '#/' },
  { id: 'handle', label: 'Handleliste', icon: 'cart', href: '#/handle' },
  { id: 'tilbud', label: 'Tilbud', icon: 'tag', href: '#/tilbud' },
  { id: 'middager', label: 'Middager', icon: 'book', href: '#/middager' },
];

export default function TabBar({ active, antallHandle }) {
  return (
    <nav className="tabbar" aria-label="Hovedmeny">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <a key={t.id} href={t.href} className={on ? 'tab tab-on' : 'tab'} aria-current={on ? 'page' : undefined}>
            <span className="tab-ikon">
              <Icon name={t.icon} strokeWidth={on ? 2.1 : 1.8} />
              {t.id === 'handle' && antallHandle > 0 && <span className="tab-tall">{antallHandle > 99 ? '99' : antallHandle}</span>}
            </span>
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
