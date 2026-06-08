import React from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tag, Users, TrendingUp, Gift, Copy } from "lucide-react";
import { toast } from "sonner";

export default function MonCodePromo({ clientProfil }) {
  const { data: monCode } = useQuery({
    queryKey: ["mon-code-promo", clientProfil?.id],
    queryFn: () => base44.entities.CodePromo.filter({ proprietaire_client_id: clientProfil.id }),
    enabled: !!clientProfil?.id,
    select: (data) => data?.[0] || null,
    initialData: [],
  });

  const { data: primes = [] } = useQuery({
    queryKey: ["mes-primes", monCode?.id],
    queryFn: () => base44.entities.PrimePromo.filter({ proprietaire_client_id: clientProfil.id }, "-created_date"),
    enabled: !!monCode?.id,
    initialData: [],
  });

  if (!monCode) return null;

  const primesValidees = primes.filter(p => p.statut === "validee");
  const totalGagne = primesValidees.reduce((s, p) => s + (p.prime_proprietaire || 100), 0);

  const copyCode = () => {
    navigator.clipboard.writeText(monCode.code).catch(() => {});
    toast.success("Code copié !");
  };

  return (
    <Card className="p-4 border-2 border-purple-200 bg-purple-50">
      <div className="flex items-center gap-2 mb-3">
        <Tag className="w-5 h-5 text-purple-600" />
        <h3 className="font-bold text-purple-900">Mon code promo</h3>
      </div>

      {/* Code */}
      <div className="bg-white border-2 border-purple-300 rounded-xl p-3 flex items-center justify-between mb-3">
        <span className="font-black text-2xl text-purple-700 font-mono tracking-widest">{monCode.code}</span>
        <button onClick={copyCode} className="p-2 rounded-lg bg-purple-100 hover:bg-purple-200 transition-colors">
          <Copy className="w-4 h-4 text-purple-600" />
        </button>
      </div>

      <p className="text-xs text-purple-700 mb-3">
        🎁 Partagez votre code ! Chaque ami qui s'inscrit et fait sa première course vous rapporte <strong>100 FCFA</strong>.
      </p>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-white rounded-lg p-2 text-center border border-purple-200">
          <p className="text-lg font-bold text-blue-700 flex items-center justify-center gap-1">
            <Users className="w-4 h-4" />{monCode.nb_inscrits || 0}
          </p>
          <p className="text-[10px] text-gray-500">Inscrits</p>
        </div>
        <div className="bg-white rounded-lg p-2 text-center border border-purple-200">
          <p className="text-lg font-bold text-green-700 flex items-center justify-center gap-1">
            <TrendingUp className="w-4 h-4" />{monCode.nb_premieres_courses || 0}
          </p>
          <p className="text-[10px] text-gray-500">1ères courses</p>
        </div>
        <div className="bg-white rounded-lg p-2 text-center border border-purple-200">
          <p className="text-lg font-bold text-purple-700 flex items-center justify-center gap-1">
            <Gift className="w-4 h-4" />{totalGagne}
          </p>
          <p className="text-[10px] text-gray-500">FCFA gagnés</p>
        </div>
      </div>

      {/* Historique primes */}
      {primes.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-purple-800">Historique des primes :</p>
          {primes.slice(0, 5).map(p => (
            <div key={p.id} className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-purple-100 text-xs">
              <span className="text-gray-700">👤 {p.client_nouveau_nom}</span>
              <Badge className={
                p.statut === "validee" ? "bg-green-100 text-green-700 border-green-200" :
                p.statut === "annulee" ? "bg-red-100 text-red-700" :
                "bg-yellow-100 text-yellow-700"
              }>
                {p.statut === "validee" ? `+${p.prime_proprietaire || 100} FCFA` :
                 p.statut === "annulee" ? "Annulée" : "En attente"}
              </Badge>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}