import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { RotateCw, X } from 'lucide-react';
import { useDialog } from '../../hooks/useDialog';
import { createProfileThumbnail, drawProfileCrop, type ProfileCrop } from '../../utils/profilePhoto';

interface ProfilePhotoEditorProps {
  source: string;
  onApply: (photo: string) => void;
  onClose: () => void;
}

export function ProfilePhotoEditor({ source, onApply, onClose }: ProfilePhotoEditorProps) {
  const dialogRef = useDialog<HTMLDivElement>({ isOpen: true, onClose });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [crop, setCrop] = useState<ProfileCrop>({ zoom: 1, x: 50, y: 50, rotation: 0 });
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const next = new Image();
    next.onload = () => { if (active) setImage(next); };
    next.onerror = () => { if (active) setError('Could not read this image. Please choose another file.'); };
    next.src = source;
    return () => { active = false; };
  }, [source]);

  useEffect(() => {
    if (!image || !canvasRef.current) return;
    try {
      drawProfileCrop(canvasRef.current, image, crop);
      setError('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not preview your photo.');
    }
  }, [image, crop]);

  return createPortal(
    <div className="fixed inset-0 z-modal flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="profile-photo-editor-title" tabIndex={-1}
        className="w-full max-w-md max-h-[90dvh] overflow-y-auto rounded-3xl border border-line bg-surface-1 p-5 text-content-1 shadow-2xl">
        <div className="flex items-center justify-between gap-3">
          <h2 id="profile-photo-editor-title" className="text-base font-bold">Edit profile picture</h2>
          <button type="button" onClick={onClose} aria-label="Close photo editor" className="rounded-xl p-2"><X className="h-5 w-5" /></button>
        </div>
        <p className="mt-1 text-xs text-content-3">Adjust the crop before applying it to your profile.</p>
        <canvas ref={canvasRef} width={256} height={256} aria-label="Profile picture crop preview"
          className="mx-auto mt-4 aspect-square w-full max-w-48 rounded-2xl border border-line bg-surface-2" />
        <div className="mt-4 space-y-3">
          {([
            ['zoom', 'Zoom', 1, 3, 0.01],
            ['x', 'Horizontal position', 0, 100, 1],
            ['y', 'Vertical position', 0, 100, 1],
          ] as const).map(([key, label, min, max, step]) => (
            <label key={key} className="block text-xs text-content-2">{label}
              <input type="range" min={min} max={max} step={step} value={crop[key]} disabled={!image}
                onChange={event => setCrop(previous => ({ ...previous, [key]: Number(event.target.value) }))}
                className="mt-1 block w-full accent-violet-500" />
            </label>
          ))}
          <button type="button" disabled={!image} onClick={() => setCrop(previous => ({ ...previous, rotation: (previous.rotation + 90) % 360 }))}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 text-xs disabled:opacity-50">
            <RotateCw className="h-4 w-4" />Rotate 90°
          </button>
        </div>
        {error && <p role="alert" className="mt-3 text-xs text-red-500">{error}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="min-h-11 rounded-xl border border-line px-4 text-xs">Cancel</button>
          <button type="button" disabled={!image || Boolean(error)} onClick={() => {
            if (!image) return;
            try {
              onApply(createProfileThumbnail(image, crop));
            } catch (reason) {
              setError(reason instanceof Error ? reason.message : 'Could not prepare your profile photo.');
            }
          }} className="min-h-11 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white disabled:opacity-50">Apply photo</button>
        </div>
      </div>
    </div>, document.body
  );
}
