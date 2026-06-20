import React from "react";
import { Shield, MapPin, Phone, Bell, Package, Mail, ChevronLeft } from "lucide-react";

export default function PolitiqueConfidentialite() {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-primary text-white px-4 py-6 safe-area-top">
        <button
          onClick={() => window.history.back()}
          className="flex items-center gap-2 text-white/80 mb-4 text-sm"
        >
          <ChevronLeft className="w-4 h-4" />
          Retour
        </button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-black">Politique de Confidentialité</h1>
            <p className="text-white/70 text-xs">SILGAPP — Dernière mise à jour : Juin 2026</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6 pb-16">

        {/* Introduction */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h2 className="font-black text-gray-900 mb-3">À propos de SILGAPP</h2>
          <p className="text-sm text-gray-600 leading-relaxed">
            SILGAPP est une application de livraison express opérant en Afrique de l'Ouest (Burkina Faso,
            Côte d'Ivoire, Sénégal, Togo, Bénin, Mali, Guinée, Niger). Nous accordons une importance
            primordiale à la protection de vos données personnelles.
          </p>
          <p className="text-sm text-gray-600 leading-relaxed mt-3">
            Développeur : SILGAPP Burkina Faso<br />
            Contact : <a href="mailto:support@silgapp.bf" className="text-primary underline">support@silgapp.bf</a><br />
            Téléphone : +226 66 92 51 90
          </p>
        </div>

        {/* Données collectées */}
        <Section icon={<Package className="w-5 h-5 text-primary" />} title="Données collectées">
          <DataItem
            title="Informations de compte"
            desc="Nom, prénom, adresse e-mail (fournis lors de l'inscription via Base44)"
            sensible={false}
          />
          <DataItem
            title="Numéro de téléphone"
            desc="Utilisé pour les notifications SMS, l'attribution des courses et la communication entre clients et livreurs"
            sensible={true}
          />
          <DataItem
            title="Localisation GPS"
            desc="Latitude/longitude en temps réel. Pour les livreurs : suivi en arrière-plan pendant les courses. Pour les clients : positionnement pour calculer les distances et trouver les livreurs proches."
            sensible={true}
          />
          <DataItem
            title="Historique de courses"
            desc="Adresses de départ/arrivée, horodatage, montant, statut de chaque livraison effectuée"
            sensible={false}
          />
          <DataItem
            title="Photos (livreurs uniquement)"
            desc="Photo de profil, photo CNIB (carte d'identité), photo du véhicule — pour la validation du compte"
            sensible={true}
          />
          <DataItem
            title="Token de notifications push"
            desc="Identifiant Firebase Cloud Messaging (FCM) pour envoyer des notifications de courses"
            sensible={false}
          />
        </Section>

        {/* Localisation */}
        <Section icon={<MapPin className="w-5 h-5 text-primary" />} title="Utilisation de la localisation">
          <p className="text-sm text-gray-600 leading-relaxed">
            <strong>Pourquoi :</strong> La géolocalisation est une fonctionnalité CŒUR de SILGAPP. Elle sert à :
          </p>
          <ul className="text-sm text-gray-600 space-y-1.5 mt-2 list-disc list-inside">
            <li>Calculer la distance réelle entre l'expéditeur et le destinataire</li>
            <li>Dispatcher automatiquement le livreur le plus proche</li>
            <li>Permettre le suivi GPS en temps réel de la livraison</li>
            <li>Déterminer le quartier automatiquement (reverse geocoding)</li>
          </ul>
          <p className="text-sm text-gray-600 mt-3">
            <strong>Localisation en arrière-plan (livreurs uniquement) :</strong> Les livreurs doivent
            autoriser la localisation en arrière-plan pour que l'application puisse suivre la course
            même quand l'écran est éteint. Cette permission est demandée séparément et explicitement.
          </p>
          <p className="text-sm text-gray-600 mt-3">
            <strong>Conservation :</strong> Les coordonnées GPS sont mises à jour en temps réel et
            remplacées à chaque synchronisation. L'historique de positions n'est pas conservé au-delà
            de la course en cours.
          </p>
        </Section>

        {/* Notifications */}
        <Section icon={<Bell className="w-5 h-5 text-primary" />} title="Notifications Push">
          <p className="text-sm text-gray-600 leading-relaxed">
            SILGAPP utilise Firebase Cloud Messaging (FCM) de Google pour envoyer des notifications push.
          </p>
          <ul className="text-sm text-gray-600 space-y-1.5 mt-2 list-disc list-inside">
            <li>Nouvelle course disponible (livreurs)</li>
            <li>Course acceptée / refusée</li>
            <li>Colis récupéré / livré</li>
            <li>Alertes urgentes de l'administration</li>
          </ul>
          <p className="text-sm text-gray-600 mt-3">
            Sur Android 13+, une permission explicite est demandée pour les notifications. Vous pouvez
            les désactiver à tout moment dans les paramètres de votre appareil.
          </p>
        </Section>

        {/* Téléphone */}
        <Section icon={<Phone className="w-5 h-5 text-primary" />} title="Numéros de téléphone">
          <p className="text-sm text-gray-600 leading-relaxed">
            Les numéros de téléphone sont utilisés pour :
          </p>
          <ul className="text-sm text-gray-600 space-y-1.5 mt-2 list-disc list-inside">
            <li>Identifier l'expéditeur et le destinataire d'une course</li>
            <li>Permettre au livreur de contacter le client (appel direct ou WhatsApp)</li>
            <li>Envoyer des alertes WhatsApp pour les courses urgentes</li>
          </ul>
          <p className="text-sm text-gray-600 mt-3">
            <strong>SILGAPP n'accède pas à votre carnet de contacts.</strong> Les numéros sont
            saisis manuellement par l'utilisateur dans les formulaires de course.
          </p>
        </Section>

        {/* Partage des données */}
        <Section icon={<Shield className="w-5 h-5 text-primary" />} title="Partage des données">
          <p className="text-sm text-gray-600 leading-relaxed">
            SILGAPP ne vend jamais vos données. Les données sont partagées uniquement avec :
          </p>
          <ul className="text-sm text-gray-600 space-y-1.5 mt-2 list-disc list-inside">
            <li><strong>Base44</strong> — Hébergement de l'application et base de données</li>
            <li><strong>Firebase (Google)</strong> — Notifications push</li>
            <li><strong>Twilio</strong> — Alertes WhatsApp pour les livreurs</li>
            <li><strong>OpenStreetMap / Nominatim</strong> — Reverse geocoding (sans données personnelles)</li>
          </ul>
        </Section>

        {/* Droits */}
        <Section icon={<Mail className="w-5 h-5 text-primary" />} title="Vos droits">
          <p className="text-sm text-gray-600 leading-relaxed">
            Conformément au RGPD et aux lois locales applicables, vous avez le droit de :
          </p>
          <ul className="text-sm text-gray-600 space-y-1.5 mt-2 list-disc list-inside">
            <li><strong>Accéder</strong> à vos données personnelles</li>
            <li><strong>Corriger</strong> des données inexactes</li>
            <li><strong>Supprimer</strong> votre compte et vos données</li>
            <li><strong>Retirer</strong> les permissions GPS ou notifications à tout moment</li>
          </ul>
          <p className="text-sm text-gray-600 mt-3">
            Pour exercer ces droits, contactez-nous :{" "}
            <a href="mailto:support@silgapp.bf" className="text-primary underline font-semibold">
              support@silgapp.bf
            </a>
            {" "}ou WhatsApp : +226 66 92 51 90
          </p>
        </Section>

        {/* Conservation */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
          <h3 className="font-bold text-gray-900 mb-2">Conservation des données</h3>
          <div className="space-y-2 text-sm text-gray-600">
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span>Données de compte</span>
              <span className="font-medium">Jusqu'à suppression du compte</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span>Historique de courses</span>
              <span className="font-medium">2 ans</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-gray-50">
              <span>Position GPS en temps réel</span>
              <span className="font-medium">Non archivée</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span>Logs techniques</span>
              <span className="font-medium">90 jours</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="bg-primary/5 rounded-2xl p-4 text-center">
          <p className="text-xs text-gray-500">
            Cette politique peut être mise à jour. Toute modification importante sera notifiée
            dans l'application.
          </p>
          <p className="text-xs text-gray-400 mt-1">Version 1.0 — Juin 2026</p>
        </div>
      </div>
    </div>
  );
}

function Section({ icon, title, children }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <h3 className="font-bold text-gray-900">{title}</h3>
      </div>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function DataItem({ title, desc, sensible }) {
  return (
    <div className="flex items-start gap-2 py-2 border-b border-gray-50 last:border-0">
      <span className={`mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${
        sensible ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"
      }`}>
        {sensible ? "SENSIBLE" : "OK"}
      </span>
      <div>
        <p className="text-sm font-semibold text-gray-800">{title}</p>
        <p className="text-xs text-gray-500 leading-relaxed mt-0.5">{desc}</p>
      </div>
    </div>
  );
}