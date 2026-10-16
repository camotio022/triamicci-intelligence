import React from 'react';

/**
 * Assinatura compacta inspirada na referência visual fornecida:
 * quadrado verde com prato estilizado e tarja vermelha com TRIAMICCI.
 * Vetorial para manter nitidez em desktop e celular.
 */
export default function TriamicciLogo({ className = '' }) {
  return <svg className={className} viewBox="0 0 445 90" role="img" aria-label="Triamicci" xmlns="http://www.w3.org/2000/svg">
    <rect x="0" y="0" width="88" height="88" rx="7" fill="#007934"/>
    <g fill="none" stroke="#fff" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 44 C20 34 68 33 82 44 C77 48 70 49 66 49" strokeWidth="4.5"/>
      <path d="M20 53 C31 47 59 46 73 51 C63 61 33 63 20 53Z" strokeWidth="2.7"/>
      <path d="M26 53 C40 50 58 50 67 52" strokeWidth="1.8"/>
    </g>
    <rect x="93" y="0" width="352" height="88" rx="7" fill="#A71916"/>
    <text x="107" y="71" fill="#fff" fontFamily="Arial Black, Arial, sans-serif" fontWeight="900" fontSize="58" letterSpacing="-3.4" textLength="320" lengthAdjust="spacingAndGlyphs">TRIAMICCI</text>
    <circle cx="194" cy="17" r="5.6" fill="#00843D"/>
    <circle cx="422" cy="17" r="5.2" fill="none" stroke="#fff" strokeWidth="1.7"/>
  </svg>;
}
