-- Diseña+ — Postgres schema for Supabase
--
-- Mirrors the 12-table Dataverse data model documented in .datamodel-manifest.json,
-- keeping the original `dpl_`-prefixed column names so the existing TypeScript
-- mapper functions (src/types/*.ts) work unchanged against Supabase rows.
--
-- Run this once in the Supabase SQL Editor (Project -> SQL Editor -> New query)
-- before running seed.sql.

create extension if not exists pgcrypto;

-- ── Curso ────────────────────────────────────────────────────────────────────
create table if not exists dpl_curso (
  dpl_cursoid uuid primary key default gen_random_uuid(),
  dpl_nombrecurso text,
  dpl_idcursotext text,
  dpl_codigocatalogo text,
  dpl_carrera text,
  dpl_tipoensenanza text,
  dpl_ciclo integer,
  dpl_logrocurso text,
  dpl_permiteconsignas boolean not null default false,
  dpl_permiterubricas boolean not null default false,
  dpl_permitematrizsn boolean not null default false,
  dpl_permitelistacotejo boolean not null default false,
  dpl_permiteescala boolean not null default false,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);

-- ── Unidad ───────────────────────────────────────────────────────────────────
create table if not exists dpl_unidad (
  dpl_unidadid uuid primary key default gen_random_uuid(),
  dpl_nombreunidad text,
  dpl_idunidadtext text,
  dpl_numerounidad integer,
  dpl_logroespecifico text,
  dpl_cursoid uuid references dpl_curso (dpl_cursoid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_unidad_curso on dpl_unidad (dpl_cursoid);

-- ── Sesión / Elemento ──────────────────────────────────────────────────────
create table if not exists dpl_sesion (
  dpl_sesionid uuid primary key default gen_random_uuid(),
  dpl_elemento text,
  dpl_idsesiontext text,
  dpl_abreviatura text,
  dpl_tema text,
  dpl_unidadid uuid references dpl_unidad (dpl_unidadid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_sesion_unidad on dpl_sesion (dpl_unidadid);

-- ── Consigna ─────────────────────────────────────────────────────────────────
create table if not exists dpl_consigna (
  dpl_consignaid uuid primary key default gen_random_uuid(),
  dpl_idconsignatext text,
  dpl_queseevaluara text,
  dpl_indicaciongeneral text,
  dpl_indicacionesespecificas text,
  dpl_recomendaciones text,
  dpl_anexo text,
  dpl_estado text,
  dpl_activado boolean not null default false,
  dpl_usuarioregistro text,
  dpl_fecharegistro timestamptz,
  dpl_sesionid uuid references dpl_sesion (dpl_sesionid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_consigna_sesion on dpl_consigna (dpl_sesionid);

-- ── Rúbrica ──────────────────────────────────────────────────────────────────
create table if not exists dpl_rubrica (
  dpl_rubricaid uuid primary key default gen_random_uuid(),
  dpl_nombre text,
  dpl_estado text,
  dpl_activado boolean not null default false,
  dpl_usuarioregistro text,
  dpl_fecharegistro timestamptz,
  dpl_sesionid uuid references dpl_sesion (dpl_sesionid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_rubrica_sesion on dpl_rubrica (dpl_sesionid);

-- ── Criterio de Rúbrica ────────────────────────────────────────────────────
create table if not exists dpl_rubricacriterio (
  dpl_rubricacriterioid uuid primary key default gen_random_uuid(),
  dpl_criterio text,
  dpl_orden integer,
  dpl_definicioncriterio text,
  dpl_estandaresperado text,
  dpl_puntajeestandar numeric(6, 2),
  dpl_enproceso2 text,
  dpl_puntajeenproceso2 numeric(6, 2),
  dpl_enproceso1 text,
  dpl_puntajeenproceso1 numeric(6, 2),
  dpl_inicial text,
  dpl_puntajeinicial numeric(6, 2),
  dpl_rubricaid uuid references dpl_rubrica (dpl_rubricaid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_rubricacriterio_rubrica on dpl_rubricacriterio (dpl_rubricaid);

-- ── Matriz ───────────────────────────────────────────────────────────────────
create table if not exists dpl_matriz (
  dpl_matrizid uuid primary key default gen_random_uuid(),
  dpl_nombre text,
  dpl_estado text,
  dpl_activado boolean not null default false,
  dpl_usuarioregistro text,
  dpl_fecharegistro timestamptz,
  dpl_sesionid uuid references dpl_sesion (dpl_sesionid) on delete cascade,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_matriz_sesion on dpl_matriz (dpl_sesionid);

-- ── Pregunta de Matriz ─────────────────────────────────────────────────────
create table if not exists dpl_matrizpregunta (
  dpl_matrizpreguntaid uuid primary key default gen_random_uuid(),
  dpl_ejetematico text,
  dpl_orden integer,
  dpl_taxonomia text,
  dpl_tipoitem text,
  dpl_plataforma text,
  dpl_cantidaditems integer,
  dpl_puntajeia numeric(6, 2),
  dpl_matrizid uuid references dpl_matriz (dpl_matrizid) on delete cascade,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_matrizpregunta_matriz on dpl_matrizpregunta (dpl_matrizid);

-- ── Lista de Cotejo ──────────────────────────────────────────────────────────
create table if not exists dpl_listacotejo (
  dpl_listacotejoid uuid primary key default gen_random_uuid(),
  dpl_nombre text,
  dpl_estado text,
  dpl_activado boolean not null default false,
  dpl_usuarioregistro text,
  dpl_fecharegistro timestamptz,
  dpl_sesionid uuid references dpl_sesion (dpl_sesionid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_listacotejo_sesion on dpl_listacotejo (dpl_sesionid);

-- ── Indicador de Lista de Cotejo ───────────────────────────────────────────
-- dpl_respuesta mirrors the original Dataverse picklist values: 100000000 = Sí, 100000001 = No.
create table if not exists dpl_listacotejoindicador (
  dpl_listacotejoindicadorid uuid primary key default gen_random_uuid(),
  dpl_indicador text,
  dpl_orden integer,
  dpl_puntaje numeric(6, 2),
  dpl_respuesta integer,
  dpl_observaciones text,
  dpl_listacotejoid uuid references dpl_listacotejo (dpl_listacotejoid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_listacotejoindicador_lista on dpl_listacotejoindicador (dpl_listacotejoid);

-- ── Escala de Valoración ───────────────────────────────────────────────────
create table if not exists dpl_escalavaloracion (
  dpl_escalavaloracionid uuid primary key default gen_random_uuid(),
  dpl_nombre text,
  dpl_estado text,
  dpl_activado boolean not null default false,
  dpl_usuarioregistro text,
  dpl_fecharegistro timestamptz,
  dpl_sesionid uuid references dpl_sesion (dpl_sesionid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_escalavaloracion_sesion on dpl_escalavaloracion (dpl_sesionid);

-- ── Indicador de Escala ────────────────────────────────────────────────────
create table if not exists dpl_escalaindicador (
  dpl_escalaindicadorid uuid primary key default gen_random_uuid(),
  dpl_indicador text,
  dpl_orden integer,
  dpl_puntajeexcelente numeric(6, 2),
  dpl_puntajebueno numeric(6, 2),
  dpl_puntajeregular numeric(6, 2),
  dpl_puntajeconerrores numeric(6, 2),
  dpl_puntajenoevidenciado numeric(6, 2),
  dpl_respuestaseleccionada text,
  dpl_observaciones text,
  dpl_escalavaloracionid uuid references dpl_escalavaloracion (dpl_escalavaloracionid) on delete cascade,
  statecode integer not null default 0,
  statuscode integer not null default 1,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists idx_escalaindicador_escala on dpl_escalaindicador (dpl_escalavaloracionid);

-- ── Row Level Security ─────────────────────────────────────────────────────
-- This is a single-tenant teaching-tool exercise with no per-row ownership model
-- yet, and the app currently authenticates with a placeholder (mock) login rather
-- than real Supabase Auth. Enable RLS (so it's on record and easy to tighten
-- later) but allow full access to both the anon and authenticated roles for now.
-- Tighten this — e.g. restrict writes to `authenticated` only — once real
-- Supabase Auth (restricted to @utp.edu.pe) is wired up.
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'dpl_curso', 'dpl_unidad', 'dpl_sesion', 'dpl_consigna',
      'dpl_rubrica', 'dpl_rubricacriterio',
      'dpl_matriz', 'dpl_matrizpregunta',
      'dpl_listacotejo', 'dpl_listacotejoindicador',
      'dpl_escalavaloracion', 'dpl_escalaindicador'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'drop policy if exists "allow_all_%1$s" on %1$I; create policy "allow_all_%1$s" on %1$I for all using (true) with check (true);',
      t
    );
  end loop;
end $$;
