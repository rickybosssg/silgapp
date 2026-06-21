import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Store, MapPin, Plus, Minus, ShoppingCart, Loader2, Package } from "lucide-react";
import CheckoutModal from "@/components/boutique/CheckoutModal";

export default function BoutiqueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clientProfil, setClientProfil] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      if (u?.email) {
        base44.entities.ClientExterne.filter({ user_email: u.email })
          .then(c => setClientProfil(c?.[0] || null))
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  const { data: boutique, isLoading } = useQuery({
    queryKey: ["boutique", id],
    queryFn: () => base44.entities.Boutique.get(id),
    enabled: !!id,
  });

  const { data: produits = [] } = useQuery({
    queryKey: ["produits-boutique", id],
    queryFn: () => base44.entities.ProduitBoutique.filter({ boutique_id: id, disponible: true, actif: true }, "-created_date", 200),
    enabled: !!id,
  });

  const addToCart = (p) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, quantite: i.quantite + 1 } : i);
      return [...prev, { id: p.id, nom: p.nom, prix: p.prix, quantite: 1, photo_url: p.photo_url }];
    });
  };

  const updateQty = (pid, delta) => {
    setCart(prev => prev.map(i => i.id === pid ? { ...i, quantite: i.quantite + delta } : i).filter(i => i.quantite > 0));
  };

  const total = cart.reduce((s, i) => s + i.prix * i.quantite, 0);
  const cartCount = cart.reduce((s, i) => s + i.quantite, 0);

  if (isLoading || !clientProfil) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  if (!boutique) return <div className="min-h-screen bg-gray-50 flex items-center justify-center"><p className="text-gray-500">Boutique introuvable</p></div>;

  const isOuvert = boutique.ouvert && boutique.actif;

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-4 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/client/boutiques")} className="text-white/80 hover:text-white p-1"><ArrowLeft className="w-6 h-6" /></button>
          <div className="flex-1">
            <h1 className="text-lg font-black">{boutique.nom}</h1>
            <p className="text-white/70 text-xs">{boutique.categorie || boutique.description || ""}</p>
          </div>
          {isOuvert
            ? <span className="text-[10px] font-bold text-green-100 bg-green-500/30 px-2 py-1 rounded-full">Ouvert</span>
            : <span className="text-[10px] font-bold text-red-100 bg-red-500/30 px-2 py-1 rounded-full">Fermé</span>}
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-4 space-y-4">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          {boutique.logo_url && <img src={boutique.logo_url} alt={boutique.nom} className="w-full h-32 rounded-xl object-cover" />}
          <div className="flex items-center gap-2 text-sm text-gray-500"><MapPin className="w-4 h-4" /> {boutique.quartier || ""} {boutique.ville ? "· " + boutique.ville : ""}</div>
          {boutique.horaires && <p className="text-xs text-gray-500">🕐 {boutique.horaires}</p>}
          {boutique.description && <p className="text-sm text-gray-600">{boutique.description}</p>}
        </div>

        <div className="bg-orange-50 border border-orange-200 rounded-2xl p-4">
          <p className="text-xs font-bold text-orange-700 uppercase">Paiement Orange Money</p>
          <p className="text-lg font-black text-orange-900 mt-1">{boutique.telephone_depot || "—"}</p>
          <p className="text-xs text-orange-600 mt-1">Effectuez le paiement sur ce numéro, puis téléchargez la preuve lors de la commande.</p>
        </div>

        <div>
          <h2 className="font-bold text-gray-900 text-sm mb-2">Produits</h2>
          {!isOuvert && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-center">
              <p className="text-sm font-bold text-red-600">Fermé actuellement — commande impossible</p>
            </div>
          )}
          <div className="space-y-2">
            {produits.length === 0 && <p className="text-sm text-gray-400 text-center py-4">Aucun produit disponible</p>}
            {produits.map(p => {
              const inCart = cart.find(i => i.id === p.id);
              return (
                <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                  <div className="w-14 h-14 rounded-xl bg-gray-50 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {p.photo_url ? <img src={p.photo_url} alt={p.nom} className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-gray-300" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-gray-900 text-sm truncate">{p.nom}</p>
                    <p className="text-xs text-gray-500 truncate">{p.description}</p>
                    <p className="font-bold text-primary text-sm mt-0.5">{(p.prix || 0).toLocaleString()} FCFA</p>
                  </div>
                  {isOuvert && (
                    inCart ? (
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <button onClick={() => updateQty(p.id, -1)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                        <span className="font-bold text-sm w-6 text-center">{inCart.quantite}</span>
                        <button onClick={() => updateQty(p.id, 1)} className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(p)} className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center flex-shrink-0"><Plus className="w-4 h-4" /></button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {cartCount > 0 && isOuvert && (
        <div className="fixed bottom-0 left-0 right-0 z-30 p-4">
          <div className="max-w-lg mx-auto">
            <button onClick={() => setShowCheckout(true)} className="w-full bg-primary text-white rounded-2xl p-4 flex items-center justify-between shadow-xl active:scale-[0.98] transition-all">
              <div className="flex items-center gap-2"><ShoppingCart className="w-5 h-5" /><span className="font-bold">{cartCount} article{cartCount > 1 ? "s" : ""}</span></div>
              <span className="font-black text-lg">{total.toLocaleString()} FCFA</span>
            </button>
          </div>
        </div>
      )}

      {showCheckout && (
        <CheckoutModal type="boutique" etablissementId={boutique.id} etablissementNom={boutique.nom} cart={cart} total={total} clientProfil={clientProfil}
          onClose={() => setShowCheckout(false)} onSuccess={() => navigate("/client/boutiques")} />
      )}
    </div>
  );
}
