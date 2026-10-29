import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import GuestOrderPage from '../../src/pages/GuestOrderPage.jsx';
import GuestOrdersAdmin from '../../src/pages/GuestOrdersAdmin.jsx';
import GuestOrderEntry from '../../src/components/guest/GuestOrderEntry.jsx';
import { createGuestOrdersService } from '../../base44/shared/guestOrders.js';
import { createGuestStore } from '../../base44/shared/guestOrderStore.js';

const mode = new URLSearchParams(window.location.search).get('mode') || 'guest';
const c = { code: 'BF', nom: 'Burkina Faso', actif: true, indicatif: '+226', phone_min_length: 8, phone_max_length: 8, phone_pattern: '^[05-7][0-9]{7}$', prix_minimum: 500, devise: 'XOF', devise_symbole: 'FCFA' };
const gh = { ...c, code: 'GH', nom: 'Ghana', indicatif: '+233', phone_min_length: 9, phone_max_length: 9, phone_pattern: '^2[0-9]{8}$' };
const quartiers = [{ id: 'saaba', nom: 'Saaba', ville: 'Saaba', ville_operationnelle: 'ouagadougou', country_code: 'BF', actif: true, latitude: 12.3, longitude: -1.4 }, { id: 'cissin', nom: 'Cissin', ville: 'Ouagadougou', ville_operationnelle: 'ouagadougou', country_code: 'BF', actif: true, latitude: 12.3, longitude: -1.5 }];
const state = { control: { id: 'control', cle: 'GUEST_ORDERS_V1', revision: 0, enabled: mode !== 'off', safety_reviewed: true, countries: '["BF"]', grants: '[]', audit: '[]' },
  registry: { id: 'registry', cle: 'GUEST_ORDERS_V1', revision: 0, ledger: '[]' }, rows: [], creates: 0, calls: [], failCreate: false, failRead: false, storage: null };
window.guestFixture = state;
const clone = value => structuredClone(value);
const match = (row, query) => Object.entries(query).every(([key, value]) => value && typeof value === 'object' && '$in' in value ? value.$in.includes(row[key]) : row[key] === value);
const cas = key => ({ filter: async () => [clone(state[key])], updateMany: async (filter, patch) => { if (!match(state[key], filter)) return { updated: 0 }; Object.assign(state[key], clone(patch.$set)); return { updated: 1 }; } });
const entities = { GuestOrderControl: cas('control'), GuestOrderRegistry: cas('registry'), Country: { filter: async query => [c, gh].filter(row => !query.code || query.code === row.code) }, Quartier: { filter: async () => quartiers, get: async id => quartiers.find(q => q.id === id) },
  CourseExterne: { create: async data => { if (state.failCreate) throw Error('Simulated response loss before write'); state.creates++; const row = { ...data, id: 'guest-fixture-' + state.creates, reference: 'TEST-INVITE', created_date: '2026-10-28T03:00:00.000Z' }; state.rows.push(row); return clone(row); },
    get: async id => clone(state.rows.find(r => r.id === id)), filter: async query => { if (state.failRead) throw Error('Lecture isolée indisponible'); return clone(state.rows.filter(r => match(r, query))); } } };
const service = createGuestOrdersService({ store: createGuestStore({ asServiceRole: { entities } }), entities,
  publish: async course => { const row = state.rows.find(r => r.id === course.id); row.statut = 'recherche_livreur'; row.dispatch_status = 'disponible_push'; return { success: true }; },
  cancel: async course => { const row = state.rows.find(r => r.id === course.id); row.statut = 'annulee'; row.annulation_user_id = 'test-guest'; }, decide: async () => { throw Error('Not used in visual fixture'); } });
const admin = { id: 'admin', role: 'admin', admin_type: 'global' };
const call = async (action, body = {}) => {
  state.calls.push(action);
  if (action === 'config') return service.config();
  if (action === 'catalog') return service.catalog(body);
  if (action === 'create') {
    if (state.rejectPhone) throw Object.assign(Error('Vérifiez le numéro et le pays.'), { code: 'PHONE_INVALID' });
    return service.create({ ...body, action });
  }
  if (action === 'track') return service.track(body);
  if (['cancel', 'retry_dispatch', 'consent'].includes(action)) return service.act({ ...body, action });
  return service.admin({ ...body, action }, admin);
};
window.guestCall = call;
const storage = { read: async () => clone(state.storage), save: async data => { state.storage = clone(data); } };
window.guestInvoke = async (_name, payload) => ({ data: await call(payload.action, payload) });
const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.guestInvalidate = () => queryClient.invalidateQueries();
createRoot(document.getElementById('root')).render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[['off', 'entry'].includes(mode) ? '/' : '/commande-invitee']}><div className="bg-yellow-100 px-4 py-1 text-xs text-black">RECETTE ISOLÉE — AUCUN ENVOI RÉEL</div><Routes><Route path="/" element={<GuestOrderEntry />} /><Route path="/commande-invitee" element={mode === 'admin' ? <GuestOrdersAdmin call={call} /> : <GuestOrderPage call={call} storage={storage} isolatedMap />} /></Routes></MemoryRouter></QueryClientProvider>);
