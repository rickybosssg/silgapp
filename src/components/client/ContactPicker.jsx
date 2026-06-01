import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  User, X, Check, Star, Search, Phone, MapPin,
  Loader2, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const FREQUENT_CONTACTS_KEY = "silgapp_frequent_contacts";

export default function ContactPicker({ type = "destinataire", onSelect }) {
  const [showContacts, setShowContacts] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [frequentContacts, setFrequentContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  // Charger les contacts fréquents au montage
  useEffect(() => {
    loadFrequentContacts();
  }, []);

  const loadFrequentContacts = async () => {
    try {
      const stored = await Preferences.get({ key: FREQUENT_CONTACTS_KEY });
      if (stored.value) {
        const parsed = JSON.parse(stored.value);
        // Trier par nombre d'utilisations
        const sorted = parsed.sort((a, b) => (b.usage_count || 1) - (a.usage_count || 1));
        setFrequentContacts(sorted.slice(0, 20)); // Top 20
      }
    } catch (err) {
      console.error("Erreur chargement contacts fréquents:", err);
    }
  };

  const saveFrequentContact = async (contact) => {
    try {
      const stored = await Preferences.get({ key: FREQUENT_CONTACTS_KEY });
      let contacts = stored.value ? JSON.parse(stored.value) : [];
      
      // Chercher si contact existe déjà
      const existing = contacts.find(c => 
        normalizePhone(c.telephone) === normalizePhone(contact.telephone)
      );
      
      if (existing) {
        existing.usage_count = (existing.usage_count || 1) + 1;
        existing.last_used = new Date().toISOString();
      } else {
        contacts.push({
          ...contact,
          usage_count: 1,
          last_used: new Date().toISOString(),
        });
      }
      
      await Preferences.set({
        key: FREQUENT_CONTACTS_KEY,
        value: JSON.stringify(contacts),
      });
      
      await loadFrequentContacts();
    } catch (err) {
      console.error("Erreur sauvegarde contact fréquent:", err);
    }
  };

  const normalizePhone = (phone) => {
    if (!phone) return "";
    return phone.replace(/\D/g, "").slice(-8);
  };

  const formatPhone = (phone) => {
    if (!phone) return "";
    const digits = phone.replace(/\D/g, "");
    if (digits.length === 8) {
      return digits.replace(/(\d{2})(\d{2})(\d{2})(\d{2})/, "+226 $1 $2 $3 $4");
    }
    return phone;
  };

  const openNativeContacts = async () => {
    setLoading(true);
    try {
      // Vérifier permissions
      const { status } = await Capacitor.Plugins.Contacts?.checkPermissions?.() || { status: 'denied' };
      
      if (status === 'denied') {
        const { status: newStatus } = await Capacitor.Plugins.Contacts?.requestPermissions?.() || { status: 'denied' };
        if (newStatus === 'denied') {
          toast.error("Permission contacts refusée. Utilisez la saisie manuelle.");
          setShowContacts(false);
          return;
        }
      }

      // Récupérer contacts
      const { contacts: fetched } = await Capacitor.Plugins.Contacts?.getContacts?.({
        fields: ['name', 'phone'],
        limit: 100,
      }) || { contacts: [] };

      if (fetched && fetched.length > 0) {
        setContacts(fetched.map(c => ({
          nom: c.name || 'Contact',
          telephone: c.phone?.[0]?.value || c.phones?.[0]?.value || '',
        })));
      } else {
        toast.info("Aucun contact trouvé");
      }
    } catch (err) {
      console.error("Erreur lecture contacts:", err);
      toast.error("Impossible d'accéder aux contacts");
    } finally {
      setLoading(false);
    }
  };

  const handleSelectContact = async (contact) => {
    // Sauvegarder comme contact fréquent
    await saveFrequentContact({
      nom: contact.nom || contact.name,
      telephone: contact.telephone || contact.phone?.[0]?.value,
    });

    // Appeler le callback
    onSelect({
      nom: contact.nom || contact.name,
      telephone: contact.telephone || contact.phone?.[0]?.value,
    });

    setShowContacts(false);
    toast.success(`✅ ${contact.nom || contact.name} sélectionné`);
  };

  const isNative = Capacitor.isNativePlatform();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setShowContacts(true);
          if (isNative) {
            openNativeContacts();
          }
        }}
        className="w-full h-12 border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400 font-medium"
      >
        {loading ? (
          <><Loader2 className="w-5 h-5 mr-2 animate-spin" /> Chargement...</>
        ) : (
          <><User className="w-5 h-5 mr-2" /> 📖 {isNative ? "Choisir dans mes contacts" : "Contacts fréquents"}</>
        )}
      </Button>

      {showContacts && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Card className="w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col bg-white">
            <div className="p-4 border-b flex items-center justify-between bg-purple-600 text-white">
              <h3 className="font-bold text-lg">📖 {type === "destinataire" ? "Destinataires" : "Expéditeurs"} fréquents</h3>
              <Button variant="ghost" size="icon" onClick={() => setShowContacts(false)}>
                <X className="w-5 h-5" />
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Barre de recherche */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  placeholder="Rechercher un contact..."
                  className="pl-9 h-11"
                  onChange={(e) => {
                    const query = e.target.value.toLowerCase();
                    const filtered = frequentContacts.filter(c => 
                      c.nom?.toLowerCase().includes(query) || 
                      c.telephone?.includes(query)
                    );
                    setFrequentContacts(filtered);
                  }}
                />
              </div>

              {/* Contacts fréquents */}
              {frequentContacts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <h4 className="font-bold text-sm text-gray-700">Contacts fréquents</h4>
                  </div>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {frequentContacts.map((contact, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleSelectContact(contact)}
                        className="w-full p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-center justify-between group"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                            <User className="w-5 h-5 text-purple-600" />
                          </div>
                          <div className="text-left">
                            <p className="font-bold text-gray-900">{contact.nom}</p>
                            <p className="text-sm text-gray-600">{formatPhone(contact.telephone)}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Badge className="bg-gray-100 text-gray-600 text-xs">
                            {contact.usage_count || 1}x
                          </Badge>
                          <Check className="w-5 h-5 text-purple-600" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Contacts natifs (Android/iOS seulement) */}
              {isNative && contacts.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <User className="w-4 h-4 text-blue-500" />
                    <h4 className="font-bold text-sm text-gray-700">Tous les contacts ({contacts.length})</h4>
                  </div>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {contacts
                      .filter(c => c.nom || (c.telephone && c.telephone.length > 0))
                      .slice(0, 50)
                      .map((contact, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => handleSelectContact(contact)}
                          className="w-full p-3 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50 transition-all flex items-center gap-3"
                        >
                          <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                            <User className="w-5 h-5 text-blue-600" />
                          </div>
                          <div className="text-left flex-1">
                            <p className="font-bold text-gray-900">{contact.nom || 'Contact'}</p>
                            <p className="text-sm text-gray-600">{formatPhone(contact.telephone)}</p>
                          </div>
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {contacts.length === 0 && frequentContacts.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Aucun contact disponible</p>
                  <p className="text-xs mt-1">Utilisez la saisie manuelle</p>
                </div>
              )}

              {isNative && contacts.length === 0 && frequentContacts.length > 0 && (
                <div className="text-center py-4 bg-blue-50 rounded-lg border border-blue-200">
                  <p className="text-sm text-blue-800 font-medium">💡 Astuce</p>
                  <p className="text-xs text-blue-600 mt-1">Vos contacts fréquents sont affichés ci-dessus</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowContacts(false)}
                className="w-full"
              >
                <X className="w-4 h-4 mr-2" />
                Utiliser la saisie manuelle
              </Button>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}