import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, Share2, Users, TrendingUp, Gift, CheckCircle, Clock, XCircle } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

export default function OngletCodePromoPartenaire({ partenaireId }) {
  const [onglet, setOnglet] = useState("stats");

  const { data: monCode } = useQuery({
    queryKey: ["mon-code-promo-partenaire", partenaireId],
    queryFn: () => base44.entities.CodePromo.filter({ proprietaire_partenaire_id: partenaireId }),
    enabled: !!partenaireId,
    select: (data) => data?.[0] || null,
    refetchInterval: 30000,
  });

  const { data: primes = [] } = useQuery({
    queryKey: ["mes-primes-partenaire", monCode?.id],
    queryFn: () => base44.entities.PrimePromo.filter({ code_promo_id: monCode.id }, "-created_date", 100),
    enabled: !!monCode?.id,
    refetchInterval: 30000,
  });

  const { data: tousLesCodes = [] } = useQuery({
    queryKey: ["classement-codes-promo"],
    queryFn: () => base44.entities.CodePromo.filter({ actif: true }, "-nb_premieres_courses", 20),
    enabled: onglet === "classement",
    refetchInterval: 60000,
  });

  if (!monCode) return null;

  const primesValidees = primes.filter(p => p.statut === "validee");
  const totalGagne = primesValidees.reduce((s, p) => s + (p.prime_proprietaire || 100), 0);
  const tauxConversion = monCode.nb_inscrits > 0
    ? Math.round((monCode.nb_premieres_courses / monCode.nb_inscrits) * 100)
    : 0;

  const copyCode = () => {
    navigator.clipboard.writeText(monCode.code).catch(() => {});
    toast.success("Code copié !");
  };

  const partagerWhatsApp = () => {
    const msg = encodeURIComponent(
      `Utilise mon code promo *${monCode.code}* sur SILGAPP et bénéficie de *100 FCFA de réduction* sur ta première course !\n\nTélécharge SILGAPP et inscris-toi maintenant.`
    );
    const a = document.createElement("a");
    a.href = `whatsapp://send?text=${msg}`;
    a.click();
    setTimeout(() => {
      if (document.hasFocus()) window.open(`https://wa.me/?text=${msg}`, "_blank");
    }, 500);
  };

  return (
    <div className="space-y-4 pb-6">
      <Card className="p-5 bg-gradient-to-br from-purple-600 to-pink-600 border-0 shadow-lg">
        <div className="flex items-center gap-2 mb-3">
          <Gift className="w-5 h-5 text-white" />
          <h2 className="font-bold text-white text-base">Mon Code Ambassadeur</h2>
          <Badge className="bg-white/20 text-white border-0 text-xs ml-auto">
            {monCode.actif ? "✅ Actif" : "❌ Inactif"}
          </Badge>
        </div>

        <div className="bg-white/15 backdrop-blur-sm border-2 border-white/30 rounded-xl p-4 flex items-center justify-between mb-4">
          <span className="font-black text-3xl text-white font-mono tracking-widest">{monCode.code}</span>
          <div className="flex gap-2">
            <button
              onClick={copyCode}
              className="p-2.5 rounded-xl bg-white/20 hover:bg-white/30 transition-colors"
              title="Copier"
            >
              <Copy className="w-5 h-5 text-white" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <Button
            onClick={copyCode}
            className="flex-1 bg-white/20 hover:bg-white/30 border border-white/30 text-white gap-2"
            variant="ghost"
          >
            <Copy className="w-4 h-4" />
            Copier
          </Button>
          <Button
            onClick={partagerWhatsApp}
            className="flex-1 bg-green-500/80 hover:bg-green-500 border-0 text-white gap-2"
            variant="ghost"
          >
            <Share2 className="w-4 h-4" />
            WhatsApp
          </Button>
        </div>

        <p className="text-white/80 text-xs text-center mt-3">
          Chaque ami qui fait sa 1ère course = <strong className="text-white">100 FCFA</strong> pour vous
        </p>
      </Card>

      <div className="flex bg-muted rounded-xl p-1 gap-1">
        {[
          { key: "stats", label: "📊 Stats" },
          { key: "historique", label: "📋 Historique" },
          { key: "classement", label: "🏆 Classement" },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setOnglet(tab.key)}
            className={`flex-1 py-2 px-2 rounded-lg text-xs font-semibold transition-all ${
              onglet === tab.key
                ? "bg-white shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {onglet === "stats" && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Card className="p-4 bg-blue-50 border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <Users className="w-4 h-4 text-blue-600" />
                <p className="text-xs text-blue-700 font-semibold">Inscrits</p>
              </div>
              <p className="text-3xl font-black text-blue-700">{monCode.nb_inscrits || 0}</p>
              <p className="text-xs text-blue-500 mt-1">amis recrutés</p>
            </Card>

            <Card className="p-4 bg-green-50 border-green-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-green-600" />
                <p className="text-xs text-green-700 font-semibold">1ères courses</p>
              </div>
              <p className="text-3xl font-black text-green-700">{monCode.nb_premieres_courses || 0}</p>
              <p className="text-xs text-green-500 mt-1">courses validées</p>
            </Card>

            <Card className="p-4 bg-purple-50 border-purple-200">
              <div className="flex items-center gap-2 mb-1">
                <Gift className="w-4 h-4 text-purple-600" />
                <p className="text-xs text-purple-700 font-semibold">Primes gagnées</p>
              </div>
              <p className="text-3xl font-black text-purple-700">{totalGagne.toLocaleString()}</p>
              <p className="text-xs text-purple-500 mt-1">FCFA au total</p>
            </Card>

            <Card className="p-4 bg-orange-50 border-orange-200">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-orange-600" />
                <p className="text-xs text-orange-700 font-semibold">Taux conversion</p>
              </div>
              <p className="text-3xl font-black text-orange-700">{tauxConversion}%</p>
              <p className="text-xs text-orange-500 mt-1">inscrits → courses</p>
            </Card>
          </div>

          {monCode.nb_inscrits > 0 && (
            <Card className="p-4">
              <div className="flex justify-between text-xs text-muted-foreground mb-2">
                <span>Taux de conversion</span>
                <span className="font-bold text-foreground">{tauxConversion}%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all"
                  style={{ width: `${Math.min(tauxConversion, 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1">
                {monCode.nb_premieres_courses} / {monCode.nb_inscrits} amis ont effectué leur première course
              </p>
            </Card>
          )}

          {monCode.nb_inscrits === 0 && (
            <Card className="p-5 text-center bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
              <div className="text-4xl mb-2">🚀</div>
              <p className="font-bold text-purple-900 mb-1">Partagez votre code !</p>
              <p className="text-sm text-purple-700">
                Invitez vos amis à s'inscrire sur SILGAPP avec votre code <strong>{monCode.code}</strong> et gagnez 100 FCFA à chaque première course !
              </p>
            </Card>
          )}
        </div>
      )}

      {onglet === "historique" && (
        <div className="space-y-2">
          {primes.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="text-4xl mb-3">📋</div>
              <p className="font-semibold text-muted-foreground">Aucune prime enregistrée</p>
              <p className="text-xs text-muted-foreground mt-1">Les primes apparaîtront ici après les premières courses de vos filleuls.</p>
            </Card>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 mb-3">
                <div className="bg-green-50 rounded-xl p-3 text-center border border-green-200">
                  <p className="text-lg font-bold text-green-700">{primes.filter(p => p.statut === "validee").length}</p>
                  <p className="text-[10px] text-green-600">Validées</p>
                </div>
                <div className="bg-yellow-50 rounded-xl p-3 text-center border border-yellow-200">
                  <p className="text-lg font-bold text-yellow-700">{primes.filter(p => p.statut === "en_attente").length}</p>
                  <p className="text-[10px] text-yellow-600">En attente</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center border border-red-200">
                  <p className="text-lg font-bold text-red-700">{primes.filter(p => p.statut === "annulee").length}</p>
                  <p className="text-[10px] text-red-600">Annulées</p>
                </div>
              </div>

              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {primes.map(p => (
                  <Card key={p.id} className="p-3 border">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center text-sm flex-shrink-0">
                            👤
                          </div>
                          <p className="font-semibold text-sm truncate">{p.client_nouveau_nom || "Client"}</p>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          {p.prix_course && (
                            <span>💰 Course : {p.prix_course.toLocaleString()} FCFA</span>
                          )}
                          {p.validee_at && (
                            <span>📅 {format(new Date(p.validee_at), "dd MMM yyyy", { locale: fr })}</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 flex-shrink-0">
                        {p.statut === "validee" && (
                          <Badge className="bg-green-100 text-green-700 border-green-200 text-xs flex items-center gap-1">
                            <CheckCircle className="w-3 h-3" />
                            +{p.prime_proprietaire || 100} F
                          </Badge>
                        )}
                        {p.statut === "en_attente" && (
                          <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200 text-xs flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            En attente
                          </Badge>
                        )}
                        {p.statut === "annulee" && (
                          <Badge className="bg-red-100 text-red-700 border-red-200 text-xs flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            Annulée
                          </Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {onglet === "classement" && (
        <div className="space-y-3">
          <div className="text-center mb-2">
            <p className="font-bold text-foreground">🏆 Top Ambassadeurs SILGAPP</p>
            <p className="text-xs text-muted-foreground">Classés par nombre de premières courses validées</p>
          </div>

          {tousLesCodes.length === 0 ? (
            <Card className="p-8 text-center">
              <p className="text-muted-foreground text-sm">Chargement du classement...</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {tousLesCodes.map((c, index) => {
                const isMe = c.id === monCode.id;
                const rang = index + 1;
                return (
                  <Card
                    key={c.id}
                    className={`p-3 border-2 transition-all ${
                      isMe
                        ? "border-purple-400 bg-gradient-to-r from-purple-50 to-pink-50 shadow-md"
                        : rang <= 3 ? "border-yellow-200 bg-yellow-50/50" : "border-border"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 font-black text-sm ${
                        rang === 1 ? "bg-yellow-400 text-yellow-900" :
                        rang === 2 ? "bg-gray-300 text-gray-700" :
                        rang === 3 ? "bg-amber-600 text-white" :
                        "bg-muted text-muted-foreground"
                      }`}>
                        {rang === 1 ? "🥇" : rang === 2 ? "🥈" : rang === 3 ? "🥉" : rang}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-sm truncate">{c.proprietaire_nom}</p>
                          {c.proprietaire_type === "livreur" && (
                            <Badge className="bg-blue-100 text-blue-700 text-[10px] border-0">🏍️ Livreur</Badge>
                          )}
                          {c.proprietaire_type === "partenaire" && (
                            <Badge className="bg-purple-100 text-purple-700 text-[10px] border-0">🏪 Partenaire</Badge>
                          )}
                          {isMe && <Badge className="bg-purple-600 text-white text-[10px] border-0">Vous</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground font-mono">{c.code}</p>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <p className="font-black text-sm text-foreground">{c.nb_premieres_courses || 0}</p>
                        <p className="text-[10px] text-muted-foreground">courses</p>
                        <p className="text-[10px] text-purple-600 font-semibold">{(c.total_primes_generees || 0).toLocaleString()} F</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
