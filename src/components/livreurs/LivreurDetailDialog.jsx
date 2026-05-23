import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Truck, Phone, MapPin, Calendar, Clock, CheckCircle2, XCircle, Banknote } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

export default function LivreurDetailDialog({ livreur, open, onClose }) {
  const { data: courses = [] } = useQuery({
    queryKey: ["courses-all"],
    queryFn: () => base44.entities.Course.list("-created_date", 1000),
    initialData: [],
  });

  const today = new Date().toDateString();
  
  const stats = useMemo(() => {
    const livreurCourses = courses.filter(c => c.livreur_id === livreur.id);
    const todayCourses = livreurCourses.filter(c => 
      new Date(c.created_date).toDateString() === today
    );

    const livrees = todayCourses.filter(c => c.statut === "livree");
    const annulees = todayCourses.filter(c => c.statut === "annulee");
    const enCours = todayCourses.filter(c => ["acceptee", "colis_recupere", "en_livraison"].includes(c.statut));
    const refusees = livreurCourses.filter(c => c.statut === "nouvelle" && !c.livreur_id);

    const totalEncaisse = livrees.reduce((sum, c) => sum + (c.prix_reel || 0), 0);
    const montantDu = totalEncaisse;

    return {
      coursesLivrees: livrees.length,
      totalEncaisse,
      montantDu,
      coursesAnnulees: annulees.length,
      coursesEnCours: enCours.length,
      coursesRefusees: refusees.length,
    };
  }, [courses, livreur.id, today]);

  const lastPos = livreur.latitude && livreur.longitude 
    ? `${livreur.latitude.toFixed(4)}, ${livreur.longitude.toFixed(4)}`
    : "N/A";
  const lastActivity = livreur.derniere_position_date 
    ? format(new Date(livreur.derniere_position_date), "dd/MM/yyyy HH:mm", { locale: fr })
    : "Jamais";

  const recentCourses = useMemo(() => {
    return courses
      .filter(c => c.livreur_id === livreur.id)
      .sort((a, b) => new Date(b.created_date) - new Date(a.created_date))
      .slice(0, 20);
  }, [courses, livreur.id]);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-3">
            {livreur.photo_url ? (
              <img src={livreur.photo_url} alt={livreur.nom} className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                <Truck className="w-6 h-6 text-muted-foreground" />
              </div>
            )}
            {livreur.prenom} {livreur.nom}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Info livreur */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Informations</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-muted-foreground" />
                <span>{livreur.telephone}</span>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span>{livreur.quartier || "N/A"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span>{livreur.vehicule || "moto"}</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant={livreur.statut === "disponible" ? "default" : livreur.statut === "en_course" ? "destructive" : "secondary"}>
                  {livreur.statut === "disponible" ? "Disponible" : livreur.statut === "en_course" ? "En course" : "Hors ligne"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Stats du jour */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                Récapitulatif du jour
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <StatItem label="Courses livrées" value={stats.coursesLivrees} icon={CheckCircle2} color="text-green-600" />
              <StatItem label="Total encaissé" value={`${stats.totalEncaisse.toLocaleString()} F`} icon={Banknote} color="text-blue-600" />
              <StatItem label="Dû à Silga" value={`${stats.montantDu.toLocaleString()} F`} color="text-blue-600" />
              <StatItem 
                label="Paiement" 
                value={livreur.statut_paiement === "paye" ? "Payé ✅" : "Non payé"} 
                color={livreur.statut_paiement === "paye" ? "text-green-600" : "text-amber-600"}
              />
              <StatItem label="Annulées" value={stats.coursesAnnulees} icon={XCircle} color="text-red-600" />
              <StatItem label="En cours" value={stats.coursesEnCours} icon={Clock} color="text-amber-600" />
              <StatItem label="Refusées" value={stats.coursesRefusees} />
              <div className="text-sm">
                <div className="text-muted-foreground text-xs">Dernière position</div>
                <div className="font-semibold text-xs truncate">{lastPos}</div>
              </div>
              <div className="text-sm">
                <div className="text-muted-foreground text-xs">Dernière activité</div>
                <div className="font-semibold text-xs">{lastActivity}</div>
              </div>
            </CardContent>
          </Card>

          {/* Historique courses */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-semibold">Historique des courses</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {recentCourses.map(course => (
                  <div key={course.id} className="p-3 border rounded-lg text-sm">
                    <div className="flex items-center justify-between mb-2">
                      <Badge variant={course.statut === "livree" ? "default" : course.statut === "annulee" ? "destructive" : "secondary"}>
                        {course.statut === "livree" ? "Livrée" : course.statut === "annulee" ? "Annulée" : course.statut}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {format(new Date(course.created_date), "dd/MM HH:mm", { locale: fr })}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-muted-foreground">Départ:</span>
                        <span className="ml-1 font-medium">{course.adresse_depart || "N/A"}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Arrivée:</span>
                        <span className="ml-1 font-medium">{course.adresse_arrivee || "N/A"}</span>
                      </div>
                    </div>
                    {course.prix_reel && (
                      <div className="mt-2 text-right font-bold text-blue-600">
                        {course.prix_reel.toLocaleString()} FCFA
                      </div>
                    )}
                  </div>
                ))}
                {recentCourses.length === 0 && (
                  <p className="text-center text-muted-foreground text-sm py-8">Aucune course</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function StatItem({ label, value, icon: Icon, color = "text-foreground" }) {
  return (
    <div className="text-center p-2 bg-muted/50 rounded-lg">
      <div className={`text-lg font-bold ${color} flex items-center justify-center gap-1`}>
        {Icon && <Icon className="w-4 h-4" />}
        {value}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}