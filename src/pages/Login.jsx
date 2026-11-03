import { useState } from 'react';
import { supabase } from '../supabase.js';

export default function Login() {
  const [email, setEmail] = useState('');
  const [passord, setPassord] = useState('');
  const [feil, setFeil] = useState('');
  const [sender, setSender] = useState(false);

  async function loggInn(e) {
    e.preventDefault();
    setSender(true); setFeil('');
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: passord });
    setSender(false);
    if (error) setFeil(error.message.includes('Invalid') ? 'Feil e-post eller passord.' : error.message);
  }

  return (
    <main className="page narrow login">
      <div className="login-merke">
        <img src="./icons/icon-192.png" alt="" width="72" height="72" />
        <h1 className="h1">BraRyd</h1>
        <p className="muted">Familieplanleggeren vår</p>
      </div>
      <form className="card stack" onSubmit={loggInn}>
        <label className="field">E-post
          <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label className="field">Passord
          <input type="password" autoComplete="current-password" required value={passord} onChange={(e) => setPassord(e.target.value)} />
        </label>
        {feil && <p className="feil">{feil}</p>}
        <button className="btn btn-primary btn-lg" type="submit" disabled={sender}>{sender ? 'Logger inn …' : 'Logg inn'}</button>
      </form>
      <p className="muted liten">Tips: Legg appen på hjemskjermen (Del → Legg til på Hjem-skjerm), så holder du deg innlogget.</p>
    </main>
  );
}
