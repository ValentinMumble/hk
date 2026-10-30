import type {ReactNode} from 'react';

type SheetProps = {title: string; onClose: () => void; children: ReactNode};

/** A sheet that slides up over the app, like iOS's; Done or a tap outside closes it. */
export const Sheet = ({title, onClose, children}: SheetProps) => (
  <>
    <div className="sheet-backdrop" onClick={onClose} />
    <div className="sheet" role="dialog" aria-label={title} data-no-swipe>
      <header className="sheet-bar">
        <span className="grabber" aria-hidden="true" />
        <span />
        <h1>{title}</h1>
        <button type="button" className="sheet-action strong" onClick={onClose}>
          Done
        </button>
      </header>
      {children}
    </div>
  </>
);
