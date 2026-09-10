// src/shared/mockData.ts
// Local preview fixtures used ONLY as a fallback when the Web API is
// unreachable (e.g. running via `npm run dev` on localhost, which has no
// `/_api/` backend — that only exists once the site is deployed to Power
// Pages). Content mirrors real examples from the source Canvas App
// (course/unit/session/instrument shapes), lightly adapted, so the UI can be
// designed and demoed against realistic content.
//
// None of this is written back anywhere — pages that use it treat the whole
// object graph as read-only sample data.

import type { Curso } from '../types/curso'
import type { Sesion } from '../types/sesion'
import type { Consigna } from '../types/consigna'
import type { Rubrica, RubricaCriterio } from '../types/rubrica'
import type { MatrizPregunta } from '../types/matrizPregunta'
import type { Matriz as MatrizHeader } from '../types/matriz'
import type { ListaCotejo, IndicadorListaCotejo } from '../types/listaCotejo'
import type { EscalaValoracion } from '../types/escalaValoracion'
import type { EscalaIndicador } from '../types/escalaIndicador'

const now = new Date().toISOString()

export const MOCK_CURSO_ID = 'mock-curso-1'

export const MOCK_CURSO: Curso = {
  id: MOCK_CURSO_ID,
  nombre: 'CALCULO PARA LA TOMA DE DECISIONES',
  idCursoText: 'C26',
  codigoCatalogo: '100000I14N',
  carrera: 'INGENIERIA BIOMEDICA',
  tipoEnsenanza: 'Presencial',
  ciclo: 5,
  logroCurso:
    'Al finalizar el curso, el estudiante aplica el razonamiento matemático y los métodos propios de la racionalidad científica para describir, interpretar y predecir fenómenos en su campo de ingeniería.',
  permiteConsignas: true,
  permiteRubricas: true,
  permiteMatrizSN: true,
  permiteListaCotejo: true,
  permiteEscala: true,
  estado: 'activo',
  estadoLabel: 'Activo',
  createdAt: now,
  updatedAt: now,
  unidades: [],
}

// ── Sesiones (elementos evaluables) ───────────────────────────────────────────

export const MOCK_SESION_PC1: Sesion = {
  id: 'mock-sesion-pc1',
  elemento: 'PRÁCTICA CALIFICADA 1',
  idSesionText: 'S10',
  abreviatura: 'PC1',
  tema: 'Ecuaciones diferenciales de primer orden',
  unidadId: 'mock-unidad-1',
  unidadNombre: 'Ecuaciones diferenciales de primer orden',
  unidad: null,
  estado: 'activo',
  estadoLabel: 'Activo',
  createdAt: now,
  updatedAt: now,
}

export const MOCK_SESION_APF1: Sesion = {
  ...MOCK_SESION_PC1,
  id: 'mock-sesion-apf1',
  elemento: 'AVANCE DE PROYECTO FINAL 1',
  idSesionText: 'S12',
  abreviatura: 'APF1',
  tema: 'Modelamiento de un problema de ingeniería',
}

export const MOCK_SESION_PORTAFOLIO1: Sesion = {
  ...MOCK_SESION_PC1,
  id: 'mock-sesion-portafolio1',
  elemento: 'AVANCE DE PORTAFOLIO 1',
  idSesionText: 'S14',
  abreviatura: 'AP1',
  tema: 'Proceso de Atención Nutricional aplicado',
}

export const MOCK_SESION_LC2: Sesion = {
  ...MOCK_SESION_PC1,
  id: 'mock-sesion-lc2',
  elemento: 'LABORATORIO CALIFICADO 2',
  idSesionText: 'S16',
  abreviatura: 'LC2',
  tema: 'Integrales dobles y sus aplicaciones',
}

export const MOCK_SESIONES: Sesion[] = [MOCK_SESION_PC1, MOCK_SESION_APF1, MOCK_SESION_PORTAFOLIO1, MOCK_SESION_LC2]

// ── Consignas ──────────────────────────────────────────────────────────────

