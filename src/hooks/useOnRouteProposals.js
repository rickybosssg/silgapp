import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

/**
 * useOnRouteProposals — Récupère les propositions "sur trajet" pending
 * pour un livreur donné.
 *
 * - Polling toutes les 15 secondes (propositions expirent en 300s).
 * - Invalidation automatique via realtime subscription (gérée par le composant).
 * - Retourne un tableau vide si pas de propositions.
 *
 * Le livreur ne voit QUE ses propres propositions (filtrage backend par livreur_id).
 */
export function useOnRouteProposals(livreurProfil) {
  const livreurId = livreurProfil?.id;
  const queryClient = useQueryClient();

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["on-route-proposals", livreurId],
    queryFn: async () => {
      const res = await base44.functions.invoke("getOnRouteProposalsForLivreur", {
        livreur_id: livreurId,
      });
      return res?.proposals || [];
    },
    enabled: !!livreurId,
    refetchInterval: 15000, // 15 secondes
    staleTime: 10000,
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