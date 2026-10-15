import { Check, X } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
}

/**
 * Generic placeholder criteria — swap these to match the project's
 * actual validation in signup/schema.ts so this never shows "met"
 * for something the backend would still reject.
 */
const RULES: { label: string; test: (pw: string) => boolean }[] = [
  { label: 'At least 8 characters', test: (pw) => pw.length >= 8 },
  { label: 'One uppercase letter', test: (pw) => /[A-Z]/.test(pw) },
  { label: 'One number', test: (pw) => /[0-9]/.test(pw) },
  { label: 'One special character', test: (pw) => /[^A-Za-z0-9]/.test(pw) },
];

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  if (!password) return null;

  return (
    <ul className="password-strength" aria-label="Password requirements">
      {RULES.map((rule) => {
        const met = rule.test(password);
        return (
          <li key={rule.label} className={met ? 'is-met' : ''}>
            {met ? <Check size={13} aria-hidden /> : <X size={13} aria-hidden />}
            <span>{rule.label}</span>
          </li>
        );
      })}
    </ul>
  );
}
