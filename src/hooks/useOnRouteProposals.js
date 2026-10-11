import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * useOnRouteProposals — Récupère les propositions "sur trajet" pending
 * pour un livreur donné.
 *
 * - Polling léger toutes les 15 secondes (secours uniquement).
 * - Refetch immédiat au focus de l'app et au montage du composant.
 * - Invalidation automatique via realtime subscription (EcoProposal) gérée
 *   par le composant parent (LivreurExterneApp).
 * - Le livreur ne voit QUE ses propres propositions (filtrage backend par livreur_id).
 *
 * FIX (Correction 18) :
 *   - refetchOnWindowFocus: true → refetch immédiat quand l'app revient au premier plan.
 *   - refetchOnMount: true → refetch au montage (pas de données périmées).
 *   - staleTime: 5000 → les données sont considérées périmées après 5s (au lieu de 10s).
 *   - refetchInterval: 15000 inchangé (polling léger en secours).
 */
export function useOnRouteProposals(livreurProfil) {
  const livreurId = livreurProfil?.id;
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["on-route-proposals", livreurId],
    queryFn: async () => {
      const rawRes = await base44.functions.invoke("getOnRouteProposalsForLivreur", {
        livreur_id: livreurId,
      });
      const res = rawRes?.data ?? rawRes;
      return res?.proposals || [];
    },
    enabled: !!livreurId,
    refetchInterval: 15000,
    staleTime: 5000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["on-route-proposals", livreurId] });
  };

  return {
    proposals: data || [],
    isLoading,
    refetch,
    invalidate,
  };
}