import React from 'react'

// Hand-built SVG chess set. Each piece is drawn in a 45×45 box and shaded with
// gradients + a specular highlight so it reads as a turned 3D piece rather than
// a flat glyph.
const FILL = {
  w: { grad: 'wGrad', stroke: '#5d5750', edge: '#efeae1' },
  b: { grad: 'bGrad', stroke: '#0a0a0a', edge: '#4a4a4a' }
}

function Defs() {
  return (
    <defs>
      <linearGradient id="wGrad" x1="0.25" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#ffffff" />
        <stop offset="55%" stopColor="#f2eee6" />
        <stop offset="100%" stopColor="#c9c2b6" />
      </linearGradient>
      <linearGradient id="bGrad" x1="0.25" y1="0" x2="0.8" y2="1">
        <stop offset="0%" stopColor="#7a7a7a" />
        <stop offset="45%" stopColor="#3c3c3c" />
        <stop offset="100%" stopColor="#111111" />
      </linearGradient>
      <radialGradient id="ground" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0%" stopColor="rgba(0,0,0,.38)" />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
    </defs>
  )
}

const BODY = {
  P: (
    <>
      <circle cx="22.5" cy="13.5" r="5.4" />
      <path d="M18.4 19.2 Q18.6 23.5 15.6 27 h13.8 Q26.4 23.5 26.6 19.2 Z" />
      <path d="M13.2 33.5 Q13.4 28.2 17.4 26.8 h10.2 q4 1.4 4.2 6.7 Z" />
    </>
  ),
  R: (
    <>
      <path d="M11 9.5 h4.6 v3 h3.4 v-3 h4.6 v3 h3.4 v-3 H32 v6.4 H11 Z" />
      <path d="M13.6 16.2 h17.8 l-1.7 12.4 H15.3 Z" />
      <path d="M11.6 28.9 h21.8 l1.6 4.6 H10 Z" />
    </>
  ),
  N: (
    <>
      <path d="M20.6 9.4 c3.6-1.2 8.6.6 10.8 5 2.2 4.4 1.9 9.6 1.1 14.4 H16.4
               c.3-3.4 1.9-5.6 3.6-7.6 -1.5.9-3.2 2-4.8 1.6 -2-.5-2.6-2.9-1.8-4.7
               .9-2 2.6-3.3 3.9-5 .9-1.2 1.4-2.6 3.3-3.7 Z" />
      <circle cx="24.6" cy="15.6" r="1.15" fill="#1b1b1b" stroke="none" />
      <path d="M13.9 30.2 h19.4 l1.5 3.6 H12.4 Z" />
    </>
  ),
  B: (
    <>
      <circle cx="22.5" cy="7.6" r="2.3" />
      <path d="M22.5 10.2 c-5.3 2.4-7.4 8.6-6.2 13.4 h12.4 c1.2-4.8-.9-11-6.2-13.4 Z" />
      <path d="M15.4 24.4 h14.2 l1.2 3.4 H14.2 Z" />
      <path d="M12.6 33.4 q.4-4.6 3.6-5.6 h12.6 q3.2 1 3.6 5.6 Z" />
    </>
  ),
  Q: (
    <>
      <circle cx="9.8" cy="11.4" r="2.1" />
      <circle cx="16.2" cy="8.2" r="2.1" />
      <circle cx="22.5" cy="6.9" r="2.3" />
      <circle cx="28.8" cy="8.2" r="2.1" />
      <circle cx="35.2" cy="11.4" r="2.1" />
      <path d="M10.4 13.2 L13.6 25.4 h17.8 L34.6 13.2 L29.4 18.6 L26.2 9.9
               L22.5 16.4 L18.8 9.9 L15.6 18.6 Z" />
      <path d="M12.8 26.6 h19.4 l1.3 3.4 H11.5 Z" />
      <path d="M11 33.6 q.4-2.6 2.4-3.2 h18.2 q2 .6 2.4 3.2 Z" />
    </>
  ),
  K: (
    <>
      <rect x="21.4" y="3" width="2.2" height="9.4" rx="0.7" />
      <rect x="18.4" y="5.9" width="8.2" height="2.2" rx="0.7" />
      <path d="M12.6 15.2 c4-3.4 15.8-3.4 19.8 0 L30.2 25.6 H14.8 Z" />
      <path d="M13.6 26.8 h17.8 l1.2 3.4 H12.4 Z" />
      <path d="M11.4 33.6 q.4-2.6 2.4-3.2 h17.4 q2 .6 2.4 3.2 Z" />
    </>
  )
}

export default function Piece({ piece }) {
  if (!piece) return null
  const color = piece[0]
  const type = piece[1]
  const f = FILL[color]
  return (
    <svg viewBox="0 0 45 45" className="cpiece" aria-hidden="true">
      <Defs />
      <ellipse cx="22.5" cy="36.4" rx="13.5" ry="3.6" fill="url(#ground)" />
      <g fill={`url(#${f.grad})`} stroke={f.stroke} strokeWidth="1.15"
         strokeLinejoin="round" strokeLinecap="round">
        {BODY[type]}
        <ellipse cx="22.5" cy="35.6" rx="12.4" ry="2.9" />
      </g>
      {/* specular highlight down the left face */}
      <g fill={f.edge} opacity={color === 'w' ? 0.55 : 0.22} stroke="none">
        <ellipse cx="18.6" cy="14.6" rx="1.7" ry="3.4" transform="rotate(-18 18.6 14.6)" />
      </g>
    </svg>
  )
}
