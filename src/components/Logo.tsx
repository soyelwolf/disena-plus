import type { CSSProperties } from 'react'

interface LogoProps {
  fontSize?: string | number
  style?: CSSProperties
}

/**
 * Text-based wordmark — no background by design, so it drops cleanly onto any
 * surface (matches the brand mark: dark teal "DISEÑA" + black "+").
 */
export default function Logo({ fontSize = '1.25rem', style }: LogoProps) {
  return (
    <span
      style={{
        fontFamily: 'var(--font-heading)',
        fontWeight: 800,
        fontSize,
        letterSpacing: '-0.01em',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      <span style={{ color: 'var(--color-primary)' }}>Diseña</span>
      <span style={{ color: '#161616' }}>+</span>
    </span>
  )
}
