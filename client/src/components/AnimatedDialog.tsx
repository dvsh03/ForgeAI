import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

interface AnimatedDialogProps {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
}

export default function AnimatedDialog({ title, description, onClose, children }: AnimatedDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCloseRef.current();
    };
    window.addEventListener('keydown', onKeyDown);
    dialogRef.current?.querySelector<HTMLElement>('input, select, textarea, button')?.focus();
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  return (
    <div
      className="dialog-backdrop fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="animated-dialog-title"
        className="dialog-panel w-full max-w-lg overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900 shadow-2xl"
      >
        <header className="flex items-start justify-between border-b border-zinc-800 px-5 py-4">
          <div>
            <h2 id="animated-dialog-title" className="text-sm font-semibold text-zinc-100">{title}</h2>
            {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
          </div>
          <button type="button" aria-label="Close dialog" onClick={onClose} className="rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200">
            <X className="h-4 w-4" />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
