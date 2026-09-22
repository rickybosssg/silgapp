// ═══════════════════════════════════════════════════════════════════════════
// useMetaAdsData — Hooks pour le dashboard Publicités Meta
// RÉUTILISE manageMetaCampaign, syncMetaAdsSpend, getAttributionStats
// NE CRÉE PAS de nouveau backend — appelle uniquement les fonctions existantes.
// ═══════════════════════════════════════════════════════════════════════════

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";

// Taux de conversion approximatif (le compte Meta est en USD)
export const USD_TO_FCFA = 600;

// ── Config / garde-fous ──
export function useMetaConfig() {
  return useQuery({
    queryKey: ["meta-config"],
    queryFn: async () => {
      const res = await base44.functions.invoke("manageMetaCampaign", { action: "get_config" });
      return res.data?.config || res.data;
    },
    staleTime: 30000,
  });
}

// ── Campagnes (entités MetaCampaign) ──
export function useMetaCampaigns() {
  return useQuery({
    queryKey: ["meta-campaigns"],
    queryFn: async () => {
      const res = await base44.functions.invoke("manageMetaCampaign", { action: "list_campaigns" });
      return res.data?.campaigns || res.data || [];
    },
    staleTime: 30000,
  });
}

// ── Créatifs (entités AdCreative) ──
export function useMetaCreatives() {
  return useQuery({
    queryKey: ["meta-creatives"],
    queryFn: async () => {
      const res = await base44.functions.invoke("manageMetaCampaign", { action: "list_creatives" });
      return res.data?.creatives || res.data || [];
    },
    staleTime: 30000,
  });
}

// ── Journal AcquisitionLog ──
export function useMetaLogs() {
  return useQuery({
    queryKey: ["meta-logs"],
    queryFn: async () => {
      const res = await base44.functions.invoke("manageMetaCampaign", { action: "list_logs" });
      return res.data?.logs || res.data || [];
    },
    staleTime: 30000,
  });
}

// ── Insights Meta (depuis AppConfig — mis à jour par syncMetaAdsSpend) ──
export function useMetaInsights() {
  return useQuery({
    queryKey: ["meta-insights"],
    queryFn: async () => {
      const configs = await base44.entities.AppConfig.filter({ cle: "META_ADS_LATEST_INSIGHTS" });
      if (configs?.[0]?.valeur) {
        return JSON.parse(configs[0].valeur);
      }
      return null;
    },
    staleTime: 60000,
  });
}

// ── Attribution Meta → Install → Client → Courses ──
export function useMetaAttribution() {
  return useQuery({
    queryKey: ["meta-attribution"],
    queryFn: async () => {
      const res = await base44.functions.invoke("getAttributionStats", {});
      return res.data;
    },
    staleTime: 60000,
  });
}

// ── Synchroniser les dépenses Meta (lecture seule) ──
export function useSyncMetaAds() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await base44.functions.invoke("syncMetaAdsSpend", {});
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-insights"] });
      qc.invalidateQueries({ queryKey: ["meta-attribution"] });
      qc.invalidateQueries({ queryKey: ["growth-ad-budget"] });
    },
  });
}

// ── Actions campagne (pause / resume / activate / approve / reject) ──
export function useMetaCampaignAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, campaign_id, ...rest }) => {
      const res = await base44.functions.invoke("manageMetaCampaign", {
        action,
        campaign_id,
        ...rest,
      });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      qc.invalidateQueries({ queryKey: ["meta-logs"] });
    },
  });
}

// ── Créer un brouillon de campagne ──
export function useCreateCampaignDraft() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params) => {
      const res = await base44.functions.invoke("manageMetaCampaign", {
        action: "create_campaign_draft",
        ...params,
      });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
      qc.invalidateQueries({ queryKey: ["meta-logs"] });
    },
  });
}

// ── Créer un créatif ──
export function useCreateCreative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params) => {
      const res = await base44.functions.invoke("manageMetaCampaign", {
        action: "create_creative",
        ...params,
      });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-creatives"] });
      qc.invalidateQueries({ queryKey: ["meta-logs"] });
    },
  });
}

// ── Synchroniser le statut d'une campagne depuis Meta ──
export function useSyncCampaignStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ campaign_id }) => {
      const res = await base44.functions.invoke("manageMetaCampaign", {
        action: "sync_campaign_status",
        campaign_id,
      });
      if (res.data?.error) throw new Error(res.data.error);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["meta-campaigns"] });
    },
  });
}