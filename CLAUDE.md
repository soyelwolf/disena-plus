# Diseña+ — contexto del proyecto

Plataforma web de la UTP para que docentes construyan el **Diseño de contenido académico** de sus
cursos (consignas + instrumentos de evaluación), con revisión y aprobación (Monitor EA → DDA).
Reemplaza el flujo anterior en Canvas App + listas de SharePoint + Power Automate.

- **Dueño del proyecto:** Fernando Bustamante (fbustamant@utp.edu.pe) — Administrador + Docente.
- **Diseño de referencia:** Figma "ED-CarpetaInstruccional"
  (https://www.figma.com/design/M4cWnMjQhexPDwjjooqr9d/ED-CarpetaInstruccional).
- **No tocar** la Canvas App ni las listas de SharePoint originales: todo aquí es una copia aparte.

## Cómo correrlo (VS Code)

```bash
npm install            # solo la primera vez
npm run dev            # abre http://localhost:5173
npx tsc --noEmit -p .  # revisar tipos
npm run build          # compilación de producción (carpeta dist/)
```

Si `npm` falla en esta máquina, usar Node directo:
`"C:\Program Files\nodejs\node.exe" node_modules/vite/bin/vite.js`.

Variables en `.env.local` (no se sube a Git; plantilla en `.env.example`):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (proyecto Supabase `ydtpvwyieizwwjaqrlxr`).
Supabase gratis **se pausa** tras días sin uso → entrar a supabase.com y "Restore project".

## Tecnologías y dependencias

| Pieza | Qué es |
|---|---|
| React 19 + TypeScript 5.7 | Interfaz |
| Vite 6 | Servidor de desarrollo y compilación |
| react-router-dom 7 | Rutas / pantallas |
| @supabase/supabase-js 2 | Base de datos Postgres en Supabase (reemplaza Dataverse/SharePoint) |
| csv-parse | Solo scripts de migración |

Sin librerías de UI: estilos propios en `src/styles/theme.css` (Lato + Archivo Black, verde UTP
`#005c4b`), íconos propios en `src/components/Icon.tsx`. Editor de texto enriquecido propio.

## Estructura

```
src/
  App.tsx                 rutas
  components/
    Layout.tsx            barra lateral verde + cabecera (Figma)
    ui.tsx                Modal, Drawer, Toast, Breadcrumbs, CursoHeader, ProgressBar…
    TextoEnriquecido.tsx  editor (negrita, listas anidadas con Tab, tablas) + VistaRica
    Aprobaciones.tsx      panel "Flujo de trabajo": Monitor EA → DDA, devolver, habilitar
    Comentarios.tsx       comentarios de aprobadores por consigna/criterio
  pages/
    Login.tsx             ingreso: solo correos registrados y activos en Usuarios (simulado: aún sin verificar el correo)
    ListadoCursos.tsx     tabla de cursos (solo asignados, salvo admin)
    HubCurso.tsx          curso por etapas: Mapeo (próx.) · Contenido académico · Instruccional (próx.)
    ConsignasPage.tsx     consignas: lista de elementos, autoguardado, finalizar, solo lectura
    RubricasPage.tsx      rúbricas: pestañas por programa, criterios, regla suma 20
    CriterioForm.tsx      agregar/editar criterios
    ListaCotejoPage.tsx   lista de cotejo: elementos a la izquierda, indicadores del elemento a la derecha
    IndicadoresForm.tsx   agregar/editar indicadores (autoguardado, como CriterioForm)
    EscalaPage.tsx, IndicadoresEscalaForm.tsx   escala de valoración (misma forma que Lista de cotejo)
    CentroDatos.tsx       admin: listas tipo SharePoint + Usuarios
    Soporte.tsx           canal de atención: analistas (Teams/correo) + chat de consultas con el admin
    Proximamente.tsx      Manuales, Lineamientos, Tutoriales (por construir)
    MatrizPage.tsx, MatrizForm.tsx   matriz con y sin rúbrica (misma forma que Lista de cotejo)
    SeccionIndice.tsx, detalle/*   pantallas ANTIGUAS (ya no se usan para Matriz; por retirar)
  shared/
    academico.ts          datos del proceso: curso, consignas, rúbricas, flujo, usuarios
    centroDatos.ts        catálogo de listas del Centro de datos (nombres SharePoint)
    textoRico.ts          HTML seguro ⇄ texto plano, conteo de caracteres
    AuthContext.tsx       sesión, roles múltiples y permisos
    services/, hooks/, powerPagesApi.ts, mockData.ts   capa antigua (aún usada por pantallas viejas)
supabase/                 scripts SQL (se pegan en el SQL Editor de Supabase)
scripts/                  migraciones con Node (CSV/Excel → Supabase)
importacion/              datos personales para importar (NO se sube a Git)
```

## Base de datos (Supabase)

Columnas con prefijo `dpl_` (heredado de Dataverse). Scripts, en orden: `schema.sql` →
`schema-competencias.sql` → `schema-storage.sql` → `schema-flujo.sql` → `schema-unidades-sesiones.sql` → `schema-catalogo-elementos.sql` → `schema-columnas-sharepoint.sql` → `schema-comentarios.sql` → `schema-backups.sql` → `schema-soporte.sql` → `schema-activacion.sql` → `schema-escala.sql` → `schema-notificaciones.sql` → `schema-competencias-sp.sql` (todos re-ejecutables).

- Catálogo: `dpl_curso`, `dpl_unidad` (logro específico; Elemento_Catalogo → `dpl_catalogoelemento` = CATALOGO_ELEMENTOS), `dpl_sesion` (todas las sesiones del sílabo; las que tienen `dpl_elemento` son elementos de evaluación),
  `dpl_programa`, `dpl_cursoprograma`, `dpl_competencia`, `dpl_cursoprogramacompetencia`.
- Contenido: `dpl_consigna` (instrumento + 4 campos), `dpl_rubrica` (1 por elemento),
  `dpl_rubricacriterio`, `dpl_rubricacriteriocompetencia` (competencia por criterio **y programa**),
  `dpl_matriz*`, `dpl_listacotejo*`, `dpl_escala*`, `dpl_taxonomiaitem`.
- Soporte: `dpl_soporte` (consulta: tema, asunto, estado abierto/respondido/cerrado) + `dpl_soportemensaje` (hilo). Los administradores responden desde la pestaña "Bandeja de soporte" (sin aviso por correo aún).
- Notificaciones (`notificaciones.ts`, `Campana.tsx`, tabla `dpl_notificacion`, una fila por destinatario): campana en la cabecera (se actualiza cada 20 s y al volver a la pestaña). Se generan en `registrarEvento` (finalizado/enviado → revisores; aprobado/devuelto/habilitado → docente y asesor y el otro revisor; incidencias → todo el equipo) y en `agregarComentario` (comentario de revisor → docente y asesor; respuesta → autor del comentario). Quien hace la acción no se notifica. Todo es dentro de la plataforma; a futuro: correo diario con el resumen de no leídas.
- Tarjetas del curso: comentarios pendientes por parte y en qué va la revisión (Finalizado · falta terminar otras partes / En revisión del Monitor EA / Aprobado por Monitor EA · falta DDA / Aprobado).
- Centro de datos: "Agregar fila" y pegar filas nuevas desde Excel en las listas con `agregar: true` (cursos, unidades, sesiones, catálogo, programas, competencias, mapeos); referencias elegibles por tabla con `referenciasEditables` (al pegar: código C14/U69/S313 o nombre exacto).
- Flujo: `dpl_procesocurso` (estado por curso), `dpl_procesoevento` (historial), `dpl_comentario`.
- Acceso: `dpl_usuario` (correo, nombre, roles[]), `dpl_cursoasignacion` (curso × usuario × rol:
  `asignado` = Persona Asignada, `docente`, `asesor`, `monitor_ea` = Monitor EA (la palabra "DCI" ya no se usa en la interfaz; solo queda en nombres de columnas antiguas de SharePoint), `monitor_qa`, `monitor_disena`, `dda`).
- Seguridad: RLS con políticas abiertas (`allow_all`) — **pendiente** cerrarlas antes de publicar.

## Reglas de negocio (del Figma y del usuario)

- Alcance actual: **solo Diseño de contenido académico** (consignas + instrumentos). Mapeo y
  Contenido instruccional (sesiones/PPT) aún no.
- `ID_CONSIGNA_TEXT` = curso-unidad-sesión (C16-U69-S313), función `idConsigna`. Adjuntos por consigna en Storage `adjuntos/consigna/<id>/`. Columnas IA (JSON, RESULTADO_GPT, MODELO_IA, HERRAMIENTA_IA) en consigna y cabeceras de instrumentos.
- Rúbricas sigue al instrumento de la consigna: elementos con rúbrica cuya consigna ya no la usa salen como "sobrantes" (botón Quitar de Rúbricas: borra criterios, competencias y comentarios, con confirmación) y no cuentan para finalizar; si una consigna pasa a usar rúbrica, "Agregar a Rúbricas". Los instrumentos se activan cuando todas las consignas tienen instrumento ("no aplica" cuenta). Al cambiar el instrumento en Consignas, si el elemento ya tiene contenido en el instrumento anterior (`contenidoDeElemento`), se pide confirmación con motivo opcional; todo cambio de instrumento (y todo "Quitar" de un sobrante) queda como **incidencia** en el historial del curso (`dpl_procesoevento`, acciones `cambio_instrumento` / `quitado`, `registrarIncidencia`), visible en «Flujo de trabajo».
- Lista de cotejo (`listaCotejo.ts`, `REGLAS_LISTA`, `advertenciasLista`): sigue al instrumento de la consigna igual que Rúbricas (sobrantes/faltantes). Hasta 10 indicadores (Indicador, Puntaje, Observaciones; Sí/No se llena al calificar) y los puntajes suman 20. Observaciones es opcional y lleva poco espacio (el indicador se lleva el ancho; aplicar lo mismo en Escala de valoración). Límites: indicador 250, observaciones 500 (el Figma dice 100, pero los datos reales llegan a 180). Avisos arriba mientras se trabaja (ámbar) y en rojo tras "Finalizar"; son requisito para finalizar. Centro de datos: LISTA_DE_COTEJO y ESCALA_DE_VALORACION = una fila por elemento con los indicadores 1..10 en columnas, en el orden del export de SharePoint (escala: Consolidado_n, En desarrollo_n, En inicio_n, No evidenciado_n, Observaciones_n, Errores_n = dpl_puntajeconerrores); la lista por indicador queda como "· indicadores".
- Centro de datos = listas de SharePoint: columnas en el orden del Excel `DISEÑA+.xlsx` (OneDrive, carpeta Sharepoint). Una fila por elemento en CONSOLIDADO_RUBRICAS, LISTA_DE_COTEJO, ESCALA_DE_VALORACION y MATRIZ_SN_RUBRICA (preguntas 1..10 agrupadas por campo); la lista por ítem queda como «· criterios / indicadores» (Matriz no: todo se maneja en MATRIZ_SN_RUBRICA; escribir en las columnas de la siguiente pregunta libre la crea). TAXONOMIA_MATRIZ_SN_RUBRICA es solo lectura (catálogo fijo). Las columnas de revisión de SharePoint (Comentario*, *_Check, *_Hora, DocyAse) no se copian: están en los comentarios. Filas en orden de creación (lo nuevo al final); columnas redimensionables (se recuerda por navegador). Competencias = 2 listas: PROGRAMAS (`dpl_programa` + `dpl_cursoid`) y COMPETENCIAS (antes COMPTENCIAS_PARA MAPEO en SharePoint; (`dpl_competencia` + curso/programa/nivel/evidencias); `schema-competencias-sp.sql` y triggers mantienen `dpl_cursoprograma` y `dpl_cursoprogramacompetencia` (que leen Rúbricas y el curso). Las referencias elegibles se muestran con su código (C14, U69, P004).
- Centro de datos: columnas movibles (arrastrar el encabezado) y redimensionables, recordadas por lista en el navegador, con "Restablecer columnas". Los textos con formato se editan en un panel ancho con guardado automático y Anterior/Siguiente (Alt+↑/↓). Los datos de curso/unidad/sesión quedan bloqueados (se corrigen en su lista); los criterios/indicadores/preguntas en columnas sí se editan (`destino` en CONTEXTO).
- Centro de datos: selección de filas (casillas a la izquierda, Shift+clic para un rango, marcar todas las visibles) y "Eliminar" en bloque (botón o Supr) con confirmación que muestra curso · modalidad · unidad · elemento de cada fila. Borrar no se puede deshacer.
- Centro de datos: Deshacer (botón y Ctrl+Z fuera de una celda) revierte la última edición o el último pegado (hasta 30).
- Centro de datos tipo Excel: las celdas de texto/número se escriben en la misma tabla (Enter baja, Tab avanza, Esc cancela, Alt+Enter salto de línea) y se puede pegar un bloque copiado de Excel desde la celda elegida. Texto enriquecido, opciones, referencias y personas siguen con su panel.
- Reactivar: activar es una sola vez, pero en "Asignar procesos" el admin tiene "Preparar nuevos" (vuelve a correr `activarProceso`, que solo crea lo que falta) para consignas que eligieron el instrumento después de activar. La tarjeta del curso muestra "N elementos nuevos por agregar".
- Escala de valoración (`escala.ts`, `REGLAS_ESCALA`, `advertenciasEscala`): misma forma que Lista de cotejo; 1 a 10 indicadores; observaciones opcional; el último nivel vale 0 (No presenta / No evidenciado / Nunca) y no se edita. En cada indicador los puntajes bajan sin repetirse y el último nivel con puntaje > 0. Dos tipos: **administración** (consigna "escala de valoración (administración)", cursos DDA de administración/contabilidad/economía): Excelente suma 20, Bueno máx. 17, Regular máx. 14, Con varios errores máx. 10 (solo máximos, confirmado). **Normal**: el docente elige Cualitativa (Consolidado, En desarrollo, En inicio, No evidenciado), Cuantitativa (Siempre, Casi siempre, Algunas veces, Nunca) o Mixta (ambos nombres) en `dpl_tipoescala`; nivel 1 suma 20, nivel 2 mín. 12, nivel 3 máx. 11. Puntajes por posición: nivel 1-3 = dpl_puntajeconsolidado/endesarrollo/eninicio, nivel 4 admin = dpl_puntajeconerrores (Errores_n), cero = dpl_puntajenoevidenciado; lo importado estaba en excelente/bueno/regular (`schema-escala.sql` lo copia; el código también lo lee).
- Activación separada de la IA (`schema-activacion.sql`): Activado_* (dpl_activado_*) = se jalaron los datos del curso al proceso; IA_Para*_Corrido queda solo para IA, que se trabajará por elemento dentro de cada proceso.
- Consignas: instrumento Rúbrica / Matriz (con o sin rúbrica) / Lista de cotejo / Escala (normal o
  "cursos DDA administración"). Límites: Indicación general 2000, Indicaciones específicas 10000,
  Recomendaciones 2000, Anexo 15000 (en `LIMITES`, `academico.ts`).
- Reglas de rúbrica (`REGLAS_RUBRICA`, `advertenciasRubrica`): 4 a 10 criterios; estándar esperado suma 20; Inicial suma entre 2 y 10; puntajes solo números (entero o decimal), completos, bajando de nivel en nivel sin repetirse (6-5-3-1). Son avisos al trabajar y requisito para Finalizar.
- «Qué se evaluará» (`dpl_consigna.dpl_queseevaluara`, QUE_SE_EVALUARA) = Formato de orientación desagregado por elemento, solo lectura. `RecursosCurso.tsx` muestra en cada pantalla de elemento (consignas, rúbricas, lista, escala y sus editores) los botones Qué se evaluará · Sílabo · Formato de orientación. Los puntajes tienen − / + (0.5) en los tres editores.
- Competencias en Rúbricas: pestañas = programas del curso; en cada una, solo las competencias de ese curso y programa (COMPETENCIAS). Marcar competencias en un criterio es opcional (no se exige para finalizar), pero si un programa no tiene ninguna cargada, la pestaña muestra un ícono y un aviso para escribir al administrador (Soporte).
- Rúbrica: **una sola por elemento**, idéntica en todos los programas; por programa solo cambian
  las competencias marcadas. En cada elemento la suma de "Estándar esperado" = **20**. Las alertas
  aparecen solo tras pulsar "Finalizar edición general".
- Flujo: "Finalizar edición general" **solo avisa** a Monitor EA y DDA (cuando todas las partes
  del proceso están finalizadas; hoy sin correo, solo cambia el estado). Se sigue editando hasta
  que estén **los dos checks** (Monitor EA y DDA): recién ahí se congela todo. Pueden devolver
  con comentarios. Solo **Monitor EA** puede "Habilitar edición"; la aprobación vuelve a empezar.
- BACKUP IA (`schema-backups.sql`): `dpl_consigna_backup`, `dpl_rubricacriterio_backup`,
  `dpl_matrizpregunta_backup`, `dpl_listacotejoindicador_backup`, `dpl_escalaindicador_backup`
  (todas las columnas de su lista + columnas IA + contexto + versión). Al generar con IA, llamar
  `guardarBackupIA` justo después de escribir la propuesta. `ComparadorIA` muestra propuesta IA
  vs versión final (Consignas y Rúbricas). MATRIZ_SN_RUBRICA = toda Matriz (con y sin rúbrica).
  Escala usa los niveles de SharePoint: Consolidado, En desarrollo, En inicio, No evidenciado.
- Comentarios por ítem (`dpl_comentario`: entidad + campo, hilo con `dpl_padreid`, cita
  resaltada, resuelto): Monitor EA/DDA abren comentarios en cualquier momento (no bloquean);
  docente y asesor responden; solo el autor marca "resuelto". Ícono: + / 1 / 2 (lados con
  pendientes) / ✓. Componente `Comentarios.tsx` (BotonComentarios, ZonaComentable, PanelComentarios).
- Activación (como los flujos CONSOLIDADO_INPUTS_* de Power Automate): el admin habilita procesos por curso (`Permite_*`); el docente pulsa **ACTIVAR** una sola vez por proceso (Consignas primero). Consignas crea una consigna por elemento; cada instrumento crea su cabecera por elemento cuya consigna lo eligió (Rúbrica = `rúbrica` + `matriz con rúbrica`). Estado ACTIVADO = columnas `dpl_ia_*_corrido`. Lógica en `activarProceso` (`academico.ts`).
- Visibilidad: **Persona Asignada** decide quién ve el curso: nadie más lo ve (salvo el admin, que puede marcar "Ver todos"). Al poner a alguien en cualquier otra columna de rol, también se le agrega a Persona Asignada.
- Roles: **manda el rol en cada curso** (columnas de personas de LISTADO_CURSOS_PARA_IA =
  `dpl_cursoasignacion`): la misma persona puede ser Monitor EA en un curso y DDA o asesor en otro.
  `useContenidoAcademico` devuelve `rol`: editar = Docente o Asesor (hacen lo mismo); monitor = Monitor EA (aprueba y habilita edición); dda (aprueba); revisor = Monitor EA/QA/Diseña+ o DDA (abren y resuelven comentarios; QA y Diseña+ no aprueban y comentan del lado de los monitores con su propia etiqueta). Persona Asignada sola = solo ver. El importador sigue mapeando la columna SharePoint DocenteyAsesor a `docente`. La lista
  **Usuarios** (`dpl_usuario.roles`) solo sirve para poder entrar y para **Administrador** (Centro de
  datos, ver todos los cursos, asignar procesos); el admin sin rol en el curso solo ve.
- IA: botones visibles pero **sin generar** hasta definir el flujo. En Power Automate era: flujo 1
  junta datos del curso y los reparte por elemento → flujo 2 llama a OpenAI por elemento con el
  prompt según tipo (Matriz y Escala tienen 2 prompts cada una).

## Dónde quedamos (25-sep-2026)

- Última sesión: pantallas de **Matriz** (con y sin rúbrica), editor compacto en dos zonas («Datos para generar» | «Indicador (+ criterio) y puntajes»), botón «Logros», MATRIZ_SN_RUBRICA como única lista de Matriz en Centro de datos (sin «· preguntas») y TAXONOMIA_MATRIZ_SN_RUBRICA bloqueada. Ingreso simulado: solo correos registrados y activos.
- **Sin subir a GitHub**: todos esos cambios están solo en esta PC (Login, AuthContext, academico, centroDatos, CentroDatos, HubCurso, App, RecursosCurso, Icon, notificaciones, theme.css, matriz.ts, MatrizPage, MatrizForm, CLAUDE.md). Subir solo cuando Fernando diga «súbelo».
- Por confirmar con Fernando: qué datos de «Datos para generar» se exportan en sin rúbrica; si la Unidad va en la misma línea que Taxonomía/Tipo (más bajo); propuesta de aprobadores por curso (esperando su sí); retirar pantallas antiguas (SeccionIndice, detalle/*).
- Siguiente gran paso: IA (prompts por parte) cuando Fernando termine de pasar reglas del «cascarón».

## Pendientes

- Aprobadores por curso: decidir qué revisores aprueban en cada curso (hoy fijo Monitor EA → DDA; QA y Diseña+ solo comentan). Se aprueba o devuelve el curso completo, no por instrumento.
- Copiar un curso base a sus otras modalidades (la base es Presencial; si solo hay virtuales, la base es 24/7): el usuario lo explicará.


1. Importar personas y asignaciones desde un **export actualizado** de `LISTADO_CURSOS_PARA_IA`
   (`scripts/importar-usuarios.cjs`; el Excel de OneDrive está desactualizado).
2. Definir si Monitor QA y Monitor Diseña+ deben aprobar (hoy solo comentan).
3. Matriz: hecha (`shared/matriz.ts`). Reglas: 1–10 indicadores; P. estándar = P. por ítem × ítems y la suma debe ser 20 (candado). Con rúbrica: tiene Criterio, 1 ítem fijo, tipo de ítem sin filtro. Sin rúbrica: la taxonomía filtra los tipos (`dpl_taxonomiaitem`), ítems 1–10. Plataforma = nombre en plataforma del tipo. Botón «Logros» (unidad y curso). Cada indicador: «Datos para generar» (unidad, eje, taxonomía, tipo, ítems) y el protagonista «Indicador (+ criterio) y puntajes», que llena la IA o el docente y es lo que se exporta (sin rúbrica también se exporta parte de lo elegido en taxonomía; con rúbrica casi no). No mostrar esa explicación en pantalla. IA pendiente: generará indicador (+ criterio) y puntajes.
4. Ingreso real (enlace al correo o Microsoft UTP con Supabase Auth). Recién con eso se escribe y prueba el script de RLS por rol (+ script de reversa): con el ingreso simulado la base ve a todos como anónimos, así que hoy los permisos solo los aplica la app. Monitores y DDA solo comentan (no editan), salvo que el área decida otra cosa.
5. Publicar: desplegar en Vercel (el código ya está en GitHub).
6. Tutoriales, Manuales, Lineamientos; generación con IA. Aviso por correo/Teams al llegar una consulta de soporte.

## Convenciones

- Textos de la interfaz en español; código y comentarios en inglés, como el código existente.
- Rama principal: `master` (repositorio privado https://github.com/soyelwolf/disena-plus). Commits con mensaje descriptivo y luego `git push`.
- No subir `.env.local`, `importacion/` ni datos personales.
