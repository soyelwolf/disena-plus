-- Diseña+ — columnas completas de UNIDADES_CURSOS_IA y SESIONES_CURSOS_IA
-- Additive DDL: brings the two tables up to every column of the SharePoint
-- lists. Run once in the Supabase SQL Editor (safe to re-run), then load the
-- data with:  node scripts/completar-unidades-sesiones.cjs

-- ── UNIDADES_CURSOS_IA → dpl_unidad ─────────────────────────────────────────
-- Already there: ID_UNIDAD (dpl_idunidadtext), Unidad_S (dpl_numerounidad),
-- Título de unidad_S (dpl_nombreunidad), Logro específico (dpl_logroespecifico),
-- ID_CURSO (dpl_cursoid).
alter table dpl_unidad add column if not exists dpl_temasesiones text;                  -- Tema sesión X Unidad_S
alter table dpl_unidad add column if not exists dpl_elementoasignado text;              -- ElementoAsignado
alter table dpl_unidad add column if not exists dpl_nivelcomplejidad text;              -- Nivel de Complejidad
alter table dpl_unidad add column if not exists dpl_queseevaluar text;                  -- ¿Qué se debe evaluar en la actividad?
alter table dpl_unidad add column if not exists dpl_instrumentoevaluacion text;         -- ¿Qué instrumento (s) de evaluación se empleará?
alter table dpl_unidad add column if not exists dpl_elementocatalogo text;              -- Elemento_Catalogo
alter table dpl_unidad add column if not exists dpl_elementocatalogoabreviatura text;   -- Elemento_Catalogo: ABREVIATURA
alter table dpl_unidad add column if not exists dpl_elementocatalogodescripcion text;   -- Elemento_Catalogo: DESCRIPCIÓN
alter table dpl_unidad add column if not exists dpl_realizado boolean not null default false; -- Realizado

-- ── SESIONES_CURSOS_IA → dpl_sesion ─────────────────────────────────────────
-- Already there: ID_SESION (dpl_idsesiontext), ElementoAsignado (dpl_elemento),
-- Abreviatura_E (dpl_abreviatura), Tema sesión_S (dpl_tema), ID_UNIDAD (dpl_unidadid).
-- Every session of the syllabus lives here; the ones with an ElementoAsignado
-- are the "elementos de evaluación" shown in Consignas and Rúbricas.
alter table dpl_sesion add column if not exists dpl_herramientaia text;                 -- HERRAMIENTA_IA
alter table dpl_sesion add column if not exists dpl_semana integer;                     -- Semana_S
alter table dpl_sesion add column if not exists dpl_numerosesion integer;               -- Sesión_S
alter table dpl_sesion add column if not exists dpl_tiemposesionmin integer;            -- TIEMPO_SESION_MIN
alter table dpl_sesion add column if not exists dpl_actividad text;                     -- Actividad/ Observación_S
alter table dpl_sesion add column if not exists dpl_observacion text;                   -- Observación_E
alter table dpl_sesion add column if not exists dpl_peso numeric(6, 2);                 -- Peso_E
alter table dpl_sesion add column if not exists dpl_tipoobservacion text;               -- TIPO Observación_E
alter table dpl_sesion add column if not exists dpl_tieneelemento boolean not null default false; -- TIENE_ELEMENTO
alter table dpl_sesion add column if not exists dpl_realizado boolean not null default false;     -- RealizadoSesiones