/** dpl_unidad.dpl_logroespecifico, read-only — shown as "Logro a evaluar". */
export const MOCK_LOGRO_ESPECIFICO: Record<string, string> = {
  [MOCK_SESION_PC1.id]:
    'Al finalizar la unidad, el estudiante aplica las ecuaciones diferenciales de primer orden en problemas de ingeniería.',
}

export const MOCK_CONSIGNAS: Record<string, Consigna> = {
  [MOCK_SESION_PC1.id]: {
    id: 'mock-consigna-pc1',
    idConsignaText: 'C26-U2-S10',
    queSeEvaluara: '',
    indicacionGeneral:
      '<p>La evaluación es individual. Desarrolla una práctica calificada con el objetivo de demostrar la aplicación de ecuaciones diferenciales ordinarias en la resolución de problemas de ingeniería, específicamente aquellos correspondientes a la Unidad 1 de Cálculo para la Toma de Decisiones. La actividad te permitirá comprobar si una función es solución de una ecuación diferencial, resolver diversos tipos de ecuaciones diferenciales ordinarias y analizar su uso en contextos de crecimiento, decaimiento, conservación de energía o masa, así como en sistemas de mezclas y circuitos en serie.</p>',
    indicacionesEspecificas:
      '<ul><li>Desarrolla la práctica de manera individual en el aula, utilizando únicamente los apuntes o anotaciones personales tomadas en clase en formato físico (cuaderno) y una calculadora; no utilices dispositivos electrónicos, libros, ni material impreso adicional.</li><li>Resuelve las cinco preguntas de desarrollo que conforman esta práctica; cada pregunta tiene un valor de 4 puntos, para un total de 20 puntos.</li><li>Aplica los siguientes temas en las preguntas planteadas: comprobación de solución de una ecuación diferencial ordinaria; resolución de una ecuación diferencial ordinaria usando el método de variable separable; aplicación de ecuaciones diferenciales de variables separables al crecimiento y decaimiento; uso de ecuaciones diferenciales exactas en problemas de conservación de energía o masa; y resolución de ecuaciones diferenciales lineales de primer orden aplicadas a mezclas y circuitos en serie.</li><li>Aborda tres preguntas de nivel básico y dos preguntas de nivel intermedio, según la dificultad establecida.</li></ul>',
    recomendaciones:
      '<p>Revisa previamente los métodos de resolución de ecuaciones diferenciales de primer orden vistos en clase. Organiza tu tiempo para responder primero las preguntas que domines con mayor seguridad.</p>',
    anexo: '',
    instrumento: 'matriz con rúbrica',
    estado: 'PROCESADO',
    activado: true,
    usuarioRegistro: 'ProAc',
    fechaRegistro: now,
    sesionId: MOCK_SESION_PC1.id,
    sesionNombre: MOCK_SESION_PC1.elemento,
    sesion: null,
    estadoRegistro: 'activo',
    estadoRegistroLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
  },
}

// ── Rúbricas ───────────────────────────────────────────────────────────────

