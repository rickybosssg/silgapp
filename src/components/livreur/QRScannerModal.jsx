import React, { useEffect, useState } from "react";
import { X, Camera, Keyboard, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { getNativeCurrentPosition, scanNativeQrCode } from "@/lib/nativeAndroid";

export default function QRScannerModal({ course, type, onSuccess, onClose, livreurLat, livreurLng }) {
  const [mode, setMode] = useState("camera");
  const [code4, setCode4] = useState("");
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (mode === "camera") {
      startNativeScan();
    }
  }, [mode]);

  const lastKnownGps = () => {
    if (livreurLat && livreurLng && !Number.isNaN(Number(livreurLat)) && !Number.isNaN(Number(livreurLng))) {
      return { latitude: Number(livreurLat), longitude: Number(livreurLng), source: "last-known" };
    }
    return null;
  };

  const getValidationGps = async () => {
    const fallback = lastKnownGps();
    const timeoutMs = fallback ? 2500 : 5000;
    const timeoutGps = new Promise((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    });

    try {
      const freshGps = await Promise.race([
        getNativeCurrentPosition({ timeout: timeoutMs, maximumAge: 10000 }),
        timeoutGps,
      ]);
      return freshGps || fallback;
    } catch (_) {
      return fallback;
    }
  };

  const startNativeScan = async () => {
    if (scanning || verifying) return;
    setScanning(true);
    try {
      const value = await scanNativeQrCode();
      await verifyCode(value, "qr");
    } catch (err) {
      const message = err?.message || String(err);
      if (!/annule/i.test(message)) {
        toast.error("Impossible d'ouvrir le scanner QR Android");
      }
      setMode("code");
    } finally {
      setScanning(false);
    }
  };

  const verifyCode = async (value, method) => {
    if (verifying) return;
    setVerifying(true);
    const startedAt = Date.now();
    try {
      const gpsStartedAt = Date.now();
      const gps = await getValidationGps();
      const gpsMs = Date.now() - gpsStartedAt;
      if (!gps?.latitude || !gps?.longitude) {
        toast.error("GPS requis pour valider cette etape. Activez la localisation et reessayez.");
        return;
      }

      const networkStartedAt = Date.now();
      const res = await base44.functions.invoke("validateQRCode", {
        course_id: course.id,
        type,
        value,
        method,
        latitude: gps.latitude,
        longitude: gps.longitude,
      });
      console.info("[QRScanner] validation timing", {
        type,
        method,
        gps_ms: gpsMs,
        network_ms: Date.now() - networkStartedAt,
        total_ms: Date.now() - startedAt,
        gps_source: gps.source || "fresh",
      });

      const data = res?.data;
      if (data?.success) {
        setResult("success");
        const courseData = {
          ...data.course,
          prix_final: data.prix_final ?? data.course?.prix_final,
          distance_reelle_km: data.distance_km ?? data.course?.distance_reelle_km,
          montant_livreur: data.montant_livreur ?? data.course?.montant_livreur,
          commission_silga: data.commission_silga ?? data.course?.commission_silga,
          latitude_livraison: gps.latitude,
          longitude_livraison: gps.longitude,
        };
        setTimeout(() => onSuccess(courseData), 700);
      } else {
        setResult("error");
        setTimeout(() => setResult(null), 1600);
      }
    } catch (err) {
      console.error("Erreur validation QR:", err);
      setResult("error");
      setTimeout(() => setResult(null), 1600);
    } finally {
      setVerifying(false);
    }
  };

  const handleCodeManuel = async () => {
    if (code4.length !== 4) {
      toast.error("Entrez un code a 4 chiffres");
      return;
    }
    await verifyCode(code4, "manual_code");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-3"
      style={{ background: "rgba(0,0,0,0.9)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-black text-base">
              {type === "pickup" ? "Scanner pour recuperer" : "Scanner pour livrer"}
            </p>
            <p className="text-white/60 text-xs mt-0.5">
              QR code ou code PIN du client
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {result === "success" && (
          <div className="p-8 text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <p className="text-xl font-black text-green-700">
              {type === "pickup" ? "Colis recupere !" : "Livraison confirmee !"}
            </p>
          </div>
        )}

        {result === "error" && (
          <div className="p-8 text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <p className="text-xl font-black text-red-600">Code invalide</p>
            <p className="text-sm text-gray-500">Ce code ne correspond pas a cette course</p>
          </div>
        )}

        {!result && (
          <>
            <div className="flex border-b">
              <button
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                  mode === "camera" ? "border-b-2 border-primary text-primary" : "text-gray-400"
                }`}
                onClick={() => setMode("camera")}
              >
                <Camera className="w-4 h-4" /> Scanner QR
              </button>
              <button
                className={`flex-1 py-3 text-sm font-semibold flex items-center justify-center gap-2 transition-colors ${
                  mode === "code" ? "border-b-2 border-primary text-primary" : "text-gray-400"
                }`}
                onClick={() => setMode("code")}
              >
                <Keyboard className="w-4 h-4" /> Code PIN
              </button>
            </div>

            {mode === "camera" && (
              <div className="p-6 space-y-4 text-center">
                <div className="w-20 h-20 rounded-3xl bg-gray-900 flex items-center justify-center mx-auto">
                  {scanning || verifying
                    ? <Loader2 className="w-9 h-9 text-white animate-spin" />
                    : <Camera className="w-9 h-9 text-white" />}
                </div>
                <p className="text-sm text-gray-600">
                  Le scanner Android doit s'ouvrir automatiquement.
                </p>
                <button
                  type="button"
                  onClick={startNativeScan}
                  disabled={scanning || verifying}
                  className="w-full h-13 rounded-2xl bg-gray-900 text-white font-black disabled:opacity-60"
                >
                  {scanning || verifying ? "Scan en cours..." : "Ouvrir le scanner"}
                </button>
              </div>
            )}

            {mode === "code" && (
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <p className="text-base font-bold text-gray-800 mb-1">Code a 4 chiffres</p>
                  <p className="text-xs text-gray-500">
                    Demandez le code au {type === "pickup" ? "client expediteur" : "destinataire"}
                  </p>
                </div>
                <Input
                  type="number"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={4}
                  placeholder="0000"
                  value={code4}
                  onChange={(e) => setCode4(e.target.value.slice(0, 4))}
                  className="text-center text-4xl font-black h-20 rounded-2xl border-2 border-gray-200 focus:border-primary tracking-[0.5em]"
                  autoFocus
                />
                <button
                  className="w-full h-14 rounded-2xl bg-gradient-to-b from-primary to-red-700 text-white font-black text-base shadow-lg shadow-red-200 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  onClick={handleCodeManuel}
                  disabled={code4.length !== 4 || verifying}
                >
                  {verifying ? <Loader2 className="w-5 h-5 animate-spin" /> : "Valider le code"}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
