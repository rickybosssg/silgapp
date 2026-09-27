import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, ImagePlus, Loader2, User } from "lucide-react";

/**
 * LivreurPhotoUploader — Sélection et upload de photo livreur (caméra + galerie).
 * - UploadPublicFile → URL publique permanente stockée dans Livreur.photo_url.
 * - Adapté de LogoUploader, avec rendu circulaire et icône utilisateur.
 */
export default function LivreurPhotoUploader({ value, onChange, onError }) {
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
      const msg = "Erreur upload photo: " + (err?.message || "échec");
      setLocalError(msg);
      onError?.(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleCameraClick = () => cameraInputRef.current?.click();
  const handleGalleryClick = () => galleryInputRef.current?.click();

  const handleFileSelected = (e) => {
    const file = e.target.files?.[0];
    if (file) doUpload(file);
    e.target.value = "";
  };

  const error = localError;

  return (
    <div className="space-y-2">
      {value ? (
        <div className="flex items-center gap-3">
          <img
            src={value}
            alt="Photo livreur"
            className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 bg-gray-50"
          />
          <div className="flex flex-col gap-1.5">
            <button
              type="button"
              onClick={handleGalleryClick}
              disabled={uploading}
              className="text-xs text-blue-600 font-medium hover:underline disabled:opacity-50"
            >
              {uploading ? "Upload..." : "Modifier la photo"}
            </button>
            <button
              type="button"
              onClick={() => onChange?.("")}
              disabled={uploading}
              className="text-xs text-red-500 font-medium hover:underline disabled:opacity-50"
            >
              Supprimer la photo
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-center rounded-full bg-gray-50 border-2 border-dashed border-gray-200 w-16 h-16 mx-auto">
            {uploading ? (
              <Loader2 className="w-5 h-5 animate-spin text-blue-500" />
            ) : (
              <User className="w-6 h-6 text-gray-300" />
            )}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleCameraClick}
              disabled={uploading}
              className="flex items-center justify-center gap-1.5 py-2 rounded-lg bg-gray-100 text-gray-700 text-xs font-medium hover:bg-gray-200 disabled:opacity-50"
            >
              <Camera className="w-4 h-4" /> Caméra
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