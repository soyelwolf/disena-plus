// Stroke icons used across the app shell (drawn to match the Figma's line icons).

const PATHS = {
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  cursos: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  manuales: <path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2zM22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" />,
  lineamientos: <><path d="M5 4a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2z" /><path d="M5 20a2 2 0 0 0 2 2h12v-4" /></>,
  tutoriales: <><circle cx="12" cy="12" r="9" /><path d="m10 8 6 4-6 4z" /></>,
  soporte: <path d="M6 3h12v18l-6-4-6 4z" />,
  datos: <><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  chevronDown: <path d="m6 9 6 6 6-6" />,
  chevronRight: <path d="m9 6 6 6-6 6" />,
  arrowRight: <path d="M5 12h14m-6-6 6 6-6 6" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 8h.01M11 12h1v5h1" /></>,
  alert: <><path d="M12 3 2 21h20z" /><path d="M12 10v4M12 17h.01" /></>,
  spinner: <path d="M21 12a9 9 0 1 1-6.2-8.6" />,
  logout: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  check: <path d="m5 12 5 5 9-10" />,
  listaVinetas: <><path d="M9 6h11M9 12h11M9 18h11" /><circle cx="4.5" cy="6" r="1" /><circle cx="4.5" cy="12" r="1" /><circle cx="4.5" cy="18" r="1" /></>,
  listaNumerada: <><path d="M10 6h10M10 12h10M10 18h10" /><path d="M4 4.5h1V9M3.5 9h2.5M3.5 14.5c.4-.6 2.5-.8 2.5.5 0 1-2.5 1.8-2.5 3h2.6" /></>,
  borrarFormato: <path d="M6 5h12M10 5 7 19M14 5l-1.2 6M4 20 20 4" />,
  indent: <path d="M3 5h18M11 10h10M11 14h10M3 19h18M3 9l4 3-4 3z" />,
  outdent: <path d="M3 5h18M11 10h10M11 14h10M3 19h18M7 9l-4 3 4 3z" />,
  tabla: <><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 10h18M3 15h18M9 4v16M15 4v16" /></>,
  download: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  checkCircle: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  video: <><rect x="2" y="6" width="14" height="12" rx="2" /><path d="m16 10 6-3v10l-6-3" /></>,
  lock: <><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  pencil: <path d="M4 20h4L19 9l-4-4L4 16z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />,
  dots: <><circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" /></>,
  chevronLeft: <path d="m15 6-6 6 6 6" />,
  chevronUp: <path d="m6 15 6-6 6 6" />,
  comment: <path d="M4 5h16v11H9l-5 4z" />,
  sparkles: <><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" /><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z" /></>,
  target: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></>,
  clipboard: <><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4h6v3H9zM9 12h6M9 16h4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  flow: <><circle cx="6" cy="6" r="2.5" /><circle cx="18" cy="18" r="2.5" /><path d="M8.5 6H14a4 4 0 0 1 4 4v5.5" /></>,
} as const

export type IconName = keyof typeof PATHS

interface IconProps {
  name: IconName
  size?: number
  strokeWidth?: number
  className?: string
}

export default function Icon({ name, size = 20, strokeWidth = 1.8, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {PATHS[name]}
    </svg>
  )
}
