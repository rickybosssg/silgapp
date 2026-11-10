import { useCallback, useEffect, useRef, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { EVENT_MUSIC_EVENTS, EVENT_MUSIC_TRACKS, resolveEventMusicTrack } from '../../../base44/shared/eventMusicContract.js';
import { callEventMusicSettings, eventMusicStore } from '@/lib/eventMusicSettings';
import { prepareEventMusicFile, encodeEventMusicBytes, validEventMusicLabel } from '@/lib/eventMusicImport';

const defaults = () => Object.fromEntries(EVENT_MUSIC_EVENTS.map(event => [event.key, null]));
const same = (a, b) => EVENT_MUSIC_EVENTS.every(event => a?.[event.key] === b?.[event.key]);
const messages = {
  REVISION_CONFLICT: 'Ces réglages ont changé ailleurs. Relisez la version enregistrée avant de modifier le brouillon.',
  NOT_PROVISIONED: 'La configuration serveur doit être préparée avant la première sauvegarde.',
  FORBIDDEN: 'Seul un administrateur global autorisé peut modifier ces musiques.',
  UPLOAD_PENDING: 'Un import précédent est encore non confirmé. Une vérification technique est nécessaire avant un nouvel envoi.',
  TRACK_ALREADY_EXISTS: 'Ce fichier est déjà dans le catalogue. Relisez les réglages puis choisissez la musique existante.',
  UPLOAD_DISABLED: 'L’import serveur n’est pas encore activé. Aucun fichier envoyé.',
};

export default function EventMusicSettings({ api = base44 }) {
  const [status, setStatus] = useState(null);
  const [draft, setDraft] = useState(defaults);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Chargement des réglages…');
  const [needsReload, setNeedsReload] = useState(false);
  const [previewKey, setPreviewKey] = useState(null);
  const [localMedia, setLocalMedia] = useState(null), [fileLoading, setFileLoading] = useState(false);
  const [importLabel, setImportLabel] = useState(''), [broadcastConsent, setBroadcastConsent] = useState(false);
  const importFile = useRef(null), importUrl = useRef(null), fileGeneration = useRef(0);
  const lock = useRef(false), mounted = useRef(false), generation = useRef(0), preview = useRef(null);
  const stopPreview = useCallback(() => {
    const active = preview.current;
    preview.current = null;
    if (active) { clearTimeout(active.timer); active.audio.pause(); active.audio.currentTime = 0; }
    if (mounted.current) setPreviewKey(null);
  }, []);
  const load = useCallback(async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); stopPreview();
    const request = ++generation.current;
    try {
      const value = await callEventMusicSettings(api, { action: 'status' });
      if (!mounted.current || request !== generation.current) return;
      setStatus(value); setDraft(value.configuration.selections); setNeedsReload(false);
      eventMusicStore.apply(value.configuration);
      setMessage(value.upload_pending ? messages.UPLOAD_PENDING : value.writable ? 'Réglages enregistrés chargés. Aucun changement avant la sauvegarde.' : 'Préparation serveur nécessaire. Aperçus disponibles, sauvegarde désactivée.');
    } catch {
      if (mounted.current && request === generation.current) { setNeedsReload(true); setMessage('Réglages indisponibles ou accès refusé. Les sons actuels restent disponibles.'); }
    } finally {
      if (request === generation.current) { lock.current = false; if (mounted.current) setBusy(false); }
    }
  }, [api, stopPreview]);
  useEffect(() => {
    mounted.current = true; void load();
    const hide = () => { if (document.visibilityState !== 'visible') stopPreview(); };
    document.addEventListener('visibilitychange', hide);
    window.addEventListener('pagehide', stopPreview);
    return () => {
      mounted.current = false; generation.current++; fileGeneration.current++; lock.current = false; stopPreview();
      if (importUrl.current) URL.revokeObjectURL(importUrl.current); importUrl.current = null; importFile.current = null;
      document.removeEventListener('visibilitychange', hide);
      window.removeEventListener('pagehide', stopPreview);
    };
  }, [load, stopPreview]);

  const listen = async (key, suppliedTrack = undefined) => {
    stopPreview();
    if (previewKey === key) return;
    const track = suppliedTrack || resolveEventMusicTrack(key, draft, status?.configuration?.tracks || []);
    if (!track || typeof Audio === 'undefined' || document.visibilityState !== 'visible') return;
    const audio = new Audio(track.url);
    const active = { audio, timer: null };
    const finish = () => { if (preview.current === active) stopPreview(); };
    preview.current = active; audio.loop = false; setPreviewKey(key);
    audio.addEventListener('ended', finish, { once: true });
    audio.addEventListener('error', () => { if (preview.current !== active) return; finish(); if (mounted.current) setMessage('Aperçu indisponible. Aucun réglage modifié.'); }, { once: true });
    active.timer = setTimeout(finish, Math.min(track.durationMs || 25000, 30000));
    try {
      await audio.play();
      if (!mounted.current || preview.current !== active || document.visibilityState !== 'visible') { audio.pause(); audio.currentTime = 0; }
    } catch { if (preview.current !== active) return; finish(); if (mounted.current) setMessage('Lecture bloquée ou fichier indisponible. Réessayez en touchant Écouter.'); }
  };
  const save = async () => {
    if (lock.current || !status?.writable || needsReload || same(draft, status.configuration.selections)) return;
    lock.current = true; setBusy(true); stopPreview();
    const request = ++generation.current;
    try {
      const value = await callEventMusicSettings(api, { action: 'save', selections: { ...draft }, expected_revision: status.configuration.revision, request_id: crypto.randomUUID() });
      if (!mounted.current || request !== generation.current) return;
      // Never turn an empty, stale or mismatched response into a successful save.
      if (value.configuration.revision !== status.configuration.revision + 1 || !same(value.configuration.selections, draft)) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      setStatus({ ...value, writable: true }); setDraft(value.configuration.selections);
      eventMusicStore.apply(value.configuration); setNeedsReload(false);
      setMessage('Les quatre choix ont été enregistrés ensemble et relus. Les applications ouvertes les récupèrent sous cinq minutes.');
    } catch (error) {
      if (mounted.current && request === generation.current) {
        setNeedsReload(true);
        setMessage(messages[error.code] || 'Sauvegarde non confirmée. Relisez les réglages enregistrés avant toute nouvelle tentative. Votre brouillon reste visible.');
      }
    } finally {
      if (request === generation.current) { lock.current = false; if (mounted.current) setBusy(false); }
    }
  };
  const chooseFile = async file => {
    stopPreview(); const request = ++fileGeneration.current;
    if (importUrl.current) URL.revokeObjectURL(importUrl.current); importUrl.current = null; importFile.current = null;
    setLocalMedia(null); setBroadcastConsent(false); setFileLoading(true);
    try {
      const media = await prepareEventMusicFile(file);
      if (!mounted.current || request !== fileGeneration.current) return;
      const url = URL.createObjectURL(new Blob([media.bytes], { type: media.mime }));
      importUrl.current = url; importFile.current = media;
      setLocalMedia({ url, durationMs: media.durationMs, sizeBytes: media.bytes.length, mime: media.mime });
      setMessage('Fichier vérifié localement. Aucun envoi effectué. Écoutez-le puis confirmez sa diffusion si vous souhaitez l’ajouter.');
    } catch (error) { if (mounted.current && request === fileGeneration.current) setMessage(error.message); }
    finally { if (mounted.current && request === fileGeneration.current) setFileLoading(false); }
  };
  const upload = async () => {
    if (lock.current || !status?.writable || !status?.upload_enabled || needsReload || !importFile.current || !broadcastConsent || !validEventMusicLabel(importLabel)) return;
    lock.current = true; setBusy(true); stopPreview(); const request = ++generation.current;
    try {
      const media = importFile.current;
      const value = await callEventMusicSettings(api, { action: 'upload', expected_revision: status.configuration.revision,
        request_id: crypto.randomUUID(), audio_base64: encodeEventMusicBytes(media.bytes), mime_type: media.mime,
        label: importLabel.trim(), public_broadcast_consent: true });
      if (!mounted.current || request !== generation.current) return;
      if (!value.uploaded_track?.id || !value.configuration.tracks?.some(track => track.id === value.uploaded_track.id) ||
          !same(value.configuration.selections, status.configuration.selections) || value.configuration.revision < status.configuration.revision) throw new Error('Upload non confirmé');
      setStatus(value); eventMusicStore.apply(value.configuration); setNeedsReload(false);
      if (importUrl.current) URL.revokeObjectURL(importUrl.current); importUrl.current = null; importFile.current = null;
      setLocalMedia(null); setBroadcastConsent(false); setImportLabel('');
      setMessage('Nouvelle musique ajoutée au catalogue. Choisissez les événements qui doivent l’utiliser, puis enregistrez tous les choix.');
    } catch (error) {
      if (mounted.current && request === generation.current) { setNeedsReload(true); setMessage(messages[error.code] || 'Import non confirmé. Aucun renvoi automatique. Relisez les réglages avant toute nouvelle tentative.'); }
    } finally { if (request === generation.current) { lock.current = false; if (mounted.current) setBusy(false); } }
  };
  const tracks = [...EVENT_MUSIC_TRACKS, ...(status?.configuration?.tracks || [])];
  const dirty = !!status && !same(draft, status.configuration.selections);
  return <section className="rounded-2xl border bg-white p-4 sm:p-5 space-y-4 min-w-0" aria-label="Musiques des événements">
    <div><h2 className="font-bold text-lg">Musiques des événements</h2>
      <p className="text-sm text-muted-foreground">Choisissez un son différent pour chaque événement, puis enregistrez les quatre choix en une fois.</p></div>
    <p className="text-xs text-muted-foreground">Clients et invités partagent les mêmes sons. Ces réglages globaux concernent la lecture dans l’application, pas les alarmes natives ni les notifications système.</p>
    {status && <div className="grid gap-3 sm:grid-cols-2">
      {EVENT_MUSIC_EVENTS.map(event => <div key={event.key} className="rounded-xl border p-3 space-y-2 min-w-0">
        <label className="block text-sm font-semibold" htmlFor={'event-music-' + event.key}>{event.label}</label>
        <select id={'event-music-' + event.key} className="w-full min-w-0 rounded-lg border bg-white p-2 text-sm" value={draft[event.key] ?? ''} disabled={busy || needsReload} onChange={e => { stopPreview(); setDraft(previous => ({ ...previous, [event.key]: e.target.value || null })); }}>
          <option value="">Son actuel par défaut</option>
          {tracks.map(track => <option key={track.id} value={track.id}>{track.label}</option>)}
        </select>
        <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => void listen(event.key)} disabled={busy} aria-label={(previewKey === event.key ? 'Arrêter ' : 'Écouter ') + event.label}>
          {previewKey === event.key ? 'Arrêter' : 'Écouter'}
        </button>
      </div>)}
    </div>}
    <fieldset className="rounded-xl border p-3 space-y-3 min-w-0" disabled={busy || fileLoading || needsReload}>
      <legend className="px-1 font-semibold text-sm">Ajouter une nouvelle musique</legend>
      <p className="text-xs text-muted-foreground">MP3 ou WAV PCM, de 0,2 à 30 secondes, 3 Mo maximum. L’acceptation livreur reste limitée à 25 secondes. Le fichier choisi reste local jusqu’au bouton d’import.</p>
      <label className="block text-sm">Fichier audio<input className="block mt-1 w-full min-w-0 text-sm" type="file" accept=".mp3,.wav,audio/mpeg,audio/wav" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (file) void chooseFile(file); }} /></label>
      <label className="block text-sm">Nom dans le catalogue<input className="block mt-1 w-full rounded-lg border p-2" type="text" maxLength={60} value={importLabel} onChange={e => setImportLabel(e.target.value)} placeholder="Ex. Recherche calme" /></label>
      {localMedia && <div className="flex flex-wrap items-center gap-2 text-sm"><span>{(localMedia.durationMs / 1000).toFixed(1)} s · {Math.ceil(localMedia.sizeBytes / 1024)} Ko</span><button className="rounded-lg border px-3 py-2" type="button" onClick={() => void listen('import', localMedia)}>{previewKey === 'import' ? 'Arrêter le fichier' : 'Écouter le fichier'}</button></div>}
      <label className="flex gap-2 items-start text-sm"><input className="mt-1" type="checkbox" checked={broadcastConsent} onChange={e => setBroadcastConsent(e.target.checked)} /><span>J’ai les droits nécessaires. J’autorise l’hébergement public de cet audio par SILGAPP et sa diffusion aux clients, invités et livreurs. Il ne contient aucune donnée privée.</span></label>
      <button className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" type="button" disabled={busy || fileLoading || needsReload || !status?.writable || !status?.upload_enabled || !localMedia || !broadcastConsent || !validEventMusicLabel(importLabel)} onClick={() => void upload()}>Importer dans le catalogue</button>
      {!status?.upload_enabled && <p className="text-xs text-muted-foreground">Import serveur désactivé : le stockage sécurisé doit être configuré et vérifié avant son activation. La validation et l’écoute locales restent disponibles.</p>}
    </fieldset>
    <div className="flex flex-wrap gap-2">
      <button type="button" className="rounded-lg bg-primary px-4 py-2 text-sm text-white disabled:opacity-50" disabled={busy || !status?.writable || needsReload || !dirty} onClick={() => void save()}>Enregistrer tous les choix</button>
      <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={busy || !status || needsReload} onClick={() => { stopPreview(); setDraft(defaults()); }}>Rétablir les sons par défaut</button>
      <button type="button" className="rounded-lg border px-3 py-2 text-sm disabled:opacity-50" disabled={busy} onClick={() => void load()}>{dirty ? 'Abandonner le brouillon et relire' : 'Relire les réglages enregistrés'}</button>
    </div>
    <p role="status" aria-live="polite" className="text-sm">{busy ? 'Vérification en cours…' : message}</p>
    <p className="text-xs text-muted-foreground">Les liens externes saisis manuellement sont refusés. Importer une musique ne modifie pas les événements. Le retour aux défauts prépare un brouillon à enregistrer.</p>
  </section>;
}
