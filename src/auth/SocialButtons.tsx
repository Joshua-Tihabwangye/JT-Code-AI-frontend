import { useTranslation } from 'react-i18next'
interface SocialButtonsProps {
  onGoogle: () => void | Promise<void>
  onGithub: () => void | Promise<void>
  disabled?: boolean
}

function GoogleIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M21.6 12.227c0-.709-.064-1.391-.182-2.045H12v3.868h5.382a4.6 4.6 0 0 1-1.996 3.018v2.509h3.227c1.89-1.741 2.987-4.305 2.987-7.35Z" />
      <path fill="#34A853" d="M12 22c2.7 0 4.964-.895 6.613-2.423l-3.227-2.509c-.895.6-2.041.955-3.386.955-2.605 0-4.809-1.759-5.596-4.123H3.068v2.591A9.997 9.997 0 0 0 12 22Z" />
      <path fill="#FBBC05" d="M6.404 13.9A6.01 6.01 0 0 1 6.09 12c0-.659.114-1.3.314-1.9V7.509H3.068A10.01 10.01 0 0 0 2 12c0 1.614.386 3.141 1.068 4.491L6.404 13.9Z" />
      <path fill="#EA4335" d="M12 5.977c1.468 0 2.786.505 3.823 1.496l2.864-2.864C16.959 2.995 14.695 2 12 2a9.997 9.997 0 0 0-8.932 5.509L6.404 10.1C7.191 7.736 9.395 5.977 12 5.977Z" />
    </svg>
  )
}

function GithubIcon() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .7a11.5 11.5 0 0 0-3.64 22.41c.58.11.79-.25.79-.56v-2.23c-3.23.7-3.91-1.37-3.91-1.37-.53-1.34-1.29-1.7-1.29-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.04 1.78 2.72 1.27 3.38.97.1-.75.41-1.27.74-1.56-2.58-.29-5.29-1.29-5.29-5.72 0-1.26.45-2.3 1.2-3.11-.12-.3-.52-1.48.11-3.08 0 0 .98-.31 3.16 1.19a10.96 10.96 0 0 1 5.76 0c2.18-1.5 3.16-1.19 3.16-1.19.63 1.6.23 2.78.11 3.08.75.81 1.2 1.85 1.2 3.11 0 4.44-2.72 5.42-5.3 5.71.42.36.79 1.07.79 2.16v3.2c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .7Z" />
    </svg>
  )
}

export default function SocialButtons({ onGoogle, onGithub, disabled }: SocialButtonsProps) {
  const { t } = useTranslation()
  return (
    <div className="social-stack">
      <button type="button" className="social-button" onClick={() => void onGoogle()} disabled={disabled}>
        <GoogleIcon />
        <span>{t('signin.continueWith', { provider: 'Google' })}</span>
      </button>
      <button type="button" className="social-button" onClick={() => void onGithub()} disabled={disabled}>
        <GithubIcon />
        <span>{t('signin.continueWith', { provider: 'GitHub' })}</span>
      </button>
    </div>
  )
}
