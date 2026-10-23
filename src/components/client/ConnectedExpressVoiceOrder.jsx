import { base44 } from '@/api/base44Client';
import ExpressVoiceOrder from './ExpressVoiceOrder';

export default function ConnectedExpressVoiceOrder({ onCreated, clientProfil, onCompleteProfile, onOpenChange, api = base44 }) {
  // Written express is independent of audio capabilities, providers and polling.
  return <ExpressVoiceOrder api={api} clientProfil={clientProfil} onCompleteProfile={onCompleteProfile} onOpenChange={onOpenChange} onCreated={onCreated} textOnly audioDisabled />;
}
