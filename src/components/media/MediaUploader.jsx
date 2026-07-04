import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Loader2, Upload, X, Film, Plus, Trash2 } from "lucide-react";

const MAX_PHOTO_DIM = 1200;
const PHOTO_QUALITY = 0.8;
const MAX_VIDEO_SIZE = 15 * 1024 * 1024; // 15 MB
const MAX_PHOTOS = 6;

/**
 * Compresse une image côté client avant upload (évite la lenteur de l'app).
 */
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > MAX_PHOTO_DIM || height > MAX_PHOTO_DIM) {
          if (width > height) {
            height = Math.round((height * MAX_PHOTO_DIM) / width);
            width = MAX_PHOTO_DIM;
          } else {
            width = Math.round((width * MAX_PHOTO_DIM) / height);
            height = MAX_PHOTO_DIM;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) return reject(new Error("Compression échouée"));
            resolve(new File([blob], file.name.replace(/\.\w+$/, ".jpg"), { type: "image/jpeg" }));
          },
          "image/jpeg",
          PHOTO_QUALITY
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * MediaUploader — gestion multi-photos + vidéo côté partenaire.
 * Props: photos (array), videoUrl (string), onChange({ photos, video_url })
 */
export default function MediaUploader({ photos = [], videoUrl = "", onChange }) {
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [uploadingVideo, setUploadingVideo] = useState(false);
  const [error, setError] = useState("");
  const photoInputRef = useRef(null);
  const videoInputRef = useRef(null);

  const notifyChange = (newPhotos, newVideo) => {
    onChange({ photos: newPhotos, video_url: newVideo });
  };

  const handleAddPhotos = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setError("");
    if (photos.length + files.length > MAX_PHOTOS) {
      setError(`Maximum ${MAX_PHOTOS} photos`);
    }

    setUploadingPhoto(true);
    try {
      // Upload séquentiel (évite timeouts/crashes sur Android — voir dead_ends)
      const newUrls = [];
      for (const file of files.slice(0, MAX_PHOTOS - photos.length)) {
        const compressed = await compressImage(file);
        const { file_url } = await base44.integrations.Core.UploadFile({ file: compressed });
        newUrls.push(file_url);
      }
      notifyChange([...photos, ...newUrls], videoUrl);
    } catch (err) {
      setError("Erreur lors de l'upload d'une photo");
    }
    setUploadingPhoto(false);
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleDeletePhoto = (idx) => {
    const newPhotos = photos.filter((_, i) => i !== idx);
    notifyChange(newPhotos, videoUrl);
  };

  const handleAddVideo = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError("");
    if (file.size > MAX_VIDEO_SIZE) {
      setError("Vidéo trop lourde (max 15 Mo)");
      if (videoInputRef.current) videoInputRef.current.value = "";
      return;
    }

    setUploadingVideo(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      notifyChange(photos, file_url);
    } catch (err) {
      setError("Erreur lors de l'upload de la vidéo");
    }
    setUploadingVideo(false);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const handleDeleteVideo = () => {
    notifyChange(photos, "");
  };

  return (
    <div className="space-y-3">
      {/* Photos */}
      <div>
        <label className="text-xs font-semibold text-gray-600">Photos ({photos.length}/{MAX_PHOTOS})</label>
        <div className="flex gap-2 mt-1.5 flex-wrap">
          {photos.map((url, i) => (
            <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden bg-gray-50 group flex-shrink-0">
              <img src={url} alt={`Photo ${i + 1}`} className="w-full h-full object-cover" />
              {i === 0 && (
                <span className="absolute top-1 left-1 text-[8px] font-bold bg-primary text-white px-1.5 py-0.5 rounded">
                  Principale
                </span>
              )}
              <button
                type="button"
                onClick={() => handleDeletePhoto(i)}
                className="absolute top-1 right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 active:scale-90 transition-transform"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}

          {photos.length < MAX_PHOTOS && (
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              disabled={uploadingPhoto}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors flex-shrink-0"
            >
              {uploadingPhoto ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  <Plus className="w-5 h-5" />
                  <span className="text-[8px] font-bold mt-0.5">Photo</span>
                </>
              )}
            </button>
          )}
          <input
            ref={photoInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleAddPhotos}
            className="hidden"
            disabled={uploadingPhoto}
          />
        </div>
      </div>

      {/* Vidéo */}
      <div>
        <label className="text-xs font-semibold text-gray-600">Vidéo courte (max 15 Mo)</label>
        <div className="mt-1.5">
          {videoUrl ? (
            <div className="relative w-full max-w-[200px] rounded-xl overflow-hidden bg-gray-900">
              <video src={videoUrl} className="w-full h-28 object-cover" controls preload="metadata" />
              <button
                type="button"
                onClick={handleDeleteVideo}
                className="absolute top-1 right-1 w-7 h-7 rounded-full bg-red-500 text-white flex items-center justify-center opacity-90 active:scale-90 transition-transform"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              disabled={uploadingVideo}
              className="w-full h-20 rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center text-gray-400 hover:border-purple-300 hover:text-purple-400 transition-colors"
            >
              {uploadingVideo ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Film className="w-5 h-5" />
                  <span className="text-xs font-bold mt-1">Ajouter une vidéo</span>
                </>
              )}
            </button>
          )}
          <input
            ref={videoInputRef}
            type="file"
            accept="video/*"
            onChange={handleAddVideo}
            className="hidden"
            disabled={uploadingVideo}
          />
        </div>
      </div>

      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}