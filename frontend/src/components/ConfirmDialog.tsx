import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Custom confirmation modal. For destructive actions pass `confirmWord` — the
 * confirm button stays disabled until the user types it exactly (defence
 * against an accidental click). Rendered in a portal so it overlays everything.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmer',
  cancelLabel = 'Annuler',
  confirmWord,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmWord?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState('');

  // Reset the typed guard whenever the dialog (re)opens, and close on Escape.
  useEffect(() => {
    if (open) setTyped('');
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  const ready = !confirmWord || typed.trim() === confirmWord;

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-ink/50 p-4 backdrop-blur-sm"
      onClick={() => !busy && onCancel()}
    >
      <div
        className="w-full max-w-md rounded-2xl bg-cream p-6 shadow-2xl ring-1 ring-ink/10"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className={`font-display text-xl font-bold ${danger ? 'text-red-700' : 'text-ink'}`}>
          {title}
        </h2>
        <div className="mt-2 text-sm text-mocha">{message}</div>

        {confirmWord && (
          <div className="mt-4">
            <label className="label">
              Tapez <span className="font-mono font-bold text-ink">{confirmWord}</span> pour confirmer
            </label>
            <input
              autoFocus
              className="input"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
            />
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <button onClick={onCancel} disabled={busy} className="btn-ghost">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || !ready}
            className={danger ? 'btn-danger' : 'btn-primary'}
          >
            {busy ? '…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
