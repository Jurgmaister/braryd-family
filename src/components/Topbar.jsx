import { useState } from 'react';
import Icon from './Icon.jsx';
import SendMelding from './SendMelding.jsx';
import { useRett } from '../data.js';

export default function Topbar({ tittel, under, children }) {
  const [melding, setMelding] = useState(false);
  const kanPush = useRett('push');
  return (
    <header className="topbar">
      <div className="topbar-tekst">
        <h1 className="h1">{tittel}</h1>
        {under && <p className="muted topbar-under">{under}</p>}
      </div>
      <div className="topbar-knapper">
        {children}
        {kanPush && <button type="button" className="ikonknapp" onClick={() => setMelding(true)} aria-label="Send melding til familien"><Icon name="bell" /></button>}
        <a className="ikonknapp" href="#/innstillinger" aria-label="Innstillinger"><Icon name="gear" /></a>
      </div>
      <SendMelding open={melding} onClose={() => setMelding(false)} />
    </header>
  );
}