const RUBRICA_CRITERIOS_PORTAFOLIO1: RubricaCriterio[] = [
  {
    id: 'mock-cr-1',
    criterio: 'Aplicación del Proceso de Atención Nutricional',
    orden: 1,
    definicionCriterio:
      'Evalúa que el estudiante aplique las etapas del Proceso de Atención Nutricional al caso clínico, relacionando la información del niño sano con las decisiones de atención nutricional documentadas.',
    estandarEsperado:
      'Aplica cada etapa del Proceso de Atención Nutricional al caso clínico, estableciendo una secuencia documentada en la que los datos del caso sustentan las decisiones de valoración, diagnóstico, intervención y monitoreo y evaluación.',
    puntajeEstandar: 6,
    enProceso2:
      'Aplica las etapas del Proceso de Atención Nutricional al caso clínico, estableciendo la secuencia de atención y relacionando los datos del caso con las decisiones nutricionales en la mayor parte del desarrollo documentado.',
    puntajeEnProceso2: 4.5,
    enProceso1:
      'Aplica las etapas del Proceso de Atención Nutricional al caso clínico, relacionando algunos datos del caso con decisiones nutricionales dentro de la secuencia documentada.',
    puntajeEnProceso1: 3,
    inicial:
      'Aplica el Proceso de Atención Nutricional al caso clínico, vinculando al menos un dato del caso con una decisión nutricional documentada.',
    puntajeInicial: 1.5,
    rubricaId: 'mock-rubrica-portafolio1',
    estado: 'activo',
    estadoLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-cr-2',
    criterio: 'Formulación del diagnóstico nutricional en formato PES',
    orden: 2,
    definicionCriterio:
      'Evalúa que el estudiante formule el diagnóstico nutricional en formato PES, relacionando el problema, la etiología y los signos o síntomas con la información del caso clínico.',
    estandarEsperado:
      'Formula el diagnóstico nutricional integrando el problema, la etiología y los signos o síntomas en una relación causal explícita, sustentada con datos del caso.',
    puntajeEstandar: 5,
    enProceso2:
      'Formula el diagnóstico nutricional integrando el problema, la etiología y los signos o síntomas, y vincula explícitamente dos de estos tres componentes con datos del caso clínico.',
    puntajeEnProceso2: 4,
    enProceso1:
      'Formula el diagnóstico nutricional consignando el problema, la etiología y los signos o síntomas, y establece una relación explícita entre dos componentes mediante un dato concreto del caso clínico.',
    puntajeEnProceso1: 3,
    inicial:
      'Formula el diagnóstico nutricional consignando el problema, la etiología y los signos o síntomas alrededor de un dato concreto del caso.',
    puntajeInicial: 1.5,
    rubricaId: 'mock-rubrica-portafolio1',
    estado: 'activo',
    estadoLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
  },
]

export const MOCK_RUBRICAS: Record<string, Rubrica> = {
  [MOCK_SESION_PORTAFOLIO1.id]: {
    id: 'mock-rubrica-portafolio1',
    nombre: MOCK_SESION_PORTAFOLIO1.elemento,
    estado: 'PROCESADO',
    activado: true,
    usuarioRegistro: 'ProAc',
    fechaRegistro: now,
    sesionId: MOCK_SESION_PORTAFOLIO1.id,
    sesionNombre: MOCK_SESION_PORTAFOLIO1.elemento,
    state: 'activo',
    stateLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
    criterios: RUBRICA_CRITERIOS_PORTAFOLIO1,
  },
}

// ── Matriz ─────────────────────────────────────────────────────────────────

const MATRIZ_PREGUNTAS_LC2: MatrizPregunta[] = [
  {
    id: 'mock-mp-1',
    ejeTematico: 'Integrales dobles en coordenadas cartesianas',
    orden: 1,
    taxonomia: 'Aplicar',
    tipoItem: 'Desarrollo largo',
    plataforma: '',
    cantidadItems: 1,
    puntajeIA: 6.67,
    matrizId: 'mock-matriz-lc2',
    matrizNombre: MOCK_SESION_LC2.elemento,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-mp-2',
    ejeTematico: 'Integrales dobles mediante coordenadas polares',
    orden: 2,
    taxonomia: 'Evaluar',
    tipoItem: 'Desarrollo largo',
    plataforma: '',
    cantidadItems: 1,
    puntajeIA: 6.67,
    matrizId: 'mock-matriz-lc2',
    matrizNombre: MOCK_SESION_LC2.elemento,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-mp-3',
    ejeTematico: 'Cambio de variable en integrales dobles: Jacobianos',
    orden: 3,
    taxonomia: 'Evaluar',
    tipoItem: 'Desarrollo largo',
    plataforma: '',
    cantidadItems: 1,
    puntajeIA: 6.66,
    matrizId: 'mock-matriz-lc2',
    matrizNombre: MOCK_SESION_LC2.elemento,
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-mp-4',
    ejeTematico: 'Cálculo de áreas de regiones planas y volumen de un sólido',
    orden: 4,
    taxonomia: 'Aplicar',
    tipoItem: 'Opción múltiple',
    plataforma: '',
    cantidadItems: 1,
    puntajeIA: 0,
    matrizId: 'mock-matriz-lc2',
    matrizNombre: MOCK_SESION_LC2.elemento,
    createdAt: now,
    updatedAt: now,
  },
]

