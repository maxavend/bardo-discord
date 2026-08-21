import { Button } from '../ui/button.jsx';

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="bardo-empty-state">
      {Icon ? <span className="bardo-empty-state-icon"><Icon aria-hidden="true" size={18} /></span> : null}
      <div>
        <strong>{title}</strong>
        {description ? <p>{description}</p> : null}
      </div>
      {actionLabel && onAction ? <Button size="compact" variant="ghost" onClick={onAction}>{actionLabel}</Button> : null}
    </div>
  );
}
