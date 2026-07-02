import { ReactNode } from 'react';

interface Props {
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: 'sm' | 'md' | 'lg';
}

export function Modal({ title, children, onClose, width = 'md' }: Props) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className={`modal modal-${width}`} role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header className="modal-header">
          <h3>{title}</h3>
          <button type="button" className="icon-button" onClick={onClose} aria-label="關閉">×</button>
        </header>
        <div className="modal-body">{children}</div>
      </section>
    </div>
  );
}
