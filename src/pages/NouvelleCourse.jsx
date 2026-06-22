import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  User, MapPin, Package, FileText, ArrowLeft, Send
} from "lucide-react";
import { toast } from "sonner";

const defaultForm = {
  client_nom: "",
  client_telephone: "",
  adresse_depart: "",
  adresse_arrivee: "",
  gps_depart_lat: "",
  gps_depart_lng: "",
  gps_arrivee_lat: "",
  gps_arrivee_lng: "",
  type_colis: "petit_colis",
  prix: "",
  urgence: "normale",
  notes: "",
  statut: "nouvelle",
  dispatch_mode: "manuel",
  dispatch_status: "en_attente_admin",
};

const typeColis = [
  { value: "petit_colis", label: "Petit colis" },
  { value: "moyen_colis", label: "Moyen colis" },
  { value: "gros_colis", label: "Gros colis" },
  { value: "document", label: "Document" },
  { value: "nourriture", label: "Nourriture" },
  { value: "autre", label: "Autre" },
];

function parseGPSLink(text) {
  // Try to extract lat/lng from Google Maps or similar links
  const patterns = [
    /[-+]?\d{1,2}\.\d+,\s*[-+]?\d{1,3}\.\d+/,
    /@(-?\d+\.\d+),(-?\d+\.\d+)/,
    /q=(-?\d+\.\d+),(-?\d+\.\d+)/,
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      if (match[1] && match[2]) return { lat: parseFloat(match[1]), lng: parseFloat(match[2]) };
      const parts = match[0].split(",").map(s => parseFloat(s.trim()));
      if (parts.length === 2) return { lat: parts[0], lng: parts[1] };
    }
  }
  return null;
}

export default function NouvelleCourse() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(defaultForm);
  const [gpsLinkDepart, setGpsLinkDepart] = useState("");
  const [gpsLinkArrivee, setGpsLinkArrivee] = useState("");

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.Course.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["courses"] });
      toast.success("Course créée avec succès !");
      navigate("/");
    },
    onError: (err) => {
      toast.error("Erreur : " + (err?.message || "Impossible de créer la course"));
    },
  });

  const handleChange = (field, value) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleGPSDepart = (link) => {
    setGpsLinkDepart(link);
    const coords = parseGPSLink(link);
    if (coords) {
      setForm(prev => ({ ...prev, gps_depart_lat: coords.lat, gps_depart_lng: coords.lng }));
    }
  };

  const handleGPSArrivee = (link) => {
    setGpsLinkArrivee(link);
    const coords = parseGPSLink(link);
    if (coords) {
      setForm(prev => ({ ...prev, gps_arrivee_lat: coords.lat, gps_arrivee_lng: coords.lng }));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.client_telephone) return toast.error("Le téléphone est obligatoire");
    const data = {
      ...form,
      prix: form.prix ? parseFloat(form.prix) : undefined,
      gps_depart_lat: form.gps_depart_lat ? parseFloat(form.gps_depart_lat) : undefined,
      gps_depart_lng: form.gps_depart_lng ? parseFloat(form.gps_depart_lng) : undefined,
      gps_arrivee_lat: form.gps_arrivee_lat ? parseFloat(form.gps_arrivee_lat) : undefined,
      gps_arrivee_lng: form.gps_arrivee_lng ? parseFloat(form.gps_arrivee_lng) : undefined,
    };
    // Remove empty strings
    Object.keys(data).forEach(k => {
      if (data[k] === "" || data[k] === undefined) delete data[k];
    });
    createMutation.mutate(data);
  };

  return (
    <div className="p-6 max-w-2xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Nouvelle course</h1>
          <p className="text-xs text-muted-foreground">Créer une course depuis une demande WhatsApp</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        {/* Client */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <User className="w-4 h-4 text-primary" /> Client
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Nom du client</Label>
              <Input
                placeholder="Ex: Amadou Diallo"
                value={form.client_nom}
                onChange={(e) => handleChange("client_nom", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Téléphone *</Label>
              <Input
                placeholder="+226 70 12 34 56"
                value={form.client_telephone}
                onChange={(e) => {
                  const raw = e.target.value.replace(/[^\d+]/g, "");
                  let formatted = raw;
                  if (raw.startsWith("+226")) {
                    const local = raw.slice(4).replace(/(\d{2})(?=\d)/g, "$1 ").trim();
                    formatted = "+226 " + local;
                  } else {
                    formatted = raw.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
                  }
                  handleChange("client_telephone", formatted);
                }}
                required
                type="tel"
              />
            </div>
          </CardContent>
        </Card>

        {/* Adresses */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" /> Trajet
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Adresse de départ (quartier)</Label>
              <Input
                placeholder="Ex: Ouaga 2000"
                value={form.adresse_depart}
                onChange={(e) => handleChange("adresse_depart", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Adresse d'arrivée (quartier)</Label>
              <Input
                placeholder="Ex: Pissy"
                value={form.adresse_arrivee}
                onChange={(e) => handleChange("adresse_arrivee", e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        {/* Détails */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" /> Détails
            </CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Type de colis</Label>
              <Select value={form.type_colis} onValueChange={(v) => handleChange("type_colis", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {typeColis.map(t => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Prix (FCFA)</Label>
              <Input
                type="number"
                placeholder="Ex: 1500"
                value={form.prix}
                onChange={(e) => handleChange("prix", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Urgence</Label>
              <Select value={form.urgence} onValueChange={(v) => handleChange("urgence", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="normale">Normale</SelectItem>
                  <SelectItem value="urgente">Urgente</SelectItem>
                  <SelectItem value="tres_urgente">Très urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Notes */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <FileText className="w-4 h-4 text-primary" /> Notes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              placeholder="Notes supplémentaires (instructions spéciales, etc.)"
              value={form.notes}
              onChange={(e) => handleChange("notes", e.target.value)}
              rows={3}
            />
          </CardContent>
        </Card>

        <Button
          type="submit"
          className="w-full gap-2 bg-primary h-11"
          disabled={createMutation.isPending}
        >
          <Send className="w-4 h-4" />
          {createMutation.isPending ? "Création en cours..." : "Créer la course"}
        </Button>
      </form>
    </div>
  );
}
