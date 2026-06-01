import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, Users, Eye, Lock, Unlock, Phone, Mail, Calendar, Activity, Truck } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";

function formaterTel(tel) {
  if (!tel) return "-";
  const digits = tel.replace(/\D/g, "").slice(-8);
  if (digits.length !== 8) return tel;
  return digits.slice(0, 2) + " " + digits.slice(2, 4) + " " + digits.slice(4, 6) + " " + digits.slice(6, 8);
}

function ClientDetailModal({ client, courses, migrationEnCours, onClose, onBloquer, onMigrer }) {
  const coursesDuClient = courses.filter(c => {
    const tel = (c.client_telephone || "").replace(/\D/g, "").slice(-8);
    const clientTel = (client.telephone || "").replace(/\D/g, "").slice(-8);
    return tel === clientTel || c.expediteur_client_id === client.id || c.destinataire_client_id === client.id;
  });
  const livrees = coursesDuClient.filter(c => c.statut === "livree").length;
  const annulees = coursesDuClient.filter(c => c.statut === "annulee").length;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold">{client.nom}</h2>
            <p className="text-sm text-muted-foreground">{formaterTel(client.telephone)}</p>
          </div>
          <Badge variant={client.actif === false ? "destructive" : "default"}>
            {client.actif === false ? "Bloqué" : "Actif"}
          </Badge>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="bg-gray-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-gray-900">{coursesDuClient.length}</p>
            <p className="text-xs text-gray-500">Créées</p>
          </div>
          <div className="bg-green-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-green-700">{livrees}</p>
            <p className="text-xs text-gray-500">Livrées</p>
          </div>
          <div className="bg-red-50 rounded-xl p-3">
            <p className="text-2xl font-bold text-red-600">{annulees}</p>
            <p className="text-xs text-gray-500">Annulées</p>
          </div>
        </div>

        <div className="space-y-2 text-sm">
          {client.email && <p className="flex items-center gap-2 text-gray-600"><Mail className="w-4 h-4" />{client.email}</p>}
          {client.quartier && <p className="flex items-center gap-2 text-gray-600">📍 {client.quartier}</p>}
          <p className="flex items-center gap-2 text-gray-600">
            <Calendar className="w-4 h-4" />
            Inscrit le {format(new Date(client.created_date), "dd MMMM yyyy", { locale: fr })}
          </p>
          <p className="flex items-center gap-2 text-gray-600">
            📍 GPS : <span className={client.latitude ? "text-green-600 font-semibold" : "text-red-500"}>{client.latitude ? "Activé" : "Non activé"}</span>
          </p>
        </div>

        {coursesDuClient.length > 0 && (
          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Dernières courses</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {coursesDuClient.slice(0, 10).map(c => (
                <div key={c.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-xl text-xs">
                  <div>
                    <p className="font-medium">{c.adresse_depart} → {c.adresse_arrivee || "?"}</p>
                    <p className="text-gray-400">{format(new Date(c.created_date), "dd/MM HH:mm")}</p>
                  </div>
                  <Badge variant={c.statut === "livree" ? "default" : c.statut === "annulee" ? "destructive" : "secondary"} className="text-xs">
                    {c.statut}
                  </Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-2 pt-2">
          {!client.deja_livreur && (
            <Button
              variant="default"
              disabled={migrationEnCours === client.id}
              className="w-full bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600"
              onClick={() => { onMigrer(client); }}
            >
              {migrationEnCours === client.id ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                  Migration en cours...
                </>
              ) : (
                <>
                  <Truck className="w-4 h-4 mr-2" />
                  🚚 Migrer vers Livreur Externe
                </>
              )}
            </Button>
          )}
          <div className="flex gap-2">
            <Button
              variant={client.actif === false ? "default" : "destructive"}
              className="flex-1"
              onClick={() => { onBloquer(client); onClose(); }}
            >
              {client.actif === false ? <><Unlock className="w-4 h-4 mr-1" />Débloquer</> : <><Lock className="w-4 h-4 mr-1" />Bloquer</>}
            </Button>
            <Button variant="outline" onClick={onClose} className="flex-1">Fermer</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ClientsExternesPanel() {
  const [recherche, setRecherche] = useState("");
  const [clientDetail, setClientDetail] = useState(null);
  const [migrationEnCours, setMigrationEnCours] = useState(null);

  const { data: clients = [], refetch } = useQuery({
    queryKey: ["clients-externes-panel"],
    queryFn: () => base44.entities.ClientExterne.list("-created_date", 200),
    initialData: [],
    refetchInterval: 30000,
  });

  const { data: courses = [] } = useQuery({
    queryKey: ["courses-externes-all"],
    queryFn: () => base44.entities.CourseExterne.list("-created_date", 500),
    initialData: [],
  });

  const clientsFiltres = useMemo(() => {
    if (!recherche) return clients;
    const q = recherche.toLowerCase().replace(/\s/g, "");
    return clients.filter(c => {
      const tel = (c.telephone || "").replace(/\D/g, "");
      return (
        (c.nom || "").toLowerCase().includes(recherche.toLowerCase()) ||
        tel.includes(q) ||
        (c.email || "").toLowerCase().includes(recherche.toLowerCase())
      );
    });
  }, [clients, recherche]);

  const handleBloquer = async (client) => {
    await base44.entities.ClientExterne.update(client.id, { actif: client.actif === false ? true : false });
    refetch();
  };

  const handleMigrer = async (client) => {
    if (!client.user_email) {
      toast.error("Client sans email - migration impossible");
      return;
    }
    
    setMigrationEnCours(client.id);
    try {
      const result = await base44.functions.invoke("migrerClientVersLivreur", { client_id: client.id });
      
      if (result.error) {
        if (result.error === "Déjà livreur") {
          toast.info(result.message);
        } else {
          toast.error(result.error);
        }
      } else {
        toast.success(`✅ ${result.livreur.prenom} ${result.livreur.nom} est maintenant livreur externe !`);
        refetch();
      }
    } catch (err) {
      console.error("Erreur migration:", err);
      toast.error("Erreur lors de la migration");
    } finally {
      setMigrationEnCours(null);
    }
  };

  const getCourseStats = (client) => {
    const tel = (client.telephone || "").replace(/\D/g, "").slice(-8);
    const c = courses.filter(cs => {
      const ctel = (cs.client_telephone || "").replace(/\D/g, "").slice(-8);
      return ctel === tel || cs.expediteur_client_id === client.id || cs.destinataire_client_id === client.id;
    });
    return {
      total: c.length,
      livrees: c.filter(cs => cs.statut === "livree").length,
      annulees: c.filter(cs => cs.statut === "annulee").length,
      lastActivity: c.length > 0 ? c[0].created_date : null,
    };
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-pink-500" />
          <h2 className="text-lg font-bold text-foreground">Clients inscrits</h2>
          <Badge variant="secondary">{clients.length}</Badge>
        </div>
      </div>

      {/* Recherche */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          value={recherche}
          onChange={e => setRecherche(e.target.value)}
          placeholder="Rechercher par nom, téléphone ou email..."
          className="pl-9"
        />
      </div>

      {/* Stats rapides */}
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 bg-pink-500 text-white text-center">
          <p className="text-2xl font-bold">{clients.length}</p>
          <p className="text-xs opacity-80">Total</p>
        </Card>
        <Card className="p-3 bg-green-500 text-white text-center">
          <p className="text-2xl font-bold">{clients.filter(c => c.actif !== false).length}</p>
          <p className="text-xs opacity-80">Actifs</p>
        </Card>
        <Card className="p-3 bg-red-500 text-white text-center">
          <p className="text-2xl font-bold">{clients.filter(c => c.actif === false).length}</p>
          <p className="text-xs opacity-80">Bloqués</p>
        </Card>
      </div>

      {/* Liste clients */}
      <div className="space-y-2 max-h-[500px] overflow-y-auto">
        {clientsFiltres.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Users className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p className="text-sm">{recherche ? "Aucun client trouvé" : "Aucun client inscrit"}</p>
          </div>
        ) : (
          clientsFiltres.map(client => {
            const stats = getCourseStats(client);
            return (
              <Card key={client.id} className="p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="font-semibold text-sm text-foreground truncate">{client.nom}</p>
                      <Badge variant={client.actif === false ? "destructive" : "outline"} className="text-xs flex-shrink-0">
                        {client.actif === false ? "Bloqué" : "Actif"}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        +226 {formaterTel(client.telephone)}
                      </span>
                      {client.email && (
                        <span className="flex items-center gap-1 truncate">
                          <Mail className="w-3 h-3" />{client.email}
                        </span>
                      )}
                    </div>
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-gray-500">{stats.total} courses</span>
                      <span className="text-green-600">{stats.livrees} livrées</span>
                      {stats.annulees > 0 && <span className="text-red-500">{stats.annulees} annulées</span>}
                      <span className={`flex items-center gap-0.5 ${client.latitude ? "text-green-500" : "text-gray-400"}`}>
                        📍 {client.latitude ? "GPS ok" : "Sans GPS"}
                      </span>
                    </div>
                    {stats.lastActivity && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        <Activity className="w-2.5 h-2.5 inline mr-1" />
                        Dernière activité: {format(new Date(stats.lastActivity), "dd/MM/yyyy HH:mm")}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400">
                      <Calendar className="w-2.5 h-2.5 inline mr-1" />
                      Inscrit: {format(new Date(client.created_date), "dd/MM/yyyy", { locale: fr })}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1 ml-3 flex-shrink-0">
                    <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => setClientDetail(client)}>
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button
                      size="sm"
                      variant={client.actif === false ? "default" : "destructive"}
                      className="h-8 px-2"
                      onClick={() => handleBloquer(client)}
                    >
                      {client.actif === false ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })
        )}
      </div>

      {clientDetail && (
        <ClientDetailModal
          client={clientDetail}
          courses={courses}
          migrationEnCours={migrationEnCours}
          onClose={() => setClientDetail(null)}
          onBloquer={handleBloquer}
          onMigrer={handleMigrer}
        />
      )}
    </div>
  );
}