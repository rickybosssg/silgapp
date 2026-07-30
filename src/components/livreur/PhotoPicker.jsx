import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Camera, FileText, Images, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

/**
 * PhotoPicker — boutons caméra + galerie fiables sur Android/iOS/web
 * Props:
 * - label: string (titre affiché au-dessus)
 * - value: string|null (URL actuelle)
 * - onChange: (url: string) => void
 * - darkMode: bool (style fond sombre pour onboarding)
 */
export default function PhotoPicker({ label, value, onChange, darkMode = false, allowPdf = false }) {
  const cameraRef = useRef(null);
  const galleryRef = useRef(null);
  const documentRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [uploadedType, setUploadedType] = useState("");

  const handleFile = async (file) => {
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const isPdf = allowPdf && file.type === "application/pdf";
    if (!isImage && !isPdf) {
      toast.error(allowPdf ? "Sélectionnez une image ou un PDF" : "Veuillez sélectionner une image");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Le fichier ne doit pas dépasser 10 Mo");
      return;
    }
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      if (!file_url) throw new Error("URL de fichier absente");
      setUploadedType(file.type);
      onChange(file_url, { type: file.type, name: file.name });
    } catch {
      toast.error("Erreur lors de l'envoi du fichier. Réessayez.");
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

  const openDocument = () => {
    if (!documentRef.current) return;
    documentRef.current.value = "";
    documentRef.current.click();
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
      {allowPdf && (
        <input
          ref={documentRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0])}
        />
      )}
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
          {uploadedType === "application/pdf" || /\.pdf(?:$|\?)/i.test(value) ? (
            <a
              href={value}
              target="_blank"
              rel="noreferrer"
              className="flex h-16 w-16 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600"
              aria-label="Ouvrir le PDF"
            >
              <FileText className="h-7 w-7" />
            </a>
          ) : (
            <img
              src={value}
              alt="aperçu"
              className="w-16 h-16 rounded-xl object-cover border border-gray-300"
              onError={(e) => { e.target.style.display = "none"; }}
            />
          )}
          <button
            type="button"
            onClick={openGallery}
            className={`flex items-center gap-1 text-xs underline ${darkMode ? "text-red-400" : "text-primary"}`}
          >
            <RefreshCw className="w-3 h-3" /> Changer
          </button>
        </div>
      ) : (
        <div className={`grid gap-2 ${allowPdf ? "grid-cols-3" : "grid-cols-2"}`}>
          <button type="button" onClick={openCamera} className={btnCamera}>
            <Camera className="w-4 h-4" />
            Appareil photo
          </button>
          <button type="button" onClick={openGallery} className={btnGallery}>
            <Images className="w-4 h-4" />
            Galerie
          </button>
          {allowPdf && (
            <button type="button" onClick={openDocument} className={btnGallery}>
              <FileText className="w-4 h-4" />
              PDF
            </button>
          )}
        </div>
      )}
    </div>
  );
}
