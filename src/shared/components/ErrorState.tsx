import { AlertTriangle, RotateCw } from 'lucide-react';
import { Button } from './Button';

interface ErrorStateProps {
  title?: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export function ErrorState({ title = 'Something went wrong', description, onRetry, retryLabel = 'Try again' }: ErrorStateProps) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state-icon" aria-hidden>
        <AlertTriangle size={28} className="text-destructive" />
      </div>
      <h3 className="error-state-title">{title}</h3>
      {description && <p className="error-state-description">{description}</p>}
      {onRetry && (
        <Button variant="outline" onClick={onRetry} className="mt-2">
          <RotateCw size={16} aria-hidden className="mr-2" />
          {retryLabel}
        </Button>
      )}
    </div>
  );
}