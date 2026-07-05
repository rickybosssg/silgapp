import React, { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, MapPin, Plus, Minus, ShoppingCart, Loader2, Package, Clock, X, Camera, Play } from "lucide-react";
import CheckoutModal from "@/components/boutique/CheckoutModal";
import MediaGallery, { getMediaList } from "@/components/media/MediaGallery";

export default function BoutiqueDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [clientProfil, setClientProfil] = useState(null);
  const [cart, setCart] = useState([]);
  const [showCheckout, setShowCheckout] = useState(false);
  const [galleryProduct, setGalleryProduct] = useState(null);
  const visitTrackedRef = useRef(false);

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

  useEffect(() => {
    if (!boutique?.id || visitTrackedRef.current) return;
    const key = `silgapp_visit_boutique_${boutique.id}`;
    const today = new Date().toISOString().slice(0, 10);
    if (sessionStorage.getItem(key) === today) return;

    visitTrackedRef.current = true;
    sessionStorage.setItem(key, today);
    base44.entities.Boutique.update(boutique.id, {
      nb_visites: (Number(boutique.nb_visites) || 0) + 1,
      derniere_visite_at: new Date().toISOString(),
    }).catch(() => {
      visitTrackedRef.current = false;
      sessionStorage.removeItem(key);
    });
  }, [boutique?.id]);

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
      <div className="bg-gradient-to-r from-primary to-red-700 text-white px-4 py-3 sticky top-0 z-20">
        <div className="max-w-lg mx-auto flex items-center gap-3">
          <button onClick={() => navigate("/client/boutiques")} className="text-white/80 hover:text-white p-2.5 -ml-2 rounded-xl hover:bg-white/10 transition-colors"><ArrowLeft className="w-6 h-6" /></button>
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
          {boutique.logo_url && <img src={boutique.logo_url} alt={boutique.nom} className="w-full h-48 rounded-2xl object-cover" />}
          <div className="flex items-center gap-2 text-sm text-gray-500"><MapPin className="w-4 h-4" /> {boutique.quartier || ""} {boutique.ville ? "· " + boutique.ville : ""}</div>
          {boutique.horaires && (
            <p className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {boutique.horaires}
            </p>
          )}
          {boutique.description && <p className="text-sm text-gray-600">{boutique.description}</p>}
        </div>

        <div className="bg-gradient-to-r from-orange-500 to-amber-500 rounded-2xl p-4 shadow-lg shadow-orange-500/20">
          <p className="text-xs font-bold text-white/80 uppercase tracking-wide">Paiement Orange Money</p>
          <p className="text-2xl font-black text-white mt-1 tracking-widest">{boutique.telephone_depot || "—"}</p>
          <p className="text-xs text-white/80 mt-1">Effectuez le paiement sur ce numéro, puis téléchargez la preuve lors de la commande.</p>
        </div>

        <div>
          <h2 className="font-bold text-gray-900 text-sm mb-2">Produits</h2>
          {!isOuvert && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-3 mb-3 text-center">
              <p className="text-sm font-bold text-red-600">Fermé actuellement — commande impossible</p>
            </div>
          )}
          <div className="space-y-2">
            {produits.length === 0 && <p className="text-sm text-gray-500 text-center py-8">Aucun produit disponible</p>}
            {produits.map(p => {
              const inCart = cart.find(i => i.id === p.id);
              const mediaList = getMediaList(p);
              const firstMedia = mediaList[0];
              const hasRichMedia = mediaList.length > 1 || firstMedia?.type === "video";
              return (
                <div key={p.id} className="bg-white rounded-3xl border border-gray-100 shadow-md shadow-gray-200/60 p-3 flex items-stretch gap-3">
                  <button
                    type="button"
                    onClick={() => setGalleryProduct(p)}
                    className="relative w-32 min-h-32 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center overflow-hidden flex-shrink-0 active:scale-95 transition-transform"
                  >
                    {firstMedia?.type === "image" ? (
                      <img src={firstMedia.url} alt={p.nom} className="w-full h-full object-cover" />
                    ) : firstMedia?.type === "video" ? (
                      <>
                        <video src={firstMedia.url} className="w-full h-full object-cover" preload="metadata" muted playsInline />
                        <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                          <Play className="w-8 h-8 text-white fill-white" />
                        </div>
                      </>
                    ) : (
                      <Package className="w-10 h-10 text-blue-300" />
                    )}
                    {hasRichMedia && (
                      <span className="absolute left-2 bottom-2 rounded-full bg-black/65 px-2 py-1 text-[10px] font-bold text-white">
                        {mediaList.length} médias
                      </span>
                    )}
                  </button>
                  <div className="flex-1 min-w-0 py-1 flex flex-col">
                    <p className="font-black text-gray-950 text-base leading-snug line-clamp-2">{p.nom}</p>
                    {p.description && <p className="text-xs text-gray-500 line-clamp-2 mt-1">{p.description}</p>}
                    <p className="font-black text-primary text-lg mt-2">{(p.prix || 0).toLocaleString()} FCFA</p>
                    {hasRichMedia && (
                      <p className="text-[11px] text-blue-600 font-bold mt-1 flex items-center gap-1">
                        <Camera className="w-3 h-3" />
                        Voir la galerie
                      </p>
                    )}
                    <div className="mt-auto pt-2 text-[10px] font-semibold text-gray-400">Touchez la photo pour agrandir</div>
                  </div>
                  {isOuvert && (
                    inCart ? (
                      <div className="flex flex-col items-center justify-center gap-2 flex-shrink-0">
                        <button onClick={() => updateQty(p.id, -1)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center"><Minus className="w-4 h-4" /></button>
                        <span className="font-bold text-sm w-6 text-center">{inCart.quantite}</span>
                        <button onClick={() => updateQty(p.id, 1)} className="w-8 h-8 rounded-lg bg-primary text-white flex items-center justify-center"><Plus className="w-4 h-4" /></button>
                      </div>
                    ) : (
                      <button onClick={() => addToCart(p)} className="w-12 h-12 self-center rounded-2xl bg-red-600 text-white flex items-center justify-center flex-shrink-0 shadow-lg shadow-red-500/25 active:scale-95 transition-transform"><Plus className="w-6 h-6" /></button>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {cartCount > 0 && isOuvert && (
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-gradient-to-t from-gray-50 via-gray-50/95 to-transparent pt-6 px-4 pb-4">
          <div className="max-w-lg mx-auto">
            <button onClick={() => setShowCheckout(true)} className="w-full bg-primary text-white rounded-2xl p-4 flex items-center justify-between shadow-2xl shadow-primary/30 active:scale-[0.98] transition-all duration-150 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-primary">
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

      {galleryProduct && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-end sm:items-center justify-center" onClick={() => setGalleryProduct(null)}>
          <div className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-sm max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 bg-white border-b border-gray-100 px-4 py-3 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 text-sm truncate">{galleryProduct.nom}</h3>
              <button onClick={() => setGalleryProduct(null)} className="p-1"><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-4 space-y-3">
              <MediaGallery item={galleryProduct} className="h-48" />
              {galleryProduct.description && <p className="text-sm text-gray-600">{galleryProduct.description}</p>}
              <p className="font-bold text-primary">{(galleryProduct.prix || 0).toLocaleString()} FCFA</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
