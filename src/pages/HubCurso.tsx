import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon, { type IconName } from '../components/Icon'
import Aprobaciones from '../components/Aprobaciones'
import VisorPdf from '../components/VisorPdf'
import { DOCUMENTOS, listarDocumentos, nombreDescarga, type DocumentoCurso, type TipoDocumento } from '../shared/documentosCurso'
import { Breadcrumbs, Cargando, CursoHeader, Drawer, ErrorPanel, Modal, ProgressBar, SavingOverlay, Spinner, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  ESTADO_LABEL,
  activarProceso,
  asignarProceso,
  getActivacion,
  type EstadoActivacion,
  type ProcesoActivable,
  getRubricasCurso,
  comentariosPendientes,
  pendientesPorPreparar,
  problemaElemento,
  sinInstrumento,
  validarConsigna,
  type RubricasCurso,
} from '../shared/academico'
import { useContenidoAcademico } from '../shared/hooks/useContenidoAcademico'
import { getListasCurso, problemaLista, type ListasCurso } from '../shared/listaCotejo'
import { getEscalasCurso, problemaEscala, type EscalasCurso } from '../shared/escala'

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
  /** Unresolved reviewer comments in this part. */
  comentarios?: number
}

export default function HubCurso() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const [rubricas, setRubricas] = useState<RubricasCurso | null>(null)
  const [listas, setListas] = useState<ListasCurso | null>(null)
  const [escalas, setEscalas] = useState<EscalasCurso | null>(null)
  const [verFlujo, setVerFlujo] = useState(false)
  const [verAsignar, setVerAsignar] = useState(false)
  // Sílabo and formato de orientación of the course (PDFs uploaded in Mis cursos / Centro de datos).
  const [docs, setDocs] = useState<Map<string, DocumentoCurso> | null>(null)
  const [visor, setVisor] = useState<DocumentoCurso | null>(null)
  useEffect(() => {
    listarDocumentos().then(setDocs).catch(() => setDocs(new Map()))
  }, [])
  const { can, user } = useAuth()
  const toast = useToast()
  const [activacion, setActivacion] = useState<Record<ProcesoActivable, EstadoActivacion> | null>(null)
  const [pendientes, setPendientes] = useState<Record<ProcesoActivable, number> | null>(null)
  const [comentariosAbiertos, setComentariosAbiertos] = useState<Record<string, number>>({})
  const [confirmar, setConfirmar] = useState<Tarjeta | null>(null)
  const [activando, setActivando] = useState(false)
  const puedeActivar = rol.editar || rol.admin

  useEffect(() => {
    document.title = ctx ? `${ctx.nombre} — Diseña+` : 'Curso — Diseña+'
    if (ctx) getRubricasCurso(ctx).then(setRubricas).catch(() => setRubricas(null))
    if (ctx) getListasCurso(ctx).then(setListas).catch(() => setListas(null))
    if (ctx) getEscalasCurso(ctx).then(setEscalas).catch(() => setEscalas(null))
    if (ctx) getActivacion(ctx).then(setActivacion).catch(() => setActivacion(null))
    if (ctx) pendientesPorPreparar(ctx).then(setPendientes).catch(() => setPendientes(null))
    if (ctx) comentariosPendientes(ctx.id).then(setComentariosAbiertos).catch(() => setComentariosAbiertos({}))
  }, [ctx])

  if (loading) return <Cargando texto="Cargando curso" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />

  const total = ctx.elementos.length
  const consignasOk = ctx.elementos.filter(e => validarConsigna(e.consigna).completa).length
  // Where a finalized part is in the review (it is sent only when every part is finalized).
  const enRevision =
    proceso.estado === 'aprobado' ? 'Aprobado por Monitor EA y DDA'
    : proceso.estado === 'revision_dda' ? 'Aprobado por Monitor EA · falta DDA'
    : proceso.estado === 'revision_monitor' ? 'En revisión del Monitor EA'
    : 'Finalizado · falta terminar otras partes'
  const rubricaEls = rubricas?.elementos ?? []
  const rubricasOk = rubricaEls.filter(r => problemaElemento(r) === null).length
  const listaEls = listas?.elementos ?? []
  const listasOk = listaEls.filter(l => problemaLista(l) === null).length
  const escalaEls = escalas?.elementos ?? []
  const escalasOk = escalaEls.filter(x => problemaEscala(x) === null).length

  const academico: Tarjeta[] = [
    {
      titulo: 'Consignas',
      proceso: 'consignas',
      subtitulo: 'Instrucciones para tu tarea',
      to: `/cursos/${ctx.id}/consignas`,
      avance: total ? (consignasOk / total) * 100 : 0,
      detalle: proceso.finalizado.consignas ? enRevision : `${consignasOk} de ${total} completadas`,
      comentarios: comentariosAbiertos.consignas,
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
        : rubricas.faltantes.length
          ? porPreparar(rubricas.faltantes.length)
          : proceso.finalizado.rubricas
            ? enRevision
            : `${rubricasOk} de ${rubricaEls.length} elementos completos`,
      estado: rubricas && rubricaEls.length === 0 && rubricas.faltantes.length === 0 ? 'no_aplica' : 'activo',
      comentarios: comentariosAbiertos.rubricas,
    },
    { titulo: 'Matriz', proceso: 'matriz', subtitulo: 'Cuadro detallado de puntajes', estado: ctx.permite.matriz ? 'proximamente' : 'bloqueado' },
    {
      titulo: 'Lista de cotejo',
      proceso: 'lista',
      subtitulo: 'Requisitos mínimos a cumplir',
      to: `/cursos/${ctx.id}/lista`,
      avance: listaEls.length ? (listasOk / listaEls.length) * 100 : 0,
      detalle: !listas
        ? 'Calculando…'
        : listas.faltantes.length
          ? porPreparar(listas.faltantes.length)
          : proceso.finalizado.lista
            ? enRevision
            : `${listasOk} de ${listaEls.length} elementos completos`,
      estado: !ctx.permite.lista ? 'bloqueado' : listas && listaEls.length === 0 && listas.faltantes.length === 0 ? 'no_aplica' : 'activo',
      comentarios: comentariosAbiertos.lista,
    },
    {
      titulo: 'Escala de valoración',
      proceso: 'escala',
      subtitulo: 'Medición del nivel alcanzado',
      to: `/cursos/${ctx.id}/escala`,
      avance: escalaEls.length ? (escalasOk / escalaEls.length) * 100 : 0,
      detalle: !escalas
        ? 'Calculando…'
        : escalas.faltantes.length
          ? porPreparar(escalas.faltantes.length)
          : proceso.finalizado.escala
            ? enRevision
            : `${escalasOk} de ${escalaEls.length} elementos completos`,
      estado: !ctx.permite.escala ? 'bloqueado' : escalas && escalaEls.length === 0 && escalas.faltantes.length === 0 ? 'no_aplica' : 'activo',
      comentarios: comentariosAbiertos.escala,
    },
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
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {(['silabo', 'formato'] as TipoDocumento[]).map(t => {
              const doc = docs?.get(`${ctx.id}|${t}`)
              return (
                <button
                  key={t}
                  className="btn btn-outline btn-sm"
                  disabled={!doc}
                  title={doc ? `Ver ${DOCUMENTOS[t].label}` : docs ? `Este curso aún no tiene ${DOCUMENTOS[t].label.toLowerCase()} cargado` : 'Cargando…'}
                  onClick={() => doc && setVisor(doc)}
                >
                  <Icon name="pdf" size={15} />{DOCUMENTOS[t].label}
                </button>
              )
            })}
            {can('administrar_datos') && (
              <button className="btn btn-outline btn-sm" onClick={() => setVerAsignar(true)}>
                <Icon name="check" size={15} />Asignar procesos
              </button>
            )}
            <button className="link-btn" style={{ fontSize: 15 }} onClick={() => setVerFlujo(true)}>
              Flujo de trabajo <Icon name="eye" size={18} />
            </button>
          </span>
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
      {visor && (
        <VisorPdf
          titulo={`${DOCUMENTOS[visor.tipo].label} · ${ctx.nombre}`}
          url={visor.url}
          nombreArchivo={nombreDescarga(visor.tipo, ctx.nombre)}
          onClose={() => setVisor(null)}
        />
      )}
      <AsignarProcesos
        open={verAsignar}
        onClose={() => setVerAsignar(false)}
        cursoId={ctx.id}
        activacion={activacion}
        pendientes={pendientes}
        onPreparar={async p => {
          if (!user) return 0
          const n = await activarProceso(ctx, p, user.correo)
          await recargar()
          setPendientes(await pendientesPorPreparar(ctx).catch(() => null))
          return n
        }}
        onCambio={async () => {
          await recargar()
        }}
      />
      <Aprobaciones open={verFlujo} onClose={() => setVerFlujo(false)} cursoId={ctx.id} proceso={proceso} rol={rol} onCambio={recargar} />
    </div>
  )
}