export const MOCK_MATRICES: Record<string, MatrizHeader> = {
  [MOCK_SESION_LC2.id]: {
    id: 'mock-matriz-lc2',
    nombre: MOCK_SESION_LC2.elemento,
    estado: 'PROCESADO',
    activado: true,
    usuarioRegistro: 'ProAc',
    fechaRegistro: now,
    sesionId: MOCK_SESION_LC2.id,
    sesionNombre: MOCK_SESION_LC2.elemento,
    createdAt: now,
    updatedAt: now,
    preguntas: MATRIZ_PREGUNTAS_LC2,
  },
}

// ── Lista de cotejo ────────────────────────────────────────────────────────

const LISTA_INDICADORES_APF1: IndicadorListaCotejo[] = [
  {
    id: 'mock-li-1',
    indicador:
      'Formula el modelo matemático preliminar del problema de ingeniería mediante una ecuación diferencial ordinaria, variables y condiciones iniciales cuando corresponda.',
    orden: 1,
    puntaje: 5,
    respuesta: null,
    respuestaKey: null,
    respuestaLabel: '',
    observaciones: '',
    listaCotejoId: 'mock-lista-apf1',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-li-2',
    indicador:
      'Contextualiza el problema de ingeniería seleccionado según su vinculación con Ingeniería Biomédica y su relevancia técnica, social o ambiental.',
    orden: 2,
    puntaje: 4,
    respuesta: null,
    respuestaKey: null,
    respuestaLabel: '',
    observaciones: '',
    listaCotejoId: 'mock-lista-apf1',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-li-3',
    indicador:
      'Describe la metodología prevista para resolver la ecuación diferencial ordinaria según el modelo planteado y su interpretación en el problema de ingeniería.',
    orden: 3,
    puntaje: 4,
    respuesta: null,
    respuestaKey: null,
    respuestaLabel: '',
    observaciones: '',
    listaCotejoId: 'mock-lista-apf1',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-li-4',
    indicador: 'Presenta la bibliografía inicial mediante al menos dos fuentes académicas o técnicas citadas bajo normas APA o IEEE.',
    orden: 4,
    puntaje: 3,
    respuesta: null,
    respuestaKey: null,
    respuestaLabel: '',
    observaciones: '',
    listaCotejoId: 'mock-lista-apf1',
    createdAt: now,
    updatedAt: now,
  },
]

export const MOCK_LISTAS_COTEJO: Record<string, ListaCotejo> = {
  [MOCK_SESION_APF1.id]: {
    id: 'mock-lista-apf1',
    nombre: MOCK_SESION_APF1.elemento,
    estado: 'PROCESADO',
    activado: true,
    usuarioRegistro: 'ProAc',
    fechaRegistro: now,
    sesionId: MOCK_SESION_APF1.id,
    sesionNombre: MOCK_SESION_APF1.elemento,
    sesion: null,
    state: 'activo',
    stateLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
    indicadores: LISTA_INDICADORES_APF1,
  },
}

// ── Escala de valoración ───────────────────────────────────────────────────

