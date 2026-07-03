import React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Truck, Phone, MapPin, CheckCircle2, XCircle, Clock, Banknote, Eye } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { cn } from "@/lib/utils";

export default function LivreurPerformanceCard({ livreur, courses, onVoirDetails, onValiderPaiement, isPending, montantDuOverride }) {
  const today = new Date().toDateString();
  
  // Calculs pour aujourd'hui
  const coursesLivrees = courses.filter(c =>
    c.livreur_id === livreur.id &&
    c.statut === "livree" &&
    new Date(c.heure_livraison || c.updated_date).toDateString() === today
  );
  
  const coursesAnnulees = courses.filter(c =>
    c.livreur_id === livreur.id &&
    c.statut === "annulee" &&
    new Date(c.updated_date).toDateString() === today
  );
  
  const coursesEnCours = courses.filter(c =>
    c.livreur_id === livreur.id &&
    ["acceptee", "colis_recupere", "en_livraison"].includes(c.statut)
  );
  
  const totalEncaisse = coursesLivrees.reduce((sum, c) => sum + (c.prix_reel || 0), 0);
  // Utiliser le montant calculé sur la période sélectionnée (passé par le parent)
  // Fallback sur le montant du jour si non fourni
  const montantDu = montantDuOverride !== undefined ? montantDuOverride : totalEncaisse;
  const isPaye = livreur.statut_paiement === "paye";
  
  const nomComplet = `${livreur.prenom || ""} ${livreur.nom}`.trim();
  
  // Dernière position
  const lastPosition = livreur.latitude && livreur.longitude
    ? `${livreur.latitude.toFixed(4)}, ${livreur.longitude.toFixed(4)}`
    : "N/A";
  
  const lastActivity = livreur.derniere_position_date
    ? format(new Date(livreur.derniere_position_date), "HH:mm", { locale: fr })
    : "N/A";

  return (
    <Card className="p-4 space-y-3 border hover:shadow-md transition-shadow">
      {/* Header livreur */}
      <div className="flex items-start gap-3">
        {livreur.photo_url ? (
          <img src={livreur.photo_url} alt={nomComplet} className="w-12 h-12 rounded-full object-cover border-2 border-white shadow" />
        ) : (
          <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
            <Truck className="w-6 h-6 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1">
          <p className="font-semibold">{nomComplet}</p>
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span>{livreur.telephone}</span>
          </div>
        </div>
        <Badge variant="outline" className={cn(
          "text-[10px]",
          livreur.statut === "disponible" && "bg-green-100 text-green-700 border-green-200",
          livreur.statut === "en_course" && "bg-red-100 text-red-700 border-red-200",
          livreur.statut === "hors_ligne" && "bg-slate-100 text-slate-500 border-slate-200"
        )}>
          {livreur.statut === "disponible" ? "Disponible" : livreur.statut === "en_course" ? "En course" : "Hors ligne"}
        </Badge>
      </div>

      {/* Stats du jour */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="bg-green-50 rounded-lg p-2 border border-green-200">
          <div className="flex items-center gap-1 text-green-700 font-semibold">
            <CheckCircle2 className="w-3 h-3" />
            {coursesLivrees.length}
          </div>
          <p className="text-green-600 mt-0.5">Livrées</p>
        </div>
        <div className="bg-red-50 rounded-lg p-2 border border-red-200">
          <div className="flex items-center gap-1 text-red-700 font-semibold">
            <XCircle className="w-3 h-3" />
            {coursesAnnulees.length}
          </div>
          <p className="text-red-600 mt-0.5">Annulées</p>
        </div>
        <div className="bg-blue-50 rounded-lg p-2 border border-blue-200">
          <div className="flex items-center gap-1 text-blue-700 font-semibold">
            <Clock className="w-3 h-3" />
            {coursesEnCours.length}
          </div>
          <p className="text-blue-600 mt-0.5">En cours</p>
        </div>
        <div className="bg-amber-50 rounded-lg p-2 border border-amber-200">
          <div className="flex items-center gap-1 text-amber-700 font-semibold">
            <Banknote className="w-3 h-3" />
            {totalEncaisse > 0 ? `${totalEncaisse.toLocaleString()} FCFA` : "0 FCFA"}
          </div>
          <p className="text-amber-600 mt-0.5">Encaissé</p>
        </div>
      </div>

      {/* Montant dû et paiement */}
      <div className={cn(
        "rounded-lg p-3 border",
        isPaye ? "bg-green-50 border-green-200" : montantDu > 0 ? "bg-red-50 border-red-200" : "bg-gray-50 border-gray-200"
      )}>
        <div className="flex items-center justify-between text-xs mb-2">
          <span className="text-muted-foreground">Montant dû à SILGAPP</span>
          {isPaye ? (
            <Badge className="bg-green-500 text-white text-[10px]">✅ Payé</Badge>
          ) : montantDu > 0 ? (
            <Badge className="bg-red-500 text-white text-[10px]">⚠️ Non payé</Badge>
          ) : null}
        </div>
        <p className={cn("font-bold text-sm", isPaye ? "text-green-700" : montantDu > 0 ? "text-red-700" : "text-gray-500")}>
          {montantDu.toLocaleString()} FCFA
        </p>
        {isPaye && livreur.heure_paiement && (
          <p className="text-[10px] text-muted-foreground mt-1">
            Payé à {format(new Date(livreur.heure_paiement), "HH:mm", { locale: fr })} par {livreur.admin_paiement || "admin"}
          </p>
        )}
      </div>

      {/* Dernière position */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground bg-slate-50 rounded-lg p-2">
        <MapPin className="w-3 h-3" />
        <span>{lastPosition}</span>
        <Clock className="w-3 h-3 ml-auto" />
        <span>{lastActivity}</span>
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-8 text-xs gap-1"
          onClick={() => onVoirDetails(livreur)}
          disabled={isPending}
        >
          <Eye className="w-3.5 h-3.5" /> Voir détails
        </Button>
        {!isPaye && montantDu > 0 && (
          <Button
            size="sm"
            className="flex-1 h-8 text-xs gap-1 bg-green-600 hover:bg-green-700 text-white shadow-sm"
            onClick={() => onValiderPaiement(livreur, montantDu)}
            disabled={isPending}
          >
            <Banknote className="w-3.5 h-3.5" /> Valider payé
          </Button>
        )}
      </div>
    </Card>
  );
}