import React from 'react';
import { MapPin, Flag, Check, Package, Truck, Search } from 'lucide-react';

export function GuestRoute({ depart, arrivee }) {
  return <div className="guest-route"><div><MapPin aria-hidden="true" /><p><span>Départ</span><strong>{depart}</strong></p></div><div><Flag aria-hidden="true" /><p><span>Arrivée</span><strong>{arrivee}</strong></p></div></div>;
}

export function GuestProgress({ course }) {
  const cancelled = course.statut === 'annulee';
  const assigned = course.assigned === true;
  const picked = !!course.pickup_at;
  const steps = [{ label: 'Commande reçue', done: true, Icon: Package }, { label: 'Livreur affecté', done: assigned, Icon: Search }, { label: 'Colis récupéré', done: picked, Icon: Truck }, { label: 'Livraison terminée', done: course.delivered === true, Icon: Check }];
  if (cancelled) return null;
  return <ol className="guest-progress" aria-label="Progression de la commande">{steps.map(({ label, done, Icon }) => <li key={label} data-done={done}><Icon aria-hidden="true" /><span>{label}</span><span className="sr-only">{done ? 'Confirmé' : 'Non confirmé'}</span></li>)}</ol>;
}
