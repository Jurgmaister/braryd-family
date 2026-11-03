// Vises øverst på en side når personen bare har innsyn
export default function KunInnsyn({ hva }) {
  return <p className="innsyn-banner">👀 Du har bare innsyn i {hva}. Spør Jørgen hvis du trenger å endre.</p>;
}