/** The consigna chose this instrument after the process was activated: the element still has to be added. */
const porPreparar = (n: number) => `${n} ${n === 1 ? 'elemento nuevo' : 'elementos nuevos'} por agregar`

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
        {t.estado === 'activo' && !!t.comentarios && (
          <span className="chip chip-revision" style={{ marginLeft: 'auto' }} title="Comentarios de los revisores sin resolver">
            <Icon name="comment" size={12} />{t.comentarios} {t.comentarios === 1 ? 'comentario pendiente' : 'comentarios pendientes'}
          </span>
        )}
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

const PROCESOS_ASIGNABLES: Array<{ proceso: ProcesoActivable; label: string; columna: string }> = [
  { proceso: 'consignas', label: 'Consignas', columna: 'Permite_Consignas' },
  { proceso: 'rubrica', label: 'Rúbricas', columna: 'Permite_Rubricas' },
  { proceso: 'matriz', label: 'Matriz', columna: 'Permite_Matriz_SN' },
  { proceso: 'lista', label: 'Lista de cotejo', columna: 'Permite_ListaCotejo' },
  { proceso: 'escala', label: 'Escala de valoración', columna: 'Permite_Escala' },
]

/** Admin: tick the processes of the course (the Permite_* checks of LISTADO_CURSOS_PARA_IA). */
function AsignarProcesos(props: {
  open: boolean
  onClose: () => void
  cursoId: string
  activacion: Record<ProcesoActivable, EstadoActivacion> | null
  /** Rows "Preparar nuevos" would create now, per process (null while loading). */
  pendientes: Record<ProcesoActivable, number> | null
  /** Run the activation again: creates only what is missing (elements whose consigna chose the instrument later). */
  onPreparar: (p: ProcesoActivable) => Promise<number>
  onCambio: () => Promise<void>
}) {
  const { open, onClose, cursoId, activacion, pendientes, onPreparar, onCambio } = props
  const toast = useToast()
  const [guardando, setGuardando] = useState<ProcesoActivable | null>(null)

  const cambiar = async (p: ProcesoActivable, valor: boolean) => {
    setGuardando(p)
    try {
      await asignarProceso(cursoId, p, valor)
      await onCambio()
      toast(valor ? 'Proceso asignado' : 'Proceso quitado')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error')
    } finally {
      setGuardando(null)
    }
  }

  const preparar = async (p: ProcesoActivable, label: string) => {
    setGuardando(p)
    try {
      const n = await onPreparar(p)
      toast(n ? `${label}: ${n} ${n === 1 ? 'elemento preparado' : 'elementos preparados'}` : `${label}: no había elementos nuevos por preparar`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo preparar.', 'error')
    } finally {
      setGuardando(null)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title="Asignar procesos" footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}>
      <p style={{ fontSize: 14, lineHeight: 1.5, color: '#3d434a' }}>
        Marca los procesos que trabajará este curso. Es la misma casilla <b>Permite_*</b> de LISTADO_CURSOS_PARA_IA en el Centro de datos.
        Luego, en cada tarjeta, se pulsa <b>Activar</b> para preparar los elementos.
        Si después una consigna elige ese instrumento, o el sílabo trae un elemento nuevo, aparece <b>Preparar nuevos</b>: agrega solo lo que falta (no borra ni cambia lo ya hecho).
      </p>
      {PROCESOS_ASIGNABLES.map(({ proceso: p, label, columna }) => {
        const est = activacion?.[p]
        const activado = !!est?.activado
        return (
          <label key={p} className="asignar-proceso">
            <input
              type="checkbox"
              checked={!!est?.asignado}
              disabled={!activacion || guardando !== null || (activado && !!est?.asignado)}
              onChange={e => cambiar(p, e.target.checked)}
            />
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <b style={{ fontSize: 14 }}>{label}</b>
              <small style={{ color: 'var(--color-text-muted)' }}>{columna}</small>
            </span>
            {guardando === p ? (
              <Spinner />
            ) : activado ? (
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Only when something is actually missing. */}
                {!!pendientes?.[p] && (
                  <button
                    className="btn btn-outline btn-sm"
                    title={p === 'consignas' ? 'Elementos del sílabo que aún no tienen consigna' : 'Elementos cuya consigna eligió este instrumento después de activar'}
                    onClick={e => { e.preventDefault(); preparar(p, label) }}
                  >
                    Preparar {pendientes[p]} {pendientes[p] === 1 ? 'nuevo' : 'nuevos'}
                  </button>
                )}
                <span className="chip chip-aprobado" title="Ya se activó: no se puede quitar"><Icon name="checkCircle" size={13} />Activado</span>
              </span>
            ) : est?.asignado ? (
              <span className="chip chip-revision">Por activar</span>
            ) : (
              <span className="chip">No asignado</span>
            )}
          </label>
        )
      })}
    </Drawer>
  )
}
