import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon, { type IconName } from '../components/Icon'
import Aprobaciones from '../components/Aprobaciones'
import { Breadcrumbs, Cargando, CursoHeader, ErrorPanel, Modal, ProgressBar, SavingOverlay, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  ESTADO_LABEL,
  activarProceso,
  getActivacion,
  type EstadoActivacion,
  type ProcesoActivable,
  getRubricasCurso,
  problemaElemento,
  sinInstrumento,
  validarConsigna,
  type RubricasCurso,
} from '../shared/academico'
import { useContenidoAcademico } from '../shared/hooks/useContenidoAcademico'

interface Tarjeta {
  titulo: string
  subtitulo: string
  to?: string
  avance?: number
  detalle?: string
  estado: 'activo' | 'bloqueado' | 'proximamente' | 'no_aplica' | 'por_activar'
  icon?: IconName
  /** Process behind the card, for the ACTIVAR button. */
  proceso?: ProcesoActivable
}

export default function HubCurso() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const { ctx, proceso, error, loading, recargar } = useContenidoAcademico(cursoId)
  const [rubricas, setRubricas] = useState<RubricasCurso | null>(null)
  const [verFlujo, setVerFlujo] = useState(false)
  const { can, user } = useAuth()
  const toast = useToast()
  const [activacion, setActivacion] = useState<Record<ProcesoActivable, EstadoActivacion> | null>(null)
  const [confirmar, setConfirmar] = useState<Tarjeta | null>(null)
  const [activando, setActivando] = useState(false)
  const puedeActivar = can('editar_contenido') || can('administrar_datos')

  useEffect(() => {
    document.title = ctx ? `${ctx.nombre} — Diseña+` : 'Curso — Diseña+'
    if (ctx) getRubricasCurso(ctx).then(setRubricas).catch(() => setRubricas(null))
    if (ctx) getActivacion(ctx).then(setActivacion).catch(() => setActivacion(null))
  }, [ctx])

  if (loading) return <Cargando texto="Cargando curso" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />

  const total = ctx.elementos.length
  const consignasOk = ctx.elementos.filter(e => validarConsigna(e.consigna).completa).length
  const rubricaEls = rubricas?.elementos ?? []
  const rubricasOk = rubricaEls.filter(r => problemaElemento(r) === null).length

  const academico: Tarjeta[] = [
    {
      titulo: 'Consignas',
      proceso: 'consignas',
      subtitulo: 'Instrucciones para tu tarea',
      to: `/cursos/${ctx.id}/consignas`,
      avance: total ? (consignasOk / total) * 100 : 0,
      detalle: proceso.finalizado.consignas ? 'Edición finalizada' : `${consignasOk} de ${total} completadas`,
      estado: ctx.permite.consignas || total > 0 ? 'activo' : 'bloqueado',
    },
    {
      titulo: 'Rúbricas',
      proceso: 'rubrica',
      subtitulo: '¿Cómo se evaluará tu trabajo?',
      to: `/cursos/${ctx.id}/rubricas`,
      avance: rubricaEls.length ? (rubricasOk / rubricaEls.length) * 100 : 0,
      detalle: !rubricas
        ? 'Calculando…'
        : proceso.finalizado.rubricas
          ? 'Edición finalizada'
          : `${rubricasOk} de ${rubricaEls.length} elementos completos`,
      estado: rubricas && rubricaEls.length === 0 ? 'no_aplica' : 'activo',
    },
    { titulo: 'Matriz', proceso: 'matriz', subtitulo: 'Cuadro detallado de puntajes', estado: ctx.permite.matriz ? 'proximamente' : 'bloqueado' },
    { titulo: 'Lista de cotejo', proceso: 'lista', subtitulo: 'Requisitos mínimos a cumplir', estado: ctx.permite.lista ? 'proximamente' : 'bloqueado' },
    { titulo: 'Escala de valoración', proceso: 'escala', subtitulo: 'Medición del nivel alcanzado', estado: ctx.permite.escala ? 'proximamente' : 'bloqueado' },
  ]

  // Not assigned by the administrator → NO ASIGNADO; assigned but not yet
  // activated → ACTIVAR (once); activated → the usual card.
  if (activacion) {
    for (const t of academico) {
      if (!t.proceso) continue
      const a = activacion[t.proceso]
      if (!a.asignado) t.estado = 'bloqueado'
      else if (!a.activado) t.estado = 'por_activar'
    }
  }

  const activar = async (t: Tarjeta) => {
    if (!t.proceso || !user) return
    setConfirmar(null)
    setActivando(true)
    try {
      const n = await activarProceso(ctx, t.proceso, user.correo)
      toast(`Se activó ${t.titulo}${n ? ` · ${n} ${n === 1 ? 'elemento preparado' : 'elementos preparados'}` : ''}`)
      await recargar()
      setActivacion(await getActivacion(ctx))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo activar.', 'error')
    } finally {
      setActivando(false)
    }
  }
  const consignasActivas = !!activacion?.consignas.activado
  const faltanInstrumento = sinInstrumento(ctx).length
  const motivoInstrumentos = !consignasActivas
    ? 'Primero activa Consignas'
    : faltanInstrumento
      ? `Elige el instrumento en todas las consignas (faltan ${faltanInstrumento})`
      : undefined

  const instruccional: Tarjeta[] = [
    { titulo: 'Sesiones de clase', subtitulo: 'Contenido y agenda del día', estado: 'proximamente' },
    { titulo: 'PPT con sesiones', subtitulo: 'Diapositivas de apoyo visual', estado: 'proximamente' },
    { titulo: 'PPT sin sesiones', subtitulo: 'Diapositivas de apoyo visual', estado: 'proximamente' },
  ]

  const activas = academico.filter(t => t.estado === 'activo')
  const avanceProceso = activas.length ? activas.reduce((s, t) => s + (t.avance ?? 0), 0) / activas.length : 0

  return (
    <div className="page">
      <Breadcrumbs items={[{ label: 'Cursos', to: '/cursos' }, { label: ctx.nombre }]} />
      <CursoHeader
        titulo={ctx.nombre}
        tipoEnsenanza={ctx.tipoEnsenanza}
        programas={ctx.programas}
        acciones={
          <button className="link-btn" style={{ fontSize: 15 }} onClick={() => setVerFlujo(true)}>
            Flujo de trabajo <Icon name="eye" size={18} />
          </button>
        }
      />

      {!proceso.disponible && (
        <div className="alert-banner alert-warn" style={{ padding: '12px 14px' }}>
          <Icon name="info" size={18} />
          <span>
            Falta activar el flujo de aprobación en la base de datos (script <b>supabase/schema-flujo.sql</b>). Puedes
            editar normalmente; «Finalizar edición» y las aprobaciones se activan al ejecutarlo.
          </span>
        </div>
      )}

      <div className="panel animate-in" style={{ padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 16, border: '1px solid var(--color-border)' }}>
        <span className="hub-icon"><Icon name="target" size={20} /></span>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Etapa previa · Sílabo
          </span>
          <span style={{ fontSize: 15 }}>
            <b>Mapeo de competencias</b> — metas de aprendizaje del curso, base para todo el diseño
          </span>
        </div>
        <span className="chip" style={{ background: '#eef0f1', color: '#5b6168' }}>Próximamente</span>
      </div>

      <div className="hub-grid">
        <section className="panel hub-section animate-in">
          <SeccionHead
            numero={1}
            titulo="Diseño de contenido académico"
            subtitulo="Consignas e instrumentos de evaluación"
            chip={
              <span className={`chip ${proceso.estado === 'aprobado' ? 'chip-aprobado' : proceso.estado === 'en_edicion' ? 'chip-edicion' : 'chip-revision'}`}>
                {ESTADO_LABEL[proceso.estado]}
              </span>
            }
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ flex: 1 }}><ProgressBar value={avanceProceso} /></div>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{Math.round(avanceProceso)}%</span>
          </div>
          <div className="hub-cards">
            {academico.map(t => (
              <TarjetaProceso
                key={t.titulo}
                t={t}
                onActivar={puedeActivar ? () => setConfirmar(t) : undefined}
                motivoBloqueo={t.proceso !== 'consignas' ? motivoInstrumentos : undefined}
              />
            ))}
          </div>
        </section>

        <section className="panel hub-section animate-in" style={{ opacity: 0.85 }}>
          <SeccionHead
            numero={2}
            titulo="Contenido instruccional"
            subtitulo="Sesiones de clase y presentaciones PPT"
            chip={<span className="chip" style={{ background: '#eef0f1', color: '#5b6168' }}>Próximamente</span>}
          />
          <div className="hub-cards">{instruccional.map(t => <TarjetaProceso key={t.titulo} t={t} />)}</div>
        </section>
      </div>

      <Modal
        open={!!confirmar}
        title={`¿Activar ${confirmar?.titulo ?? ''}?`}
        onClose={() => setConfirmar(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setConfirmar(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={() => confirmar && activar(confirmar)}>Sí, activar</button>
          </>
        }
      >
        Se prepararán los elementos del curso para que puedas trabajar este proceso. <b>Ten presente que solo lo puedes hacer una vez.</b>
      </Modal>
      <SavingOverlay show={activando} label="Activando…" />
      <Aprobaciones open={verFlujo} onClose={() => setVerFlujo(false)} cursoId={ctx.id} proceso={proceso} onCambio={recargar} />
    </div>
  )
}

