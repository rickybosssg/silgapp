import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, CheckCircle, XCircle, Package, ImageOff, Tag } from "lucide-react";

const VALIDATION_LABELS = {
  en_attente: { label: "En attente", color: "text-amber-600", bg: "bg-amber-50", border: "border-amber-200", dot: "bg-amber-500" },
  valide: { label: "Validé", color: "text-green-600", bg: "bg-green-50", border: "border-green-200", dot: "bg-green-500" },
  refuse: { label: "Refusé", color: "text-red-600", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500" },
};

export default function BoutiqueProductsSection({ boutiqueId }) {
  const queryClient = useQueryClient();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null);

  useEffect(() => {
    if (!boutiqueId) return;
    loadProducts();
  }, [boutiqueId]);

  const loadProducts = async () => {
    setLoading(true);
    try {
      const data = await base44.entities.ProduitBoutique.filter({ boutique_id: boutiqueId }, "-created_date", 100);
      setProducts(data || []);
    } catch (err) {
      console.error("Erreur chargement produits:", err);
    }
    setLoading(false);
  };

  const handleProductValidation = async (productId, action) => {
    setActionLoading(`${productId}-${action}`);
    try {
      let me = null;
      try { me = await base44.auth.me(); } catch (_) {}

      const updates = {
        validation: action === "valider" ? "valide" : "refuse",
        valide_par: me?.email || null,
        valide_at: new Date().toISOString(),
        motif_refus: action === "refuser" ? "Refusé par l'admin" : "",
        actif: action === "valider",
      };

      await base44.entities.ProduitBoutique.update(productId, updates);
      queryClient.invalidateQueries({ queryKey: ["admin-boutiques"] });
      await loadProducts();
    } catch (err) {
      console.error("Erreur validation produit:", err);
    }
    setActionLoading(null);
  };

  const stats = {
    total: products.length,
    en_attente: products.filter(p => !p.validation || p.validation === "en_attente").length,
    valide: products.filter(p => p.validation === "valide").length,
    refuse: products.filter(p => p.validation === "refuse").length,
  };

  return (
    <section>
      <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wide mb-2 flex items-center gap-2">
        <Package className="w-3.5 h-3.5" /> Articles de la boutique
      </h3>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      ) : products.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center">
          <Package className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-400">Aucun article ajouté pour le moment</p>
        </div>
      ) : (
        <>
          {/* Stats résumé */}
          <div className="grid grid-cols-4 gap-1.5 mb-3">
            <div className="rounded-lg bg-gray-50 p-2 text-center">
              <p className="text-lg font-black text-gray-700">{stats.total}</p>
              <p className="text-[9px] font-bold text-gray-400 uppercase">Total</p>
            </div>
            <div className="rounded-lg bg-amber-50 p-2 text-center">
              <p className="text-lg font-black text-amber-600">{stats.en_attente}</p>
              <p className="text-[9px] font-bold text-amber-400 uppercase">Attente</p>
            </div>
            <div className="rounded-lg bg-green-50 p-2 text-center">
              <p className="text-lg font-black text-green-600">{stats.valide}</p>
              <p className="text-[9px] font-bold text-green-400 uppercase">Validés</p>
            </div>
            <div className="rounded-lg bg-red-50 p-2 text-center">
              <p className="text-lg font-black text-red-600">{stats.refuse}</p>
              <p className="text-[9px] font-bold text-red-400 uppercase">Refusés</p>
            </div>
          </div>

          {/* Liste des produits */}
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {products.map((product) => {
              const valInfo = VALIDATION_LABELS[product.validation] || VALIDATION_LABELS.en_attente;
              const photos = (() => {
                try { return JSON.parse(product.photos_urls || "[]"); } catch { return []; }
              })();
              const mainPhoto = product.photo_url || photos?.[0] || null;

              return (
                <div key={product.id} className={`rounded-xl border ${valInfo.border} ${valInfo.bg} p-3 flex items-center gap-3`}>
                  {/* Photo */}
                  <div className="w-12 h-12 rounded-lg bg-gray-100 flex items-center justify-center flex-shrink-0 overflow-hidden">
                    {mainPhoto ? (
                      <img src={mainPhoto} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <ImageOff className="w-4 h-4 text-gray-300" />
                    )}
                  </div>

                  {/* Infos produit */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-800 truncate">{product.nom}</p>
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold ${valInfo.bg} ${valInfo.color}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${valInfo.dot}`} />
                        {valInfo.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-0.5">
                      <p className="text-sm font-black text-gray-900">
                        {Number(product.prix).toLocaleString()} <span className="text-xs font-normal text-gray-400">{product.devise || "FCFA"}</span>
                      </p>
                      {product.categorie && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-gray-400">
                          <Tag className="w-2.5 h-2.5" /> {product.categorie}
                        </span>
                      )}
                    </div>
                    {product.description && (
                      <p className="text-[11px] text-gray-400 truncate mt-0.5">{product.description}</p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {product.validation !== "valide" && (
                      <button
                        onClick={() => handleProductValidation(product.id, "valider")}
                        disabled={!!actionLoading}
                        className="w-8 h-8 rounded-lg bg-green-600 hover:bg-green-700 text-white flex items-center justify-center disabled:opacity-50"
                        title="Valider"
                      >
                        {actionLoading === `${product.id}-valider` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <CheckCircle className="w-4 h-4" />
                        )}
                      </button>
                    )}
                    {product.validation !== "refuse" && (
                      <button
                        onClick={() => handleProductValidation(product.id, "refuser")}
                        disabled={!!actionLoading}
                        className="w-8 h-8 rounded-lg bg-red-600 hover:bg-red-700 text-white flex items-center justify-center disabled:opacity-50"
                        title="Refuser"
                      >
                        {actionLoading === `${product.id}-refuser` ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
}