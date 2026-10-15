/**
 * Logo block shown at the top of every auth card.
 * The "JT" mark here is a look-alike drawn in SVG. To use the real artwork,
 * replace the <svg> below with: <img className="auth-logo__mark" src="/your-logo.svg" alt="" />
 */
export function AuthLogo() {
  return (
    <div className="auth-logo" aria-label="JT-Code">
      <svg className="auth-logo__mark" viewBox="0 0 100 80" aria-hidden="true">
        <defs>
          <linearGradient id="auth-logo-grad" x1="0" y1="1" x2="1" y2="0">
            <stop offset="0" stopColor="#2f86ff" />
            <stop offset="1" stopColor="#5a3df0" />
          </linearGradient>
        </defs>
        <g transform="skewX(-8) translate(8 0)" fill="url(#auth-logo-grad)">
          <path d="M26 6h20v46c0 16-10 24-26 24H4V60h12c6 0 10-3 10-9z" />
          <path d="M44 6h54v18H86v52H66V24H44z" />
        </g>
      </svg>
      <span className="auth-logo__word">
        JT-<span>CODE</span>
      </span>
    </div>
  );
}
