import AudioTranscriptionSettings from '@/components/admin/AudioTranscriptionSettings';

export default function CommandeExpressAdmin() {
  // The shared panel returns controls only after the server's Super Admin check.
  return <div className="mx-auto max-w-3xl p-4 sm:p-6"><AudioTranscriptionSettings /></div>;
}
