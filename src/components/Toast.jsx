import { useEffect, useState } from 'react';

let vis = () => {};
export const toast = (tekst) => vis(tekst);

export default function Toast() {
  const [tekst, setTekst] = useState('');
  useEffect(() => {
    let t;
    vis = (s) => { setTekst(s); clearTimeout(t); t = setTimeout(() => setTekst(''), 2600); };
    return () => clearTimeout(t);
  }, []);
  if (!tekst) return null;
  return <div className="toast" role="status">{tekst}</div>;
}
