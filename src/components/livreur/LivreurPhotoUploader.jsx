import React, { useRef, useState } from "react";
import { Camera, X, Upload, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

/**
 * Composant de gestion de photo de profil pour livreurs
 * - Upload depuis galerie
 * - Compression automatique
 * - Preview instantanée
 * - Suppression
 * 
 * @param {string} photoUrl - URL actuelle de la photo
 * @param {string} nomComplet - Nom du livreur (pour fallback initiales)
 * @param {string} livreurId - ID du livreur (optionnel, pour update direct)
 * @param {function} onPhotoChange - Callback quand la photo change
 * @param {boolean} canEdit - Si l'utilisateur peut modifier la photo
 * @param {string} size - Taille : "sm", "md", "lg", "xl"
 */
export default function LivreurPhotoUploader({
  photoUrl,
  nomComplet,
  livreurId,
  onPhotoChange,
  canEdit = false,
  size = "md",
}) {
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState(photoUrl || null);

  // Tailles prédéfinies
  const sizeClasses = {
    sm: "w-8 h-8 text-sm",
    md: "w-12 h-12 text-base",
    lg: "w-14 h-14 text-xl",
    xl: "w-20 h-20 text-2xl",
  };

  const sizeClass = sizeClasses[size] || sizeClasses.md;

  // Fallback : initiales si pas de photo
  const getInitials = () => {
    if (!nomComplet) return "?";
    const parts = nomComplet.trim().split(" ");
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  };

  // Compression image avant upload
  const compressImage = async (file) => {
    return new Promise((resolve) => {
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      const img = new Image();

      img.onload = () => {
        // Max dimensions : 800x800
        let width = img.width;
        let height = img.height;
        const maxSize = 800;

        if (width > height) {
          if (width > maxSize) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          }
        } else {
          if (height > maxSize) {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);

        // Compression JPEG qualité 0.7
        canvas.toBlob(
          (blob) => {
            resolve(new File([blob], file.name, { type: "image/jpeg" }));
          },
          "image/jpeg",
          0.7
        );
      };

      img.src = URL.createObjectURL(file);
    });
  };

  // Gestion upload
  const handlePhotoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validation type
    if (!file.type.startsWith("image/")) {
      toast.error("Veuillez sélectionner une image valide");
      return;
    }

    // Validation taille (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error("L'image ne doit pas dépasser 5MB");
      return;
    }

    setUploading(true);

    try {
      // Compression
      const compressedFile = await compressImage(file);

      // Preview immédiate
      const previewUrlTemp = URL.createObjectURL(compressedFile);
      setPreviewUrl(previewUrlTemp);

      // Upload
      const { file_url } = await base44.integrations.Core.UploadFile({
        file: compressedFile,
      });

      setPreviewUrl(file_url);
      
      // Si livreurId fourni, update direct via la fonction dédiée
      if (livreurId) {
        await base44.functions.invoke('updateLivreurPhoto', {
          livreur_id: livreurId,
          photo_url: file_url
        });
      }
      
      onPhotoChange?.(file_url);
      toast.success("Photo mise à jour ✓");

      // Cleanup preview URL
      URL.revokeObjectURL(previewUrlTemp);
    } catch (error) {
      console.error("Erreur upload photo:", error);
      toast.error("Erreur lors de l'upload");
      setPreviewUrl(photoUrl || null);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Gestion suppression
  const handleRemovePhoto = async () => {
    setPreviewUrl(null);
    
    // Si livreurId fourni, update direct
    if (livreurId) {
      try {
        await base44.functions.invoke('updateLivreurPhoto', {
          livreur_id: livreurId,
          photo_url: null
        });
      } catch (err) {
        console.error("Erreur suppression photo:", err);
      }
    }
    
    onPhotoChange?.(null);
    toast.success("Photo supprimée");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="relative inline-group">
      {/* Photo ou initiales - CLIQUABLE pour uploader */}
      {previewUrl ? (
        <img
          src={previewUrl}
          alt={nomComplet || "Photo livreur"}
          className={`${sizeClass} rounded-full object-cover border-2 border-white shadow-md ${canEdit ? 'cursor-pointer hover:shadow-lg transition-all' : ''}`}
          onError={() => setPreviewUrl(null)}
          onClick={canEdit ? () => fileInputRef.current?.click() : undefined}
        />
      ) : (
        <div
          className={`${sizeClass} rounded-full bg-primary/20 flex items-center justify-center font-bold text-primary border-2 border-white shadow-md ${canEdit ? 'cursor-pointer hover:bg-primary/30 hover:shadow-lg transition-all' : ''}`}
          onClick={canEdit ? () => fileInputRef.current?.click() : undefined}
          title={canEdit ? "Cliquez pour ajouter une photo" : ""}
        >
          {getInitials()}
        </div>
      )}

      {/* Overlay caméra - visible au hover/touch */}
      {canEdit && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 active:opacity-100 transition-opacity cursor-pointer"
            title={uploading ? "Envoi en cours..." : "Changer la photo"}
          >
            {uploading ? (
              <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Camera className="w-6 h-6 text-white" />
            )}
          </button>

          {/* Input file caché */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </>
      )}
    </div>
  );
}