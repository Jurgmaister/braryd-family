import Icon from './Icon.jsx';

const TABS = [
  { id: 'kalender', label: 'Kalender', icon: 'calendar', href: '#/' },
  { id: 'oppgaver', label: 'Oppgaver', icon: 'tasks', href: '#/oppgaver' },
  { id: 'uke', label: 'Middag', icon: 'plate', href: '#/middag' },
  { id: 'handle', label: 'Handleliste', icon: 'cart', href: '#/handle' },
  { id: 'tilbud', label: 'Priser', icon: 'tag', href: '#/tilbud' },
];

export default function TabBar({ active, antallHandle, antallOppgaver }) {
  return (
    <nav className="tabbar" aria-label="Hovedmeny">
      {TABS.map((t) => {
        const on = t.id === active;
        return (
          <a key={t.id} href={t.href} className={on ? 'tab tab-on' : 'tab'} aria-current={on ? 'page' : undefined}>
            <span className="tab-ikon">
              <Icon name={t.icon} strokeWidth={on ? 2.1 : 1.8} />
              {t.id === 'handle' && antallHandle > 0 && <span className="tab-tall">{antallHandle > 99 ? '99' : antallHandle}</span>}
              {t.id === 'oppgaver' && antallOppgaver > 0 && <span className="tab-tall">{antallOppgaver > 99 ? '99' : antallOppgaver}</span>}
            </span>
            <span>{t.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
