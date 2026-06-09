import { useEffect } from 'react';

/** Fullscreen image zoom. Click anywhere or press Escape to close. */
export function Lightbox({ src, alt, onClose }: { src: string; alt?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

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
      <button
        className="absolute right-5 top-5 flex h-10 w-10 items-center justify-center rounded-full bg-cream/10 text-xl text-cream/80 hover:bg-cream/20"
        title="Fermer (Échap)"
      >
        ✕
      </button>
    </div>
  );
}
