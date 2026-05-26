import React, { useState, useEffect, useRef } from "react";
import { X, Camera, Keyboard, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";

/**
 * Modal de scan QR (caméra) + fallback code 4 chiffres
 * Props :
 *   course        — objet course
 *   type          — "pickup" | "delivery"
 *   onSuccess(courseData) — appelé quand validation OK
 *   onClose()     — fermer le modal
 */
export default function QRScannerModal({ course, type, onSuccess, onClose }) {
  const [mode, setMode] = useState("camera"); // "camera" | "code"
  const [code4, setCode4] = useState("");
  const [scanning, setScanning] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [result, setResult] = useState(null); // "success" | "error"
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);
  const canvasRef = useRef(null);

  const label = type === "pickup" ? "récupération" : "livraison";

  // Démarrer la caméra
  useEffect(() => {
    if (mode !== "camera") {
      stopCamera();
      return;
    }
    startCamera();
    return () => stopCamera();
  }, [mode]);

  const startCamera = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      toast.error("Caméra non disponible sur cet appareil");
      setMode("code");
      return;
    }
    try {
      setScanning(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 480 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        requestAnimationFrame(scanFrame);
      }
    } catch (err) {
      console.error("Erreur caméra:", err);
      toast.error("Impossible d'accéder à la caméra");
      setScanning(false);
      setMode("code");
    }
  };

  const stopCamera = () => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  // Scan frame par frame avec BarcodeDetector (natif) ou jsQR
  const scanFrame = async () => {
    if (!videoRef.current || !streamRef.current) return;
    const video = videoRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    try {
      // Essayer BarcodeDetector natif (Chrome Android)
      if ("BarcodeDetector" in window) {
        const detector = new window.BarcodeDetector({ formats: ["qr_code"] });
        const codes = await detector.detect(video);
        if (codes.length > 0) {
          const qrValue = codes[0].rawValue;
          stopCamera();
          await verifyCode(qrValue, "qr");
          return;
        }
      } else {
        // Fallback canvas + jsQR dynamique
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          // Import dynamique jsQR (si disponible)
          try {
            const jsQR = (await import("https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js")).default;
            const qrResult = jsQR && jsQR(imageData.data, imageData.width, imageData.height);
            if (qrResult?.data) {
              stopCamera();
              await verifyCode(qrResult.data, "qr");
              return;
            }
          } catch (_) {}
        }
      }
    } catch (_) {}

    animFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const verifyCode = async (value, method) => {
    if (verifying) return;
    setVerifying(true);
    try {
      const res = await base44.functions.invoke("validateQRCode", {
        course_id: course.id,
        type: type,
        value: value,
        method: method, // "qr" | "manual_code"
      });
      const data = res?.data;
      if (data?.success) {
        setResult("success");
        setTimeout(() => {
          onSuccess(data.course || {});
        }, 1200);
      } else {
        setResult("error");
        setTimeout(() => {
          setResult(null);
          if (mode === "camera") startCamera();
        }, 2000);
      }
    } catch (err) {
      console.error("Erreur validation:", err);
      setResult("error");
      setTimeout(() => {
        setResult(null);
        if (mode === "camera") startCamera();
      }, 2000);
    } finally {
      setVerifying(false);
    }
  };

  const handleCodeManuel = async () => {
    if (code4.length !== 4) {
      toast.error("Entrez un code à 4 chiffres");
      return;
    }
    await verifyCode(code4, "manual_code");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center p-3"
      style={{ background: "rgba(0,0,0,0.9)", backdropFilter: "blur(6px)" }}
    >
      <div className="w-full max-w-sm bg-white rounded-3xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 px-5 py-4 flex items-center justify-between">
          <div>
            <p className="text-white font-black text-base">
              {type === "pickup" ? "📦 Scanner pour récupérer" : "✅ Scanner pour livrer"}
            </p>
            <p className="text-white/60 text-xs mt-0.5">
              Scannez le QR code chez {type === "pickup" ? "l'expéditeur" : "le destinataire"}
            </p>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* Résultat */}
        {result === "success" && (
          <div className="p-8 text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-green-500 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-10 h-10 text-white" />
            </div>
            <p className="text-xl font-black text-green-700">
              {type === "pickup" ? "Colis récupéré !" : "Livraison confirmée !"}
            </p>
            <p className="text-sm text-gray-500">Code validé avec succès</p>
          </div>
        )}

        {result === "error" && (
          <div className="p-8 text-center space-y-3">
            <div className="w-20 h-20 rounded-full bg-red-100 flex items-center justify-center mx-auto">
              <XCircle className="w-10 h-10 text-red-500" />
            </div>
            <p className="text-xl font-black text-red-600">Code invalide</p>
            <p className="text-sm text-gray-500">Ce code ne correspond pas à cette course</p>
          </div>
        )}

        {!result && (
          <>
            {/* Tabs */}
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

            {/* Mode Caméra */}
            {mode === "camera" && (
              <div className="p-4 space-y-3">
                <div className="relative bg-black rounded-2xl overflow-hidden aspect-square">
                  <video
                    ref={videoRef}
                    className="w-full h-full object-cover"
                    muted
                    playsInline
                    autoPlay
                  />
                  <canvas ref={canvasRef} className="hidden" />
                  {/* Viseur */}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-48 border-2 border-white/70 rounded-xl relative">
                      <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-lg" />
                      <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-lg" />
                      <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-lg" />
                      <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-lg" />
                      {scanning && (
                        <div className="absolute inset-x-0 top-0 h-0.5 bg-green-400 animate-bounce" style={{ animationDuration: "1.5s" }} />
                      )}
                    </div>
                  </div>
                </div>
                <p className="text-xs text-center text-gray-500">
                  Pointez la caméra vers le QR code du client
                </p>
                {verifying && (
                  <div className="flex items-center justify-center gap-2 text-primary">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Vérification...</span>
                  </div>
                )}
              </div>
            )}

            {/* Mode Code PIN */}
            {mode === "code" && (
              <div className="p-6 space-y-5">
                <div className="text-center">
                  <p className="text-base font-bold text-gray-800 mb-1">
                    Code à 4 chiffres
                  </p>
                  <p className="text-xs text-gray-500">
                    Demandez le code au {type === "pickup" ? "client expéditeur" : "destinataire"}
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
                  {verifying ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle2 className="w-5 h-5" />
                      Valider le code
                    </>
                  )}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}