import React from 'react';
import { clientDecisionView } from '../../../base44/shared/clientDecisionView.js';

export default function ClientDecisionNotice({ course }) {
  const decision = clientDecisionView(course);
  if (!decision.waiting) return null;
  return <div role="status" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
    <p className="font-semibold">En attente de votre décision</p>
    <p className="mt-1 break-words">{decision.message}</p>
  </div>;
}
