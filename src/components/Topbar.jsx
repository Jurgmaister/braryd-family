import Icon from './Icon.jsx';

export default function Topbar({ tittel, under, children }) {
  return (
    <header className="topbar">
      <div className="topbar-tekst">
        <h1 className="h1">{tittel}</h1>
        {under && <p className="muted topbar-under">{under}</p>}
      </div>
      <div className="topbar-knapper">
        {children}
        <a className="ikonknapp" href="#/innstillinger" aria-label="Innstillinger"><Icon name="gear" /></a>
      </div>
    </header>
  );
}
