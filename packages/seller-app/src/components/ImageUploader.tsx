'use client';

import { useState, useRef, useCallback, type DragEvent, type ChangeEvent } from 'react';

interface ImageUploaderProps {
  onUpload: (files: File[]) => Promise<string[]>;
  existingImages?: string[];
  translations: {
    drag_drop: string;
    or_browse: string;
    max_size: string;
    uploading: string;
    upload_failed: string;
    remove: string;
  };
}

function resizeImage(file: File, maxDim: number = 1024): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const { width, height } = img;
      if (width <= maxDim && height <= maxDim) {
        resolve(file);
        return;
      }
      const scale = Math.min(maxDim / width, maxDim / height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(width * scale);
      canvas.height = Math.round(height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob(
        (blob) => {
          if (!blob) { resolve(file); return; }
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, '.webp'), { type: 'image/webp' }));
        },
        'image/webp',
        0.85,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); resolve(file); };
    img.src = url;
  });
}

export default function ImageUploader({ onUpload, existingImages = [], translations: t }: ImageUploaderProps) {
  const [images, setImages] = useState<string[]>(existingImages);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (fileArray.length === 0) return;

    setUploading(true);
    setError('');
    try {
      const resized = await Promise.all(fileArray.map((f) => resizeImage(f)));
      const urls = await onUpload(resized);
      setImages((prev) => [...prev, ...urls]);
    } catch {
      setError(t.upload_failed);
    } finally {
      setUploading(false);
    }
  }, [onUpload, t.upload_failed]);

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) handleFiles(e.dataTransfer.files);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files);
    if (fileRef.current) fileRef.current.value = '';
  }

  function removeImage(index: number) {
    setImages((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-4">
      <div
        className={`border-2 border-dashed rounded-2xl p-8 text-center transition-colors ${
          dragOver ? 'border-saffron-400 bg-saffron-500/5' : 'border-surface-border'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        role="region"
        aria-label={t.drag_drop}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          id="image-upload"
          onChange={handleChange}
          aria-label={t.drag_drop}
        />
        <svg className="w-10 h-10 text-ash-500 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M6.75 19.5h10.5a2.25 2.25 0 002.25-2.25V6.75a2.25 2.25 0 00-2.25-2.25H6.75A2.25 2.25 0 004.5 6.75v10.5a2.25 2.25 0 002.25 2.25z" />
        </svg>
        <p className="text-sm text-ash-400 mb-1">{t.drag_drop}</p>
        <label htmlFor="image-upload" className="text-sm text-saffron-400 cursor-pointer hover:underline font-medium">
          {t.or_browse}
        </label>
        <p className="text-xs text-ash-500 mt-2">{t.max_size}</p>
      </div>

      {uploading && (
        <div className="flex items-center gap-2 text-sm text-saffron-400" role="status" aria-live="polite">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          {t.uploading}
        </div>
      )}

      {error && (
        <p className="text-sm text-ember-400" role="alert">{error}</p>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
          {images.map((url, i) => (
            <div key={i} className="relative group aspect-square rounded-xl overflow-hidden border border-surface-border bg-surface-raised">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Product image ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute top-1 right-1 w-7 h-7 bg-abyss/80 rounded-lg flex items-center justify-center text-ember-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity"
                aria-label={`${t.remove} ${i + 1}`}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
