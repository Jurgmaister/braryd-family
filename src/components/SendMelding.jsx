import { useEffect, useState } from 'react';
import { supabase, callFunction } from '../supabase.js';
import { useMedlemmer, navnFor } from '../data.js';
import { relativDato } from '../util.js';
import Sheet from './Sheet.jsx';
import Icon from './Icon.jsx';
import { toast } from './Toast.jsx';

const HURTIG = ['Middagen er klar! 🍽️', 'Kan noen handle på vei hjem?', 'Husk å rydde rommet', 'Jeg er på vei hjem'];

export default function SendMelding({ open, onClose }) {
  const medlemmer = useMedlemmer();
  const [til, setTil] = useState(null);
  const [tekst, setTekst] = useState('');
  const [sender, setSender] = useState(false);
  const [siste, setSiste] = useState([]);
  const [meg, setMeg] = useState('');

  useEffect(() => {
    if (!open) return;
    setTekst(''); setTil(null);
    supabase.auth.getSession().then(({ data }) => setMeg(data.session?.user?.email?.toLowerCase() || ''));
    supabase.from('meldinger').select('*').order('sendt', { ascending: false }).limit(5).then(({ data }) => setSiste(data || []));
  }, [open]);

  async function send(e) {
    e.preventDefault();
    if (!tekst.trim()) return;
    setSender(true);
    try {
      const svar = await callFunction('send-melding', { til, tekst: tekst.trim() });
      toast(svar.sendt ? `Sendt til ${svar.sendt} ${svar.sendt === 1 ? 'telefon' : 'telefoner'}` : 'Lagret, men ingen mottakere har slått på varsler ennå');
      onClose();
    } catch (err) { toast(err.message); } finally { setSender(false); }
  }

  return (
    <Sheet open={open} onClose={onClose} tittel="Send melding">
      <form className="stack" onSubmit={send}>
        <div>
          <p className="feltnavn">Til</p>
          <div className="chips">
            <button type="button" className={!til ? 'chip chip-on' : 'chip'} onClick={() => setTil(null)}>Hele familien</button>
            {medlemmer.filter((m) => m.email.toLowerCase() !== meg).map((m) => (
              <button key={m.email} type="button" className={til === m.email.toLowerCase() ? 'chip chip-on' : 'chip'} onClick={() => setTil(m.email.toLowerCase())}>{m.navn}</button>
            ))}
          </div>
        </div>
        <label className="field">Melding
          <textarea rows={3} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Skriv en melding" maxLength={500} />
        </label>
        <div className="chips">
          {HURTIG.map((t) => <button key={t} type="button" className="chip" onClick={() => setTekst(t)}>{t}</button>)}
        </div>
        <button type="submit" className="btn btn-primary btn-lg" disabled={sender || !tekst.trim()}><Icon name="send" size={18} /> Send push-varsel</button>
        <p className="muted liten">Meldingen kommer som varsel på telefonene som har slått på varsler under Innstillinger.</p>
        {siste.length > 0 && (
          <div>
            <p className="feltnavn">Siste meldinger</p>
            <ul className="meldingsliste">
              {siste.map((m) => (
                <li key={m.id}><b>{navnFor(medlemmer, m.fra)}</b>{m.til ? ` → ${navnFor(medlemmer, m.til)}` : ''}: {m.tekst} <span className="muted liten">· {relativDato(m.sendt)}</span></li>
              ))}
            </ul>
          </div>
        )}
      </form>
    </Sheet>
  );
}
