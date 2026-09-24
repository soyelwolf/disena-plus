import type { CSSProperties } from 'react'

interface LogoProps {
  fontSize?: string | number
  style?: CSSProperties
}

/** Text wordmark matching the Figma: heavy green "DISEÑA" + black "+". */
export default function Logo({ fontSize = '1.25rem', style }: LogoProps) {
  return (
    <span className="wordmark" style={{ fontSize, ...style }} aria-label="Diseña+">
      DISEÑA<span className="wordmark-plus">+</span>
    </span>
  )
}
