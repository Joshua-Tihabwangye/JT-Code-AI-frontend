import { forwardRef, type InputHTMLAttributes } from 'react';
import { Search, X } from 'lucide-react';
import { clsx } from 'clsx';
import { useTranslation } from 'react-i18next';

interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  onClear?: () => void;
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, value, onChange, onClear, placeholder, ...props }, ref) => {
    const { t } = useTranslation();
    return (
    <div className={clsx('search-input', className)}>
      <Search size={16} className="text-muted-foreground" aria-hidden />
      <input
        ref={ref}
        type="search"
        role="searchbox"
        className="search-input-field"
        value={value}
        placeholder={placeholder ?? t('common.search')}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
      {value && (
        <button type="button" className="search-input-clear" aria-label={t('common.clearSearch')} onClick={() => onClear?.() ?? onChange('')}>
          <X size={14} aria-hidden />
        </button>
      )}
    </div>
    );
  },
);
SearchInput.displayName = 'SearchInput';
