import type { ReactNode } from 'react';

type Props = {
  title: string;
  eyebrow?: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ title, eyebrow, description, actions, className = '' }: Props) {
  return (
    <header className={`page-landing-header ${className}`.trim()}>
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h2>{title}</h2>
        {description && <p className="page-header-description">{description}</p>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </header>
  );
}
