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
    Login.tsx             ingreso por correo @utp.edu.pe (modo demo, sin enlace real aún)
    ListadoCursos.tsx     tabla de cursos (solo asignados, salvo admin)
    HubCurso.tsx          curso por etapas: Mapeo (próx.) · Contenido académico · Instruccional (próx.)
    ConsignasPage.tsx     consignas: lista de elementos, autoguardado, finalizar, solo lectura
    RubricasPage.tsx      rúbricas: pestañas por programa, criterios, regla suma 20
    CriterioForm.tsx      agregar/editar criterios
    CentroDatos.tsx       admin: listas tipo SharePoint + Usuarios
    Proximamente.tsx      Manuales, Lineamientos, Tutoriales, Soporte (por construir)
    SeccionIndice.tsx, detalle/*   pantallas ANTIGUAS de Matriz/Lista/Escala (por rehacer)
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
`schema-competencias.sql` → `schema-storage.sql` → `schema-flujo.sql` (todos re-ejecutables).

- Catálogo: `dpl_curso`, `dpl_unidad` (logro específico), `dpl_sesion` (= elemento de evaluación),
  `dpl_programa`, `dpl_cursoprograma`, `dpl_competencia`, `dpl_cursoprogramacompetencia`.
- Contenido: `dpl_consigna` (instrumento + 4 campos), `dpl_rubrica` (1 por elemento),
  `dpl_rubricacriterio`, `dpl_rubricacriteriocompetencia` (competencia por criterio **y programa**),
  `dpl_matriz*`, `dpl_listacotejo*`, `dpl_escala*`, `dpl_taxonomiaitem`.
- Flujo: `dpl_procesocurso` (estado por curso), `dpl_procesoevento` (historial), `dpl_comentario`.
- Acceso: `dpl_usuario` (correo, nombre, roles[]), `dpl_cursoasignacion` (curso × usuario × rol:
  `asignado` = Persona Asignada, `docente` = DocenteyAsesor, `monitor_ea` = DCI, `dda`).
- Seguridad: RLS con políticas abiertas (`allow_all`) — **pendiente** cerrarlas antes de publicar.

## Reglas de negocio (del Figma y del usuario)

- Alcance actual: **solo Diseño de contenido académico** (consignas + instrumentos). Mapeo y
  Contenido instruccional (sesiones/PPT) aún no.
- Consignas: instrumento Rúbrica / Matriz (con o sin rúbrica) / Lista de cotejo / Escala (normal o
  "cursos DDA administración"). Límites: Indicación general 2000, Indicaciones específicas 10000,
  Recomendaciones 2000, Anexo 15000 (en `LIMITES`, `academico.ts`).
- Rúbrica: **una sola por elemento**, idéntica en todos los programas; por programa solo cambian
  las competencias marcadas. En cada elemento la suma de "Estándar esperado" = **20**. Las alertas
  aparecen solo tras pulsar "Finalizar edición general".
- Flujo: el docente finaliza cada instrumento; cuando todos están finalizados pasa a revisión.
  Aprueba **Monitor EA** y luego **DDA** (DDA cierra y congela todo). Pueden devolver con
  comentarios. Solo **Monitor EA** puede "Habilitar edición" (incluso tras DDA); la aprobación
  vuelve a empezar.
- Visibilidad: **solo Administrador ve todos los cursos**; el resto ve sus cursos asignados.
- Roles: administrador, docente, asesor, monitor_ea, monitor_qa, monitor_disena, dda (se pueden
  sumar más). Las pantallas revisan **permisos** (`editar_contenido`, `aprobar_proceso`,
  `administrar_datos`, `ver_todo`), no nombres de rol.
- IA: botones visibles pero **sin generar** hasta definir el flujo. En Power Automate era: flujo 1
  junta datos del curso y los reparte por elemento → flujo 2 llama a OpenAI por elemento con el
  prompt según tipo (Matriz y Escala tienen 2 prompts cada una).

## Pendientes

1. Importar personas y asignaciones desde un **export actualizado** de `LISTADO_CURSOS_PARA_IA`
   (`scripts/importar-usuarios.cjs`; el Excel de OneDrive está desactualizado).
2. Definir diferencia entre "Persona Asignada" y "DocenteyAsesor" (hoy ambos editan).
3. Rehacer Matriz, Lista de cotejo y Escala con el diseño del Figma.
4. Ingreso real por enlace al correo (Supabase Auth) y cerrar RLS por rol.
5. Publicar: subir a GitHub (repositorio privado) y desplegar en Vercel.
6. Tutoriales, Manuales, Lineamientos, Soporte; generación con IA.

## Convenciones

- Textos de la interfaz en español; código y comentarios en inglés, como el código existente.
- Trabajar en la rama `rediseno-figma`; commits con mensaje descriptivo.
- No subir `.env.local`, `importacion/` ni datos personales.
