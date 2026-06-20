import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageCircle, Clock, CheckCircle2, XCircle, Loader2, AlertCircle, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

const STATUT_STYLES = {
  ouvert: "bg-amber-100 text-amber-700",
  en_cours: "bg-blue-100 text-blue-700",
  resolu: "bg-green-100 text-green-700",
  ferme: "bg-gray-100 text-gray-500",
};

const TYPES = {
  probleme_course: "📦 Problème course",
  reclamation: "😟 Réclamation",
  question: "❓ Question",
  suggestion: "💡 Suggestion",
  bug: "🔧 Bug",
  autre: "💬 Autre",
};

export default function SupportAdmin({ countryCode }) {
  const queryClient = useQueryClient();
  const [reponseMap, setReponseMap] = useState({});
  const [adminEmail, setAdminEmail] = useState(null);
  const [filter, setFilter] = useState("ouvert");

  React.useEffect(() => {
    base44.auth.me().then(u => setAdminEmail(u?.email)).catch(() => {});
  }, []);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["support-tickets-admin", countryCode, filter],
    queryFn: async () => {
      let t = await base44.entities.TicketSupport.filter(
        countryCode ? { country_code: countryCode } : {},
        "-created_date",
        100
      );
      if (filter !== "all") return t.filter(tk => tk.statut === filter);
      return t;
    },
    initialData: [],
    refetchInterval: 30000,
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TicketSupport.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["support-tickets-admin"] });
      setReponseMap({});
      toast.success("Ticket mis à jour");
    },
    onError: () => toast.error("Erreur"),
  });

  const ouvertCount = tickets.filter(t => t.statut === "ouvert").length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-5 h-5 text-primary" />
          <h2 className="font-black text-lg">Tickets support {ouvertCount > 0 && `(${ouvertCount} ouverts)`}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous</SelectItem>
              <SelectItem value="ouvert">Ouverts</SelectItem>
              <SelectItem value="en_cours">En cours</SelectItem>
              <SelectItem value="resolu">Résolus</SelectItem>
              <SelectItem value="ferme">Fermés</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : tickets.length === 0 ? (
        <p className="text-center text-gray-400 text-sm py-12">Aucun ticket</p>
      ) : (
        <div className="space-y-3">
          {tickets.map(ticket => (
            <Card key={ticket.id} className="border border-gray-100 shadow-sm">
              <CardContent className="p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-lg flex-shrink-0">
                    {TYPES[ticket.type_ticket]?.split(" ")[0] || "💬"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <Badge className={STATUT_STYLES[ticket.statut]} variant="outline">{ticket.statut}</Badge>
                      <span className="text-[10px] text-gray-400">
                        {ticket.created_date ? format(new Date(ticket.created_date), "dd/MM HH:mm", { locale: fr }) : ""}
                      </span>
                    </div>
                    <p className="font-bold text-gray-900">{ticket.sujet}</p>
                    <p className="text-xs text-gray-500 mt-0.5">De : {ticket.client_nom} · {ticket.client_telephone}</p>
                    <p className="text-xs text-gray-400">{ticket.country_code} · {ticket.client_email}</p>
                    <div className="mt-2 bg-gray-50 rounded-xl p-3 text-sm text-gray-700">
                      {ticket.message}
                    </div>
                  </div>
                </div>

                {ticket.reponse_admin ? (
                  <div className="bg-green-50 rounded-xl p-3 mb-2">
                    <p className="text-[10px] font-bold text-green-700 mb-1">Réponse envoyée</p>
                    <p className="text-sm text-green-800">{ticket.reponse_admin}</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Textarea
                      placeholder="Votre réponse au client..."
                      value={reponseMap[ticket.id] || ""}
                      onChange={e => setReponseMap(prev => ({ ...prev, [ticket.id]: e.target.value }))}
                      className="min-h-[80px] rounded-xl text-sm"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="rounded-xl gap-1.5 flex-1"
                        disabled={!reponseMap[ticket.id]?.trim() || updateMutation.isPending}
                        onClick={() => updateMutation.mutate({
                          id: ticket.id,
                          data: {
                            statut: "resolu",
                            reponse_admin: reponseMap[ticket.id]?.trim(),
                            traite_par: adminEmail,
                            traite_at: new Date().toISOString(),
                          }
                        })}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Répondre et résoudre
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="rounded-xl gap-1.5"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({
                          id: ticket.id,
                          data: { statut: "en_cours" }
                        })}
                      >
                        <RefreshCw className="w-3.5 h-3.5" /> En cours
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="rounded-xl text-gray-400"
                        disabled={updateMutation.isPending}
                        onClick={() => updateMutation.mutate({
                          id: ticket.id,
                          data: { statut: "ferme" }
                        })}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}