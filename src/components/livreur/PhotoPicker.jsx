import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, Images, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * PhotoPicker — boutons caméra + galerie fiables sur Android/iOS/web
 * Props:
 * - label: string (titre affiché au-dessus)
 * - value: string|null (URL actuelle)
 * - onChange: (url: string) => void
 * - darkMode: bool (style fond sombre pour onboarding)
 */
export default function PhotoPicker({ label, value, onChange, darkMode = false }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    // Vérification basique type
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image");
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      onChange(file_url);
    } catch {
      toast.error("Erreur lors de l'envoi de la photo. Réessayez.");
    } finally {
      setUploading(false);
    }
  };

  const openCamera = () => {
    if (!cameraRef.current) return;
    cameraRef.current.value = "";
    cameraRef.current.click();
  };

  const openGallery = () => {
    if (!galleryRef.current) return;
    galleryRef.current.value = "";
    galleryRef.current.click();
  };

  // Inputs cachés — séparés pour camera vs galerie
  const hiddenInputs = (
    <>
      {/* Caméra : capture="environment" */}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
      {/* Galerie : PAS de capture pour ouvrir la galerie */}
      <input
        ref={galleryRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFile(e.target.files?.[0])}
      />
    </>
  );

  const base = darkMode
    ? "rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 h-11"
    : "rounded-xl border font-semibold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 h-10";

  const btnCamera = darkMode
    ? `${base} flex-1 border-zinc-600 bg-zinc-900 text-gray-300 active:bg-zinc-800`
    : `${base} flex-1 border-dashed border-gray-300 text-gray-500 active:bg-gray-50`;

  const btnGallery = darkMode
    ? `${base} flex-1 border-zinc-600 bg-zinc-900 text-gray-300 active:bg-zinc-800`
    : `${base} flex-1 border-dashed border-gray-300 text-gray-500 active:bg-gray-50`;

  const labelClass = darkMode
    ? "block text-xs text-gray-400 mb-1"
    : "block text-xs text-gray-400 mb-1";

  return (
    <div>
      {hiddenInputs}
      <span className={labelClass}>{label}</span>

      {uploading ? (
        <div className={`flex items-center justify-center gap-2 h-11 rounded-xl ${darkMode ? "bg-zinc-900 border border-zinc-700" : "border border-gray-200 bg-gray-50"}`}>
          <Loader2 className={`w-4 h-4 animate-spin ${darkMode ? "text-gray-400" : "text-gray-400"}`} />
          <span className="text-xs text-gray-400">Envoi en cours...</span>
        </div>
      ) : value ? (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt="aperçu"
            className="w-16 h-16 rounded-xl object-cover border border-gray-300"
            onError={(e) => { e.target.style.display = "none"; }}
          />
          <button
            type="button"
            onClick={openGallery}
            className={`flex items-center gap-1 text-xs underline ${darkMode ? "text-red-400" : "text-primary"}`}
          >
            <RefreshCw className="w-3 h-3" /> Changer
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" onClick={openCamera} className={btnCamera}>
            <Camera className="w-4 h-4" />
            Appareil photo
          </button>
          <button type="button" onClick={openGallery} className={btnGallery}>
            <Images className="w-4 h-4" />
            Galerie
          </button>
        </div>
      )}
    </div>
  );
}