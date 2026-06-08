import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { getNativePushDebugState, openNativeNotificationSettings, registerPushToken } from "@/lib/notifications";
import { 
  Smartphone, Bell, CheckCircle2, AlertCircle, Clock, 
  RefreshCw, Send, Search, ChevronDown, ChevronUp, Wifi, WifiOff
} from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timeout apres ${ms / 1000}s`)), ms);
    }),
  ]);
}

function readPushDebugEvents() {
  try {
    return JSON.parse(localStorage.getItem("silgapp_push_debug") || "[]").slice(-12);
  } catch (_) {
    return [];
  }
}

function StatutBadge({ statut }) {
  const map = {
    success: "bg-green-100 text-green-700",
    failed:  "bg-red-100 text-red-700",
    pending: "bg-amber-100 text-amber-700",
  };
  const icons = {
    success: <CheckCircle2 className="w-3 h-3" />,
    failed:  <AlertCircle  className="w-3 h-3" />,
    pending: <Clock        className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${map[statut] || "bg-gray-100 text-gray-500"}`}>
      {icons[statut]}
      {statut === "success" ? "OK" : statut === "failed" ? "Échec" : "Pending"}
    </span>
  );
}

function TokenRow({ token }) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const isNative = !token.token?.startsWith("web_");
  const platform = token.platform || "android";

  const handleTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await base44.functions.invoke("envoiNotificationPush", {
        titre: "🔔 Test SILGAPP",
        message: `Test push pour ${token.user_type} — ${new Date().toLocaleTimeString("fr")}`,
        type: "test",
        destinataire_email: token.user_email,
        livreur_id: token.livreur_id || "",
        course_id: "",
      });
      setTestResult({ ok: res.data?.success, data: res.data });
    } catch (e) {
      setTestResult({ ok: false, error: e.message });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
      <button
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 transition-colors text-left"
        onClick={() => setOpen(v => !v)}
      >
        {/* Icône plateforme */}
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
          isNative ? "bg-green-100" : "bg-blue-100"
        }`}>
          {isNative
            ? <Smartphone className="w-4 h-4 text-green-600" />
            : <Wifi className="w-4 h-4 text-blue-600" />}
        </div>

        {/* Infos principales */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-bold text-foreground truncate">{token.user_email}</span>
            <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full ${
              token.user_type === "livreur" ? "bg-orange-100 text-orange-700" :
              token.user_type === "client"  ? "bg-blue-100 text-blue-700" :
              "bg-gray-100 text-gray-600"
            }`}>{token.user_type?.toUpperCase()}</span>
            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
              isNative ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-500"
            }`}>{isNative ? "Android natif" : "Web"}</span>
            {!token.actif && (
              <span className="text-[9px] font-bold bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">EXPIRÉ</span>
            )}
          </div>
          <div className="flex items-center gap-2 mt-0.5">
            {token.derniere_notif_statut && <StatutBadge statut={token.derniere_notif_statut} />}
            {token.derniere_utilisation && (
              <span className="text-[10px] text-muted-foreground">
                Vu le {format(new Date(token.derniere_utilisation), "d MMM · HH:mm", { locale: fr })}
              </span>
            )}
          </div>
        </div>

        {open ? <ChevronUp className="w-4 h-4 text-gray-300 flex-shrink-0" /> : <ChevronDown className="w-4 h-4 text-gray-300 flex-shrink-0" />}
      </button>

      {open && (
        <div className="border-t border-gray-100 bg-gray-50/80 p-3 space-y-3">
          {/* Token FCM */}
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">Token FCM</p>
            <code className="text-[10px] text-gray-600 break-all font-mono bg-white rounded-lg p-2 block border border-gray-100">
              {token.token}
            </code>
          </div>

          {/* Dernière notif */}
          {token.derniere_notif_titre && (
            <div>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-wide mb-1">Dernière notification</p>
              <div className="bg-white rounded-lg p-2 border border-gray-100 flex items-center gap-2">
                <Bell className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-foreground truncate">{token.derniere_notif_titre}</p>
                  {token.derniere_notif_date && (
                    <p className="text-[10px] text-muted-foreground">
                      {format(new Date(token.derniere_notif_date), "d MMM yyyy · HH:mm:ss", { locale: fr })}
                    </p>
                  )}
                </div>
                {token.derniere_notif_statut && <StatutBadge statut={token.derniere_notif_statut} />}
              </div>
            </div>
          )}

          {/* Erreur FCM */}
          {token.fcm_error && (
            <div className="bg-red-50 rounded-lg p-2 border border-red-100">
              <p className="text-[10px] font-black text-red-400 uppercase tracking-wide mb-0.5">Dernière erreur FCM</p>
              <p className="text-xs text-red-700 font-mono break-all">{token.fcm_error}</p>
            </div>
          )}

          {/* Bouton test */}
          <button
            onClick={handleTest}
            disabled={testing || !token.actif}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary text-white text-xs font-bold disabled:opacity-50 active:scale-95 transition-transform"
          >
            {testing
              ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" />Envoi en cours...</>
              : <><Send className="w-3.5 h-3.5" />Envoyer un push de test</>}
          </button>

          {testResult && (
            <div className={`rounded-xl p-2.5 text-xs ${testResult.ok ? "bg-green-50 border border-green-100 text-green-800" : "bg-red-50 border border-red-100 text-red-700"}`}>
              {testResult.ok
                ? `✅ Push envoyé avec succès (${testResult.data?.tokens_sent || 0} token(s))`
                : `❌ Échec : ${testResult.error || JSON.stringify(testResult.data)}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function DiagnosticPushPanel({ defaultSearchEmail = "" }) {
  const [searchEmail, setSearchEmail] = useState(defaultSearchEmail);
  const [filterType, setFilterType] = useState("tous");
  const [firebaseDiag, setFirebaseDiag] = useState(null);
  const [firebaseDiagLoading, setFirebaseDiagLoading] = useState(false);
  const [nativeDiag, setNativeDiag] = useState(null);
  const [nativeDiagLoading, setNativeDiagLoading] = useState(false);

  const { data: tokens = [], isLoading, refetch } = useQuery({
    queryKey: ["notification-tokens-diag"],
    queryFn: () => base44.entities.NotificationToken.list("-derniere_utilisation", 200),
    staleTime: 10000,
  });

  const filtered = tokens.filter(t => {
    const matchEmail = !searchEmail || t.user_email?.toLowerCase().includes(searchEmail.toLowerCase());
    const matchType = filterType === "tous" || t.user_type === filterType;
    return matchEmail && matchType;
  });

  const stats = {
    total: tokens.length,
    actifs: tokens.filter(t => t.actif).length,
    natifs: tokens.filter(t => !t.token?.startsWith("web_") && t.actif).length,
    clients: tokens.filter(t => t.user_type === "client").length,
    livreurs: tokens.filter(t => t.user_type === "livreur").length,
    echecs: tokens.filter(t => t.derniere_notif_statut === "failed").length,
  };

  const handleFirebaseDiagnostic = async () => {
    setFirebaseDiagLoading(true);
    setFirebaseDiag(null);
    try {
      const res = await base44.functions.invoke("diagnosticFirebasePush", {});
      setFirebaseDiag(res.data || res);
    } catch (error) {
      setFirebaseDiag({ success: false, error: error.message });
    } finally {
      setFirebaseDiagLoading(false);
    }
  };

  const handleNativeDiagnostic = async () => {
    setNativeDiagLoading(true);
    setNativeDiag({
      success: false,
      status: "demarrage",
      message: "Diagnostic APK local lance...",
      started_at: new Date().toISOString(),
    });
    try {
      setNativeDiag((current) => ({ ...current, status: "etat_initial" }));
      const before = await withTimeout(getNativePushDebugState(), 4000, "Etat initial Push");

      setNativeDiag((current) => ({ ...current, status: "session_utilisateur", before }));
      const user = await withTimeout(
        base44.auth.me().catch(() => null),
        5000,
        "Lecture utilisateur Base44"
      );

      let token = null;
      let registerError = null;

      try {
        setNativeDiag((current) => ({
          ...current,
          status: "demande_permission_fcm",
          user_email: user?.email || null,
        }));
        token = await withTimeout(
          registerPushToken(null, {
            email: user?.email || "",
            user_email: user?.email || "",
            user_type: user?.role === "admin" ? "admin" : "client",
          }),
          15000,
          "Generation token FCM"
        );
      } catch (error) {
        registerError = error?.message || String(error);
      }

      const after = await withTimeout(getNativePushDebugState(), 4000, "Etat final Push").catch((error) => ({
        error: error?.message || String(error),
      }));

      setNativeDiag({
        success: !!token || !!after.lastNativeToken,
        status: "termine",
        user_email: user?.email || null,
        token_prefix: token ? token.slice(0, 24) : after.lastNativeToken ? after.lastNativeToken.slice(0, 24) : null,
        register_error: registerError,
        environment: after.env,
        permissions: after.permissions,
        has_push_plugin: after.hasPushPlugin,
        last_registration_error: after.lastNativeRegistrationError,
        debug_events: readPushDebugEvents(),
        before,
        after,
      });
      refetch().catch(() => null);
    } catch (error) {
      setNativeDiag({
        success: false,
        status: "erreur",
        error: error?.message || String(error),
        debug_events: readPushDebugEvents(),
      });
    } finally {
      setNativeDiagLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-blue-100 flex items-center justify-center">
            <Bell className="w-4 h-4 text-blue-600" />
          </div>
          <div>
            <p className="font-bold text-foreground text-sm">Diagnostic Push FCM</p>
            <p className="text-[11px] text-muted-foreground">{stats.total} tokens enregistrés</p>
          </div>
        </div>
        <button
          onClick={() => refetch()}
          className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-gray-200 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5 text-gray-600" />
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "Actifs",    val: stats.actifs,   color: "text-green-600", bg: "bg-green-50" },
          { label: "Android",   val: stats.natifs,   color: "text-blue-600",  bg: "bg-blue-50" },
          { label: "Livreurs",  val: stats.livreurs, color: "text-orange-600",bg: "bg-orange-50" },
          { label: "Clients",   val: stats.clients,  color: "text-purple-600",bg: "bg-purple-50" },
          { label: "Échecs",    val: stats.echecs,   color: "text-red-600",   bg: "bg-red-50" },
          { label: "Total",     val: stats.total,    color: "text-gray-600",  bg: "bg-gray-100" },
        ].map(s => (
          <div key={s.label} className={`${s.bg} rounded-xl p-2.5 text-center`}>
            <p className={`text-lg font-black ${s.color}`}>{s.val}</p>
            <p className="text-[9px] text-gray-400 mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-blue-900">Diagnostic Firebase</p>
            <p className="text-[10px] text-blue-700">VÃ©rifie les secrets Base44 et l'accÃ¨s FCM</p>
          </div>
          <button
            onClick={handleFirebaseDiagnostic}
            disabled={firebaseDiagLoading}
            className="px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50"
          >
            {firebaseDiagLoading ? "Test..." : "Tester"}
          </button>
        </div>
        {firebaseDiag && (
          <pre className={`text-[10px] whitespace-pre-wrap break-all rounded-xl p-2 border ${
            firebaseDiag.success ? "bg-green-50 border-green-100 text-green-800" : "bg-red-50 border-red-100 text-red-700"
          }`}>
            {JSON.stringify(firebaseDiag, null, 2)}
          </pre>
        )}
      </div>

      <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-3 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-black text-emerald-900">Diagnostic APK local</p>
            <p className="text-[10px] text-emerald-700">Teste Capacitor, permission notification et token FCM sur ce téléphone</p>
          </div>
          <button
            onClick={handleNativeDiagnostic}
            disabled={nativeDiagLoading}
            className="px-3 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold disabled:opacity-50"
          >
            {nativeDiagLoading ? "Test..." : "Tester APK"}
          </button>
        </div>
        {nativeDiag && (
          <>
            <pre className={`text-[10px] whitespace-pre-wrap break-all rounded-xl p-2 border ${
              nativeDiag.success ? "bg-green-50 border-green-100 text-green-800" : "bg-red-50 border-red-100 text-red-700"
            }`}>
              {JSON.stringify(nativeDiag, null, 2)}
            </pre>
            {!nativeDiag.success && (
              <button
                onClick={() => openNativeNotificationSettings().catch(() => null)}
                className="w-full rounded-xl bg-emerald-700 px-3 py-2 text-xs font-bold text-white"
              >
                Ouvrir les reglages notifications
              </button>
            )}
          </>
        )}
      </div>

      {/* Filtres */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchEmail}
            onChange={e => setSearchEmail(e.target.value)}
            placeholder="Rechercher par email..."
            className="w-full pl-7 pr-3 py-2 rounded-xl border border-gray-200 text-xs bg-white focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1">
          {["tous", "livreur", "client"].map(t => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
                filterType === t
                  ? "bg-primary text-white"
                  : "bg-white border border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {t === "tous" ? "Tous" : t === "livreur" ? "Livreurs" : "Clients"}
            </button>
          ))}
        </div>
      </div>

      {/* Liste */}
      {isLoading ? (
        <div className="text-center py-6 text-sm text-muted-foreground flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin" />Chargement...
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 rounded-2xl border-2 border-dashed border-gray-200">
          <WifiOff className="w-8 h-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm font-bold text-gray-500">Aucun token trouvé</p>
          <p className="text-xs text-gray-400 mt-1">
            Les tokens s'enregistrent au premier lancement de l'APK
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {filtered.map(t => <TokenRow key={t.id} token={t} />)}
        </div>
      )}
    </div>
  );
}
