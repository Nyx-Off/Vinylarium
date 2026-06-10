import { useEffect } from 'react';

interface Props {
  src: string;
  alt?: string;
  onClose: () => void;
  /** When provided, show prev/next arrows and bind ←/→ keys. */
  onPrev?: () => void;
  onNext?: () => void;
}

/** Fullscreen image zoom. Click anywhere or press Escape to close. */
export function Lightbox({ src, alt, onClose, onPrev, onNext }: Props) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && onPrev) onPrev();
      if (e.key === 'ArrowRight' && onNext) onNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[60] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm"
    >
      <img
        src={src}
        alt={alt || ''}
        className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
      />
      {alt && (
        <span className="absolute bottom-5 left-1/2 -translate-x-1/2 rounded-full bg-ink/70 px-3 py-1 text-xs text-cream/85">
          {alt}
        </span>
      )}
      {onPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPrev();
          }}
          className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream/10 text-2xl text-cream/80 hover:bg-cream/20"
          title="Précédente (←)"
        >
          ‹
        </button>
      )}
      {onNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onNext();
          }}
          className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-cream/10 text-2xl text-cream/80 hover:bg-cream/20"
          title="Suivante (→)"
        >
          ›
        </button>
      )}
      <button
        className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-cream/10 text-xl text-cream/80 hover:bg-cream/20"
        title="Fermer (Échap)"
      >
        ✕
      </button>
    </div>
  );
}
