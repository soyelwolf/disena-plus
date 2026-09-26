import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { UTP_DOMAIN, normalizarRoles, useAuth } from '../shared/AuthContext'
import { buscarUsuario } from '../shared/academico'
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
  const [validando, setValidando] = useState(false)

  useEffect(() => {
    document.title = 'Ingresar — Diseña+'
  }, [])

  useEffect(() => {
    if (isAuthenticated) navigate('/cursos', { replace: true })
  }, [isAuthenticated, navigate])

  const handleSubmit = async (e: FormEvent) => {
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
    setValidando(true)
    try {
      // Paso 2 (simulated): the e-mail must be registered and active in Usuarios (Centro de datos).
      // TODO(auth): send the Supabase magic link / Microsoft sign-in here to verify it is really theirs.
      const { tabla, usuario, inactivo } = await buscarUsuario(valor)
      if (!tabla) {
        setError('Diseña+ aún no tiene la lista de usuarios configurada. Avisa al administrador.')
        return
      }
      if (inactivo) {
        setError('Tu usuario está desactivado en Diseña+. Comunícate con el administrador.')
        return
      }
      if (!usuario) {
        setError('Tu correo no está registrado en Diseña+. Pide acceso al administrador.')
        return
      }
      login(valor, normalizarRoles(usuario.roles), { usuarioId: usuario.id, nombre: usuario.nombre })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo validar tu correo.')
    } finally {
      setValidando(false)
    }
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

            <button type="submit" className="btn btn-primary" style={{ height: 48, fontWeight: 700 }} disabled={validando}>
              {validando ? 'Validando…' : 'Ingresar'}
            </button>

            <div className="login-note">
              <span style={{ color: 'var(--color-primary)', display: 'flex', flexShrink: 0, marginTop: 1 }}>
                <Icon name="info" size={18} />
              </span>
              <span>
                Solo pueden ingresar las personas registradas en Diseña+ con su correo {UTP_DOMAIN}. Si no tienes acceso,
                pídelo al administrador.
              </span>
            </div>
          </form>
      </div>
    </div>
  )
}