function SeccionHead(props: { numero: number; titulo: string; subtitulo: string; chip: React.ReactNode }) {
  return (
    <div className="row-between" style={{ alignItems: 'flex-start' }}>
      <div style={{ display: 'flex', gap: 14 }}>
        <span className="hub-num">{props.numero}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ fontSize: 19, fontWeight: 700 }}>{props.titulo}</h2>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>{props.subtitulo}</span>
        </div>
      </div>
      {props.chip}
    </div>
  )
}

function TarjetaProceso({ t, onActivar, motivoBloqueo }: { t: Tarjeta; onActivar?: () => void; motivoBloqueo?: string }) {
  if (t.estado === 'por_activar') {
    return (
      <div className="hub-card hub-card-activar">
        <span style={{ fontSize: 16, fontWeight: 700 }}>{t.titulo}</span>
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.subtitulo}</span>
        {onActivar ? (
          <button className="btn btn-primary btn-sm" style={{ alignSelf: 'flex-start', marginTop: 6 }} disabled={!!motivoBloqueo} title={motivoBloqueo} onClick={onActivar}>
            <Icon name="sparkles" size={14} />Activar
          </button>
        ) : (
          <span style={{ fontSize: 12, fontWeight: 700, marginTop: 6 }}>Pendiente de activar</span>
        )}
        {motivoBloqueo && onActivar && <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>{motivoBloqueo}</span>}
      </div>
    )
  }
  const contenido = (
    <>
      <span style={{ fontSize: 16, fontWeight: 700 }}>{t.titulo}</span>
      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{t.subtitulo}</span>
      <span style={{ fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
        {t.estado === 'activo' && <><Icon name="pencil" size={13} strokeWidth={2} />{t.detalle}</>}
        {t.estado === 'bloqueado' && <><Icon name="lock" size={13} strokeWidth={2} />No asignado</>}
        {t.estado === 'proximamente' && <><Icon name="clock" size={13} strokeWidth={2} />Próximamente</>}
        {t.estado === 'no_aplica' && <>Ningún elemento usa este instrumento</>}
      </span>
      <ProgressBar value={t.avance ?? 0} muted={t.estado !== 'activo'} />
    </>
  )
  if (t.estado === 'activo' && t.to) {
    return <Link to={t.to} className="hub-card">{contenido}</Link>
  }
  return <div className="hub-card hub-card-off">{contenido}</div>
}
