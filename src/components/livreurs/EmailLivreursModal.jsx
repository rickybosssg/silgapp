import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import { Send, Loader2 } from "lucide-react";

export default function EmailLivreursModal({ onClose, countryCode }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!subject.trim() || !message.trim()) {
      toast.error("Veuillez remplir le sujet et le message");
      return;
    }
    setSending(true);
    try {
      const res = await base44.functions.invoke("envoyerEmailLivreurs", {
        subject: subject.trim(),
        message: message.trim(),
        country_code: countryCode || undefined,
      });
      const data = res.data;
      if (data?.success) {
        toast.success(`${data.sent} e-mail(s) envoyé(s)${data.failed ? `, ${data.failed} échec(s)` : ""}`);
        onClose();
      } else {
        toast.error(data?.error || "Échec de l'envoi");
      }
    } catch (e) {
      toast.error("Erreur : " + e.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="w-4 h-4 text-blue-600" />
            E-mail à tous les livreurs
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Enverra un e-mail à tous les livreurs validés{countryCode ? ` (${countryCode})` : " (tous pays)"}.
          </p>
          <div>
            <label className="text-xs font-semibold text-gray-600">Sujet</label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Sujet de l'e-mail"
              className="mt-1"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-600">Message</label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Votre message..."
              rows={6}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={sending}>
              Annuler
            </Button>
            <Button
              className="flex-1 bg-blue-600 hover:bg-blue-700"
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
              {sending ? "Envoi..." : "Envoyer"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}