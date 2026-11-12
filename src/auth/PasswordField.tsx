import i18n from '@/i18n/config'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { useState } from 'react'

interface PasswordFieldProps {
  id: string
  label: string
  value: string
  placeholder: string
  onChange: (value: string) => void
  autoComplete?: string
  error?: string
}

export default function PasswordField({
  id,
  label,
  value,
  placeholder,
  onChange,
  autoComplete,
  error,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false)
  const [hasValue, setHasValue] = useState(value.length > 0)

  return (
    <div className="field-group">
      <label htmlFor={id} className="field-label">{label}</label>
      <div className={`input-wrapper ${hasValue ? 'input-wrapper--has-value' : ''} ${error ? 'input-wrapper--error' : ''}`}>
        <LockKeyhole size={18} className="input-wrapper__icon" />
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          placeholder={placeholder}
          onChange={(event) => {
            onChange(event.target.value)
            setHasValue(event.target.value.length > 0)
          }}
          autoComplete={autoComplete}
          aria-invalid={error ? true : undefined}
          required
        />
        <button
          type="button"
          className="icon-button"
          onClick={() => setVisible((current) => !current)}
          aria-label={visible ? i18n.t('common.hidePassword') : i18n.t('common.showPassword')}
        >
          {visible ? <EyeOff size={18} /> : <Eye size={18} />}
        </button>
      </div>
      {error && <p className="field-error">{error}</p>}
    </div>
  )
}
