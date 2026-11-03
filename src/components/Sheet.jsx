import { useEffect } from 'react';
import Icon from './Icon.jsx';

// Panel som glir opp nederfra (fungerer som et vindu på mobil).
// lesemodus: alt i panelet er låst (kun innsyn), og knappene nederst skjules.
export default function Sheet({ open, onClose, tittel, children, footer, lesemodus = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', esc);
    const forrige = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', esc); document.body.style.overflow = forrige; };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-bakgrunn" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={tittel} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-topp">
          <h2 className="h2">{tittel}</h2>
          <button type="button" className="ikonknapp" onClick={onClose} aria-label="Lukk"><Icon name="close" /></button>
        </div>
        <div className="sheet-innhold">
          {lesemodus && <p className="innsyn-merke">👀 Kun innsyn</p>}
          {lesemodus ? <fieldset disabled className="innsyn">{children}</fieldset> : children}
        </div>
        {footer && !lesemodus && <div className="sheet-bunn">{footer}</div>}
      </div>
    </div>
  );
}
