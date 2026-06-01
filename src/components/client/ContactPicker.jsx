import React, { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { 
  User, X, Check, Star, Search, Loader2
} from "lucide-react";
import { toast } from "sonner";
import { Preferences } from "@capacitor/preferences";

const FREQUENT_CONTACTS_KEY = "silgapp_frequent_contacts";

export default function ContactPicker({ type = "destinataire", onSelect }) {
  const [showContacts, setShowContacts] = useState(false);
  const [frequentContacts, setFrequentContacts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");

  // Charger les contacts fréquents au montage
  useEffect(() => {
    loadFrequentContacts();
  }, []);

  const loadFrequentContacts = async () => {
    try {
      const stored = await Preferences.get({ key: FREQUENT_CONTACTS_KEY });
      if (stored.value) {
        const parsed = JSON.parse(stored.value);
        const sorted = parsed.sort((a, b) => (b.usage_count || 1) - (a.usage_count || 1));
        setFrequentContacts(sorted.slice(0, 20));
      }
    } catch (err) {
      console.error("Erreur chargement contacts fréquents:", err);
    }
  };

  const saveFrequentContact = async (contact) => {
    try {
      const stored = await Preferences.get({ key: FREQUENT_CONTACTS_KEY });
      let contacts = stored.value ? JSON.parse(stored.value) : [];
      
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

  const handleSelectContact = async (contact) => {
    await saveFrequentContact({
      nom: contact.nom,
      telephone: contact.telephone,
    });

    onSelect({
      nom: contact.nom,
      telephone: contact.telephone,
    });

    setShowContacts(false);
    toast.success(`✅ ${contact.nom} sélectionné`);
  };

  const filteredContacts = frequentContacts.filter(c => 
    c.nom?.toLowerCase().includes(searchQuery.toLowerCase()) || 
    c.telephone?.includes(searchQuery)
  );

  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setShowContacts(true)}
        className="w-full h-12 border-purple-300 text-purple-700 hover:bg-purple-50 hover:border-purple-400 font-medium"
      >
        <><User className="w-5 h-5 mr-2" /> 📖 Choisir dans mes contacts fréquents</>
      </Button>

      {showContacts && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <Card className="w-full sm:max-w-md max-h-[80vh] overflow-hidden flex flex-col bg-white">
            <div className="p-4 border-b flex items-center justify-between bg-purple-600 text-white">
              <h3 className="font-bold text-lg">
                📖 {type === "destinataire" ? "Destinataires" : "Expéditeurs"} fréquents
              </h3>
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
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              {/* Contacts fréquents */}
              {filteredContacts.length > 0 ? (
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Star className="w-4 h-4 text-yellow-500" />
                    <h4 className="font-bold text-sm text-gray-700">
                      {searchQuery ? `${filteredContacts.length} contact(s) trouvé(s)` : "Contacts fréquents"}
                    </h4>
                  </div>
                  <div className="space-y-2">
                    {filteredContacts.map((contact, idx) => (
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
                        <div className="flex items-center gap-2">
                          <Badge className="bg-gray-100 text-gray-600 text-xs">
                            {contact.usage_count || 1}x
                          </Badge>
                          <Check className="w-5 h-5 text-purple-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <User className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">
                    {searchQuery ? "Aucun contact ne correspond à votre recherche" : "Aucun contact fréquent"}
                  </p>
                  <p className="text-xs mt-1">
                    {searchQuery ? "Essayez un autre terme" : "Les contacts que vous sélectionnez apparaîtront ici"}
                  </p>
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