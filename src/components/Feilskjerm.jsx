import { Component } from 'react';

// Viser en feilmelding i stedet for en blank side hvis noe krasjer.
export default class Feilskjerm extends Component {
  constructor(props) { super(props); this.state = { feil: null }; }
  static getDerivedStateFromError(feil) { return { feil }; }
  componentDidCatch(feil, info) { console.error('BraRyd krasjet:', feil, info?.componentStack); }
  render() {
    if (!this.state.feil) return this.props.children;
    return (
      <main className="page narrow">
        <h1 className="h1">Noe gikk galt</h1>
        <p className="muted">Appen møtte en feil. Prøv å laste inn på nytt. Hvis det skjer igjen, ta et skjermbilde av teksten under.</p>
        <pre className="feilkode">{String(this.state.feil?.message || this.state.feil)}</pre>
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>Last inn på nytt</button>
      </main>
    );
  }
}
