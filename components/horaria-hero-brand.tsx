export default function HorariaHeroBrand() {
  return (
    <div className="horaria-hero-brand" aria-label="Horária">
      <span className="horaria-hero-mark-wrap">
        <svg
          className="horaria-hero-mark"
          viewBox="0 0 220 240"
          role="img"
          aria-label="Símbolo Horária"
        >
          <g fill="currentColor">
            <path d="M8,0 H70 V102 L0,142 V8 Q0,0 8,0 Z" />
            <path d="M0,170 L70,130 V232 Q70,240 62,240 H8 Q0,240 0,232 Z" />
            <g transform="rotate(180 110 120)">
              <path d="M8,0 H70 V102 L0,142 V8 Q0,0 8,0 Z" />
              <path d="M0,170 L70,130 V232 Q70,240 62,240 H8 Q0,240 0,232 Z" />
            </g>
            <circle cx="86" cy="122" r="12" />
            <circle cx="112" cy="122" r="12" />
            <circle cx="138" cy="122" r="12" />
          </g>
        </svg>
      </span>
      <span className="horaria-hero-wordmark">Horária</span>
    </div>
  );
}
