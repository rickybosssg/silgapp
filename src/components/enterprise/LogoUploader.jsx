import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, ImagePlus, Loader2, Trash2, Building2 } from "lucide-react";

/**
 * LogoUploader — Sélection et upload de logo entreprise (caméra + galerie).
 * - UploadPublicFile → URL publique permanente stockée dans Enterprise.logo_url.
 * - Compatible Android (Capacitor), Web mobile et Web desktop.
 * - Le logo reste optionnel : parent contrôle la valeur via onChange.
 */
export default function LogoUploader({ value, onChange, onError }) {
  const [uploading, setUploading] = useState(false);
  const [localError, setLocalError] = useState("");
  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);

  const doUpload = async (file) => {
    if (!file) return;
    setUploading(true);
    setLocalError("");
    try {
      const res = await base44.integrations.Core.UploadPublicFile({ file });
      const url = res?.file_url;
      if (!url) throw new Error("URL manquante après upload");
      onChange?.(url);
    } catch (err) {
      const msg = "Erreur upload logo: " + (err?.message || "échec");
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleCameraClick = () => {
    cameraInputRef.current?.click();
  };

  const handleGalleryClick = () => {
    galleryInputRef.current?.click();
  };

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
    // reset pour permettre de re-sélectionner le même fichier
    e.target.value = "";
  };

  const handleRemove = () => {
    onChange?.("");
  };

  const error = localError;

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt="Logo"
            className="w-16 h-16 rounded-xl object-cover border bg-gray-50"
          />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleGalleryClick}
              disabled={uploading}
              className="text-xs text-blue-600 font-medium hover:underline disabled:opacity-50"
            >
              {uploading ? "Upload..." : "Modifier le logo"}
            </button>
            <button
              type="button"
              onClick={handleRemove}
              disabled={uploading}
              className="text-xs text-red-500 font-medium hover:underline disabled:opacity-50"
            >
              Supprimer le logo
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-center rounded-xl bg-gray-50 border-2 border-dashed border-gray-200 p-6">
            {uploading ? (
              <div className="flex flex-col items-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
                <span className="text-xs text-gray-500">Upload en cours...</span>
              </div>
            ) : (
              <Building2 className="w-8 h-8 text-gray-300" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCameraClick}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" /> Prendre une photo
            </button>
            <button
              type="button"
              onClick={handleGalleryClick}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              <ImagePlus className="w-4 h-4" /> Galerie
            </button>
          </div>
        </div>
      )}

      {/* Inputs cachés — capture="user" pour la caméra frontale sur mobile */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileSelected}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelected}
      />

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}