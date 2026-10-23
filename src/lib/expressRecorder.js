// Injectable browser adapter. Audio stays in memory, never uploaded here.
export function createExpressRecorder({ getUserMedia = (options) => navigator.mediaDevices.getUserMedia(options), Recorder = globalThis.MediaRecorder, onState, onAudio, onError }) {
  let generation = 0;
  let stream;
  let recorder;
  let chunks = [];
  let timer;
  let state = "idle";
  const setState = value => { state = value; onState(value); };
  const release = () => { clearTimeout(timer); stream?.getTracks().forEach(t => t.stop()); stream = null; };
  const cancel = () => {
    generation++;
    if (recorder?.state !== "inactive") recorder?.stop();
    recorder = null;
    chunks = [];
    release();
    setState("idle");
  };
  const stop = () => { if (state === "recording") { setState("stopping"); recorder.stop(); } };
  return {
    cancel, stop,
    async start() {
      if (state !== "idle") return;
      const token = ++generation;
      setState("requesting");
      try {
        if (!Recorder) throw new Error("Microphone non disponible.");
        const acquired = await getUserMedia({ audio: true });
        if (token !== generation) { acquired.getTracks().forEach(t => t.stop()); return; }
        stream = acquired;
        const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus']
          .find(type => Recorder.isTypeSupported?.(type));
        recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
        const activeRecorder = recorder;
        chunks = [];
        recorder.ondataavailable = e => { if (token === generation && e.data?.size) chunks.push(e.data); };
        recorder.onstop = () => {
          if (token !== generation) return;
          // Keep the format reported by the recorder/chunks, never relabel unknown bytes.
          const blob = new Blob(chunks, { type: activeRecorder.mimeType || chunks.find(chunk => chunk.type)?.type || "" });
          chunks = [];
          release();
          setState("idle");
          if (blob.size) onAudio(blob); else onError("Aucun son enregistré. Réessayez.");
        };
        recorder.onerror = () => { cancel(); onError("Erreur pendant l’enregistrement."); };
        recorder.start();
        setState("recording");
        timer = setTimeout(stop, 60000);
      } catch (error) {
        if (token !== generation) return;
        cancel();
        onError(error?.name === "NotAllowedError" ? "Microphone refusé. Autorisez le microphone dans les paramètres de l’application ou du navigateur, puis réessayez. Vous pouvez aussi saisir votre commande." : "Microphone non disponible. Vous pouvez saisir votre commande.");
      }
    },
  };
}
