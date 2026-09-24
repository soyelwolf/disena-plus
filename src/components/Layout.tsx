import { useEffect, useRef, useState, type ReactNode } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { rolesLabel, useAuth } from '../shared/AuthContext'
import Icon, { type IconName } from './Icon'
import Logo from './Logo'

interface NavItem {
  to: string
  label: string
  icon: IconName
}

const NAV: NavItem[] = [
  { to: '/cursos', label: 'Cursos', icon: 'cursos' },
  { to: '/manuales', label: 'Manuales', icon: 'manuales' },
  { to: '/lineamientos', label: 'Lineamientos', icon: 'lineamientos' },
  { to: '/tutoriales', label: 'Tutoriales', icon: 'tutoriales' },
  { to: '/soporte', label: 'Soporte', icon: 'soporte' },
]

const ADMIN_NAV: NavItem[] = [{ to: '/datos', label: 'Centro de datos', icon: 'datos' }]

export default function Layout({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isAdmin } = useAuth()

  // The login screen is full-bleed (photo + form), no app chrome.
  if (!isAuthenticated || !user) return <>{children}</>

  return (
    <div className="shell">
      <aside className="shell-sidebar" aria-label="Menú principal">
        <button className="shell-menu-btn" aria-label="Menú">
          <Icon name="menu" size={28} strokeWidth={2} />
        </button>
        <nav className="shell-nav">
          {NAV.map(item => (
            <SideLink key={item.to} item={item} />
          ))}
          {isAdmin && (
            <>
              <div className="shell-nav-sep" />
              {ADMIN_NAV.map(item => (
                <SideLink key={item.to} item={item} />
              ))}
            </>
          )}
        </nav>
      </aside>

      <div className="shell-body">
        <header className="shell-header">
          <Logo fontSize={30} />
          <UserMenu nombre={user.nombre} rol={rolesLabel(user.roles)} />
        </header>
        <main className="shell-main">{children}</main>
      </div>
    </div>
  )
}

function SideLink({ item }: { item: NavItem }) {
  return (
    <NavLink to={item.to} className={({ isActive }) => `shell-nav-link${isActive ? ' active' : ''}`}>
      <Icon name={item.icon} size={22} />
      <span style={{ textAlign: 'center', lineHeight: 1.2, padding: '0 4px' }}>{item.label}</span>
    </NavLink>
  )
}

function UserMenu({ nombre, rol }: { nombre: string; rol: string }) {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const iniciales = nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0])
    .join('')
    .toUpperCase()

  return (
    <div className="shell-user" ref={ref}>
      <button className="shell-user-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(o => !o)}>
        <span style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: 15 }}>
            Hola, <b>{nombre}</b>
          </span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{rol}</span>
        </span>
        <span className="shell-avatar">{iniciales}</span>
        <span style={{ color: 'var(--color-primary)', display: 'flex' }}>
          <Icon name="chevronDown" size={18} strokeWidth={2} />
        </span>
      </button>
      {open && (
        <div className="shell-user-menu" role="menu">
          <button
            role="menuitem"
            onClick={() => {
              logout()
              navigate('/')
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 10 }}
          >
            <Icon name="logout" size={18} />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  )
}
