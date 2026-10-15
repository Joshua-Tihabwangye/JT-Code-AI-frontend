import type { InputHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { Phone } from 'lucide-react';
import { Input } from './Input';

interface PhoneNumberInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  helperText?: string;
  dialCode?: string;
}

export function PhoneNumberInput({ dialCode, className, value, ...props }: PhoneNumberInputProps) {
  const hasInternationalValue = typeof value === 'string' && value.trim().startsWith('+');
  const visibleDialCode = hasInternationalValue ? undefined : dialCode;

  return (
    <Input
      {...props}
      value={value}
      type="tel"
      inputMode="tel"
      autoComplete="tel"
      leftIcon={(
        <span className="phone-number-prefix">
          {visibleDialCode && <span className="phone-number-prefix__code">{visibleDialCode}</span>}
          <Phone size={16} aria-hidden="true" />
        </span>
      )}
      className={clsx(visibleDialCode ? '!pl-[6.5rem]' : '!pl-14', className)}
    />
  );
}
