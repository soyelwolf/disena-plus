import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ROLE_LABELS, ROLES_ASIGNADOS, UTP_DOMAIN, rolesLabel, useAuth, type UserRole } from '../shared/AuthContext'
import Icon from '../components/Icon'
import Logo from '../components/Logo'

const RECORDAR_KEY = 'disena.correo'

function correoGuardado(): string {
  try {
    return localStorage.getItem(RECORDAR_KEY) ?? ''
  } catch {
    return ''
  }
}

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()
  const [correo, setCorreo] = useState(correoGuardado)
  const [recordar, setRecordar] = useState(() => correoGuardado() !== '')
  const [error, setError] = useState<string | null>(null)
  const [enviado, setEnviado] = useState(false)
  const [rolDemo, setRolDemo] = useState<UserRole>('docente')
  const rolesAsignados: UserRole[] | undefined = ROLES_ASIGNADOS[correo.trim().toLowerCase()]

  useEffect(() => {
    document.title = 'Ingresar — Diseña+'
  }, [])

  useEffect(() => {
    if (isAuthenticated) navigate('/cursos', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    const valor = correo.trim().toLowerCase()
    if (!valor) {
      setError('Ingresa tu correo institucional.')
      return
    }
    if (!valor.endsWith(UTP_DOMAIN) || valor.length <= UTP_DOMAIN.length) {
      setError(`Usa tu correo institucional ${UTP_DOMAIN}.`)
      return
    }
    setError(null)
    try {
      if (recordar) localStorage.setItem(RECORDAR_KEY, valor)
      else localStorage.removeItem(RECORDAR_KEY)
    } catch {
      // Storage unavailable — nothing to remember.
    }
    // TODO(auth): send the Supabase magic link here instead of simulating it.
    setEnviado(true)
  }

  return (
    <div className="login">
      <div className="login-photo">
        <img src="/login-hero.webp" alt="Docente presentando frente a la pizarra ante un colega con laptop" />
      </div>

      <div className="login-pane">
        <div className="login-top">
          <Logo fontSize={28} />
          <img src="/logo-utp.webp" alt="Universidad Tecnológica del Perú" style={{ height: 44, width: 'auto' }} />
        </div>

        {!enviado ? (
          <form className="login-form" onSubmit={handleSubmit} noValidate>
            <div>
              <h1 style={{ fontSize: 36, fontWeight: 900, marginBottom: 8 }}>¡Hola!</h1>
              <p style={{ color: '#3d434a' }}>
                Ingresa tu correo institucional para <b>iniciar sesión</b>.
              </p>
            </div>

            <div>
              <label className="field-label" htmlFor="correo">Correo UTP</label>
              <div className={`input-box${error ? ' has-error' : ''}`}>
                <input
                  id="correo"
                  type="email"
                  autoComplete="email"
                  placeholder={`usuario${UTP_DOMAIN}`}
                  value={correo}
                  onChange={e => setCorreo(e.target.value)}
                  aria-invalid={!!error}
                  aria-describedby={error ? 'correo-error' : undefined}
                />
                <span style={{ color: error ? 'var(--color-danger)' : 'var(--color-text-muted)', display: 'flex' }}>
                  <Icon name={error ? 'alert' : 'mail'} size={18} />
                </span>
              </div>
              {error && (
                <p id="correo-error" className="field-error">
                  <Icon name="alert" size={15} />
                  {error}
                </p>
              )}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 400, margin: 0 }}>
              <input
                type="checkbox"
                checked={recordar}
                onChange={e => setRecordar(e.target.checked)}
                style={{ width: 16, height: 16, accentColor: 'var(--color-primary)' }}
              />
              Recordar mi correo en este equipo
            </label>

            <button type="submit" className="btn btn-primary" style={{ height: 48, fontWeight: 700 }}>
              Enviar enlace de acceso
            </button>

            <div className="login-note">
              <span style={{ color: 'var(--color-primary)', display: 'flex', flexShrink: 0, marginTop: 1 }}>
                <Icon name="info" size={18} />
              </span>
              <span>
                Te enviaremos un enlace a tu correo {UTP_DOMAIN}. Ábrelo desde este mismo equipo para entrar; no
                necesitas contraseña.
              </span>
            </div>
          </form>
        ) : (
          <div className="login-form">
            <div>
              <h1 style={{ fontSize: 32, fontWeight: 900, marginBottom: 8 }}>Revisa tu correo</h1>
              <p style={{ color: '#3d434a' }}>
                Enviamos un enlace de acceso a <b>{correo.trim().toLowerCase()}</b>. Puede tardar un minuto en llegar.
              </p>
            </div>

            <div className="login-note" style={{ background: '#fff4e0', color: '#5c3a00' }}>
              <span style={{ display: 'flex', flexShrink: 0, marginTop: 1 }}>
                <Icon name="info" size={18} />
              </span>
              <span>
                <b>Modo demostración:</b> el envío real del correo se activa al conectar el ingreso con la base de datos.
                Por ahora puedes entrar directamente{rolesAsignados ? ' con tus roles asignados' : ' y elegir con qué rol probar la plataforma'}.
              </span>
            </div>

            {rolesAsignados ? (
              <div>
                <span className="field-label">Tus roles</span>
                <p style={{ fontSize: 15 }}>{rolesLabel(rolesAsignados)}</p>
              </div>
            ) : (
              <div>
                <label className="field-label" htmlFor="rol-demo">Entrar como</label>
                <select id="rol-demo" value={rolDemo} onChange={e => setRolDemo(e.target.value as UserRole)} style={{ height: 44 }}>
                  {(Object.keys(ROLE_LABELS) as UserRole[]).map(r => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
            )}

            <button
              className="btn btn-primary"
              style={{ height: 48, fontWeight: 700 }}
              onClick={() => login(correo.trim(), rolesAsignados ?? [rolDemo])}
            >
              Entrar a Diseña+
            </button>
            <button className="btn btn-outline" style={{ height: 44 }} onClick={() => setEnviado(false)}>
              Usar otro correo
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
