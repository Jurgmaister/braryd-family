import { useEffect, useState } from 'react';
import { isConfigured } from './config.js';
import { supabase } from './supabase.js';
import { useSession, useHandleliste } from './data.js';
import Login from './pages/Login.jsx';
import Uke from './pages/Uke.jsx';
import Handleliste from './pages/Handleliste.jsx';
import Tilbud from './pages/Tilbud.jsx';
import Middager from './pages/Middager.jsx';
import Innstillinger from './pages/Innstillinger.jsx';
import TabBar from './components/TabBar.jsx';
import Toast from './components/Toast.jsx';

function parseRoute() {
  return window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/').filter(Boolean);
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);
  useEffect(() => {
    const onHash = () => { setRoute(parseRoute()); window.scrollTo(0, 0); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  if (!isConfigured) {
    return (
      <main className="page">
        <h1 className="h1">BraRyd</h1>
        <p className="muted">Appen er ikke koblet til databasen ennå. Fyll inn .env.production (se OPPSETT.md) og bygg på nytt.</p>
      </main>
    );
  }
  return <Innlogget route={route} />;
}

function Innlogget({ route }) {
  const session = useSession();
  const [medlem, setMedlem] = useState(undefined);

  useEffect(() => {
    if (!session) { setMedlem(undefined); return; }
    supabase.rpc('er_medlem').then(({ data }) => setMedlem(data === true));
  }, [session]);

  if (session === undefined || (session && medlem === undefined)) {
    return <main className="page laster"><div className="spinner" aria-label="Laster" /></main>;
  }
  if (!session) return <Login />;
  if (!medlem) {
    return (
      <main className="page narrow">
        <h1 className="h1">Nesten inne</h1>
        <p className="muted">{session.user.email} er ikke lagt til som familiemedlem ennå. Be Jørgen legge deg til i Supabase (se OPPSETT.md, steg 1).</p>
        <button className="btn btn-ghost" type="button" onClick={() => supabase.auth.signOut()}>Logg ut</button>
      </main>
    );
  }
  return <Skall route={route} email={session.user.email} />;
}

function Skall({ route, email }) {
  const liste = useHandleliste();
  const [seksjon] = route;
  const antall = (liste.varer || []).filter((v) => !v.kjopt).length;

  let side;
  let aktiv = seksjon || 'uke';
  if (seksjon === 'handle') side = <Handleliste liste={liste} />;
  else if (seksjon === 'tilbud') side = <Tilbud liste={liste} />;
  else if (seksjon === 'middager') side = <Middager />;
  else if (seksjon === 'innstillinger') side = <Innstillinger email={email} />;
  else { side = <Uke />; aktiv = 'uke'; }

  return (
    <div className="app">
      <div className="app-content">{side}</div>
      <TabBar active={aktiv} antallHandle={antall} />
      <Toast />
    </div>
  );
}
