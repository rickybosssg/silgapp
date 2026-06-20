import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Send, Loader2, Clock, CheckCircle2, XCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const TYPES = [
  { value: "probleme_course", label: "Problème de course", icon: "📦" },
  { value: "reclamation", label: "Réclamation", icon: "😟" },
  { value: "question", label: "Question", icon: "❓" },
  { value: "suggestion", label: "Suggestion", icon: "💡" },
  { value: "bug", label: "Bug technique", icon: "🔧" },
  { value: "autre", label: "Autre", icon: "💬" },
];

const STATUT_STYLES = {
  ouvert: "bg-amber-100 text-amber-700",
  en_cours: "bg-blue-100 text-blue-700",
  resolu: "bg-green-100 text-green-700",
  ferme: "bg-gray-100 text-gray-500",
};

const STATUT_ICONS = {
  ouvert: <Clock className="w-3.5 h-3.5" />,
  en_cours: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
  resolu: <CheckCircle2 className="w-3.5 h-3.5" />,
  ferme: <XCircle className="w-3.5 h-3.5" />,
};

export default function SupportClient() {
  const queryClient = useQueryClient();
  const [userEmail, setUserEmail] = useState(null);
  const [clientProfil, setClientProfil] = useState(null);
  const [sujet, setSujet] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState("question");

  useEffect(() => {
    base44.auth.me().then(u => {
      setUserEmail(u?.email);
      if (u?.email) {
        base44.entities.ClientExterne.filter({ user_email: u.email }).then(c => {
          if (c?.length) setClientProfil(c[0]);
        }).catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets", clientProfil?.id],
    queryFn: () => clientProfil?.id
      ? base44.entities.TicketSupport.filter({ client_id: clientProfil.id }, "-created_date", 50)
      : [],
    enabled: !!clientProfil?.id,
    initialData: [],
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TicketSupport.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets"] });
      setSujet(""); setMessage(""); setType("question");
      toast.success("Ticket créé ! Nous vous répondrons rapidement.");
    },
    onError: () => toast.error("Erreur lors de la création du ticket"),
  });

  const handleCreate = () => {
    if (!sujet.trim() || !message.trim()) return;
    createMutation.mutate({
      sujet: sujet.trim(),
      message: message.trim(),
      type_ticket: type,
      client_id: clientProfil?.id,
      client_nom: clientProfil?.nom || "",
      client_telephone: clientProfil?.telephone || "",
      client_email: userEmail || "",
      country_code: clientProfil?.country_code || "BF",
    });
  };

  return (
    <div className="max-w-lg mx-auto p-4 space-y-6">
      <h1 className="text-xl font-black text-gray-900">🎫 Support SILGAPP</h1>

      {/* Formulaire nouveau ticket */}
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <MessageCircle className="w-4 h-4 text-primary" />
            Nouveau ticket
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="h-10 rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map(t => (
                <SelectItem key={t.value} value={t.value}>{t.icon} {t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            placeholder="Sujet du ticket"
            value={sujet}
            onChange={e => setSujet(e.target.value)}
            className="h-10 rounded-xl"
          />
          <Textarea
            placeholder="Décrivez votre problème en détail..."
            value={message}
            onChange={e => setMessage(e.target.value)}
            className="min-h-[100px] rounded-xl"
          />
          <Button
            onClick={handleCreate}
            disabled={createMutation.isPending || !sujet.trim() || !message.trim()}
            className="w-full rounded-xl gap-2"
          >
            {createMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Envoyer le ticket
          </Button>
        </CardContent>
      </Card>

      {/* Historique des tickets */}
      <div className="space-y-3">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-500" />
          Mes tickets ({tickets.length})
        </h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">Aucun ticket pour le moment</p>
        ) : (
          tickets.map(ticket => (
            <Card key={ticket.id} className="border border-gray-100 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className={STATUT_STYLES[ticket.statut]} variant="outline">
                        <span className="flex items-center gap-1">
                          {STATUT_ICONS[ticket.statut]}
                          {ticket.statut.replace("_", " ")}
                        </span>
                      </Badge>
                      <span className="text-[10px] text-gray-400">
                        {ticket.created_date ? format(new Date(ticket.created_date), "dd/MM HH:mm", { locale: fr }) : ""}
                      </span>
                    </div>
                    <p className="font-bold text-gray-900 text-sm">{ticket.sujet}</p>
                    <p className="text-xs text-gray-500 mt-1 line-clamp-2">{ticket.message}</p>
                  </div>
                </div>
                {ticket.reponse_admin && (
                  <div className="mt-3 pt-3 border-t border-gray-100">
                    <p className="text-[10px] font-bold text-primary uppercase mb-1">Réponse SILGAPP</p>
                    <p className="text-xs text-gray-700 bg-green-50 rounded-xl p-3">{ticket.reponse_admin}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}