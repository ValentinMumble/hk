import {useEffect, type ReactNode} from 'react';

type SheetProps = {title: string; onClose: () => void; children: ReactNode};

/** A full-height glass panel sliding over the current tab, closed with the ✕ or Escape. */
export const Sheet = ({title, onClose, children}: SheetProps) => {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ('Escape' === event.key) onClose();
    };
    window.addEventListener('keydown', onKey);

    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="sheet glass" role="dialog" aria-label={title}>
      <header className="panel-header">
        <h2>{title}</h2>
        <button type="button" className="status" aria-label="Close" onClick={onClose}>
          ✕
        </button>
      </header>
      {children}
    </div>
  );
};
