import { useEffect, useId, useState, type ReactNode } from "react";

const IMAGE_TYPES = "image/png,image/jpeg,image/webp";

/** A neon photo picker in Russian instead of the native «Choose File». The real input stays for keyboard and screen readers. */
export function PhotoPick({ file, onFile, label = "Выбрать фото" }: { file: File | null; onFile: (file: File | null) => void; label?: string }) {
  const id = useId();
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== "function") {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  return (
    <div className="photo-pick">
      <input
        id={id}
        className="photo-pick__input"
        type="file"
        accept={IMAGE_TYPES}
        onChange={(event) => onFile(event.target.files?.[0] ?? null)}
      />
      <label htmlFor={id} className="lx-btn lx-btn--secondary lx-btn--sm photo-pick__btn">
        <span className="lx-btn__in">{file ? "Другое фото" : label}</span>
      </label>
      <span className="photo-pick__name" aria-live="polite">
        {preview ? <img src={preview} width={40} height={40} alt="" /> : null}
        {file ? file.name : "Фото не выбрано"}
      </span>
    </div>
  );
}

/** A neon checkbox: a real input styled with .lx-check. */
export function Check({ checked, onChange, children }: { checked: boolean; onChange: (checked: boolean) => void; children: ReactNode }) {
  return (
    <label className="lx-check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span className="lx-check__box" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

export const TOAST_MS = 3000;

/**
 * A short notice over the screen (position: fixed), gone after {@link TOAST_MS}. The live region
 * is always mounted so screen readers announce each new text; the layout never moves.
 */
export function Toast({ toast, onDone }: { toast: { id: number; text: string } | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDone, TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast, onDone]);
  return (
    <div className="toast-live" role="status" aria-live="polite" aria-atomic="true">
      {toast ? (
        <p key={toast.id} className="toast">
          {toast.text}
        </p>
      ) : null}
    </div>
  );
}