const ESCALA_INDICADORES_APF1: EscalaIndicador[] = [
  {
    id: 'mock-ei-1',
    indicador:
      'Identifica el problema ingenieril, variables y condiciones iniciales mediante una delimitación contextual sustentada en el fenómeno seleccionado.',
    orden: 1,
    puntajes: { excelente: 5, bueno: 4, regular: 3.5, conErrores: 2, noEvidenciado: 0 },
    respuesta: null,
    respuestaRaw: '',
    puntajeObtenido: 0,
    observaciones: '',
    escalaValoracionId: 'mock-escala-apf1',
    escalaValoracionNombre: MOCK_SESION_APF1.elemento,
    estado: 'activo',
    estadoLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-ei-2',
    indicador:
      'Formula la ecuación diferencial del fenómeno mediante relaciones entre variables, parámetros y condiciones iniciales, justificando su pertinencia ingenieril.',
    orden: 2,
    puntajes: { excelente: 4, bueno: 3.5, regular: 3, conErrores: 1.5, noEvidenciado: 0 },
    respuesta: null,
    respuestaRaw: '',
    puntajeObtenido: 0,
    observaciones: '',
    escalaValoracionId: 'mock-escala-apf1',
    escalaValoracionNombre: MOCK_SESION_APF1.elemento,
    estado: 'activo',
    estadoLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-ei-3',
    indicador:
      'Resuelve el modelo diferencial mediante dos métodos estudiados, integrando la Transformada de Laplace o series de potencias según las características del problema.',
    orden: 3,
    puntajes: { excelente: 3.5, bueno: 3, regular: 2.5, conErrores: 1.5, noEvidenciado: 0 },
    respuesta: null,
    respuestaRaw: '',
    puntajeObtenido: 0,
    observaciones: '',
    escalaValoracionId: 'mock-escala-apf1',
    escalaValoracionNombre: MOCK_SESION_APF1.elemento,
    estado: 'activo',
    estadoLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-ei-4',
    indicador:
      'Valida las soluciones obtenidas mediante software libre, empleando gráficos, simulaciones o cálculos comparativos según el comportamiento esperado del modelo.',
    orden: 4,
    puntajes: { excelente: 3, bueno: 2.5, regular: 2, conErrores: 1, noEvidenciado: 0 },
    respuesta: null,
    respuestaRaw: '',
    puntajeObtenido: 0,
    observaciones: '',
    escalaValoracionId: 'mock-escala-apf1',
    escalaValoracionNombre: MOCK_SESION_APF1.elemento,
    estado: 'activo',
    estadoLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 'mock-ei-5',
    indicador:
      'Interpreta los resultados matemáticos mediante su relación con el fenómeno ingenieril, considerando magnitudes, tendencias e intervalos.',
    orden: 5,
    puntajes: { excelente: 2.5, bueno: 2, regular: 1.5, conErrores: 1, noEvidenciado: 0 },
    respuesta: null,
    respuestaRaw: '',
    puntajeObtenido: 0,
    observaciones: '',
    escalaValoracionId: 'mock-escala-apf1',
    escalaValoracionNombre: MOCK_SESION_APF1.elemento,
    estado: 'activo',
    estadoLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
  },
]

export const MOCK_ESCALAS: Record<string, EscalaValoracion> = {
  [MOCK_SESION_APF1.id]: {
    id: 'mock-escala-apf1',
    nombre: 'PROYECTO FINAL',
    estadoTexto: 'PROCESADO',
    activado: true,
    usuarioRegistro: 'ProAc',
    fechaRegistro: now,
    sesionId: MOCK_SESION_APF1.id,
    sesionNombre: MOCK_SESION_APF1.elemento,
    sesion: null,
    estado: 'activo',
    estadoLabel: 'Activo',
    createdAt: now,
    updatedAt: now,
    indicadores: ESCALA_INDICADORES_APF1,
    puntajeObtenido: 0,
    puntajeMaximo: ESCALA_INDICADORES_APF1.reduce((t, i) => t + Math.max(...Object.values(i.puntajes)), 0),
  },
}

// ── Per-section element listing (for the gallery) ─────────────────────────

export interface MockElementoResumen {
  sesion: Sesion
  tieneContenido: boolean
}

export const MOCK_ELEMENTOS_POR_SECCION: Record<string, MockElementoResumen[]> = {
  consignas: [{ sesion: MOCK_SESION_PC1, tieneContenido: true }],
  rubricas: [{ sesion: MOCK_SESION_PORTAFOLIO1, tieneContenido: true }],
  matriz: [{ sesion: MOCK_SESION_LC2, tieneContenido: true }],
  'lista-cotejo': [{ sesion: MOCK_SESION_APF1, tieneContenido: true }],
  escala: [{ sesion: MOCK_SESION_APF1, tieneContenido: true }],
}
