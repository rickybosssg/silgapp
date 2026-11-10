import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';
import { eventMusicSettings } from '../../shared/eventMusicSettings.js';
import { uploadEventMusicMedia, createEventMusicUrlValidator, decodeEventMusicBase64 } from '../../shared/eventMusicMediaUpload.js';
import { isEventMusicAdmin } from '../../shared/eventMusicContract.js';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return Response.json({ success: false, error: 'METHOD' }, { status: 405 });
  let input;
  try {
    // Bound the encoded upload and JSON envelope before allocating decoded media.
    const reader = req.body?.getReader();
    if (!reader) throw Error();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let size = 0, raw = '';
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.length;
      if (size > 4 * 1024 * 1024 + 8192) {
        await reader.cancel();
        return Response.json({ success: false, error: 'REQUEST_TOO_LARGE' }, { status: 413 });
      }
      raw += decoder.decode(chunk.value, { stream: true });
    }
    raw += decoder.decode(); input = JSON.parse(raw);
  } catch { return Response.json({ success: false, error: 'REQUEST_INVALID' }, { status: 400 }); }
  if (!input || !['public', 'status', 'save', 'upload', 'abandon_upload'].includes(input.action)) return Response.json({ success: false, error: 'ACTION_INVALID' }, { status: 400 });
  try {
    const api = createClientFromRequest(req);
    let user = null;
    if (input.action !== 'public') {
      try { user = await api.auth.me(); }
      catch (error: any) {
        const status = Number(error?.response?.status ?? error?.status);
        if (status === 401 || status === 403) return Response.json({ success: false, error: 'AUTH_REQUIRED' }, { status });
        throw error;
      }
      if (!isEventMusicAdmin(user)) return Response.json({ success: false, error: 'FORBIDDEN' }, { status: 403 });
    }
    const origin = Deno.env?.get('EVENT_MUSIC_PUBLIC_ORIGIN') || '';
    const pathPrefix = Deno.env?.get('EVENT_MUSIC_PUBLIC_PATH_PREFIX') || '';
    const validateReturnedUrl = createEventMusicUrlValidator({ origin, pathPrefix });
    const uploadEnabled = Deno.env?.get('EVENT_MUSIC_UPLOAD_ENABLED') === 'true' && validateReturnedUrl(`${origin}${pathPrefix}validation.mp3`);
    const entity = api.asServiceRole.entities.EventMusicSettings;
    const result = input.action === 'upload' ? await uploadEventMusicMedia({ entity, user, input, uploadEnabled, validateReturnedUrl,
      bytes: uploadEnabled ? decodeEventMusicBase64(input.audio_base64) : new Uint8Array(),
      hashBytes: async (bytes: Uint8Array<ArrayBuffer>) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join(''),
      makeFile: (bytes: Uint8Array<ArrayBuffer>, name: string, mime: string) => new File([bytes], name, { type: mime }),
      uploadFile: (file: File) => api.asServiceRole.integrations.Core.UploadFile({ file }),
    }) : await eventMusicSettings({ entity, user, input, uploadEnabled, validateReturnedUrl });
    return Response.json(result);
  } catch (error: any) {
    return Response.json({ success: false, error: error?.eventMusicSafe === true ? error.code : 'CONFIG_UNAVAILABLE' },
      { status: error?.eventMusicSafe === true ? error.status : 503 });
  }
});
