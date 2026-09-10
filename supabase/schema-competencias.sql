-- Diseña+ — Programas / Competencias extension
--
-- Adds the relational layer found in the original SharePoint exports
-- (PROGRAMAS.csv, COMPTENCIAS_PARA MAPEO.csv, REL_RUBRICA_COMPETENCIAS.csv,
-- TAXONOMIA_MATRIZ_SN_RUBRICA.csv, LISTADO_CURSOS_PARA_IA.csv) that the first
-- migration pass left out. Run this AFTER schema.sql (it references dpl_curso
-- and dpl_rubricacriterio), then run the output of
-- scripts/migrate-competencias.cjs to load the data.

create extension if not exists pgcrypto;

-- ── Extra Consigna column (from CONSOLIDADO_CONSIGNAS.csv) ──────────────────
alter table dpl_consigna
  add column if not exists dpl_instrumento text;

-- ── Extra Curso columns (from LISTADO_CURSOS_PARA_IA.csv) ────────────────────
alter table dpl_curso
  add column if not exists dpl_docenteasignado text,
  add column if not exists dpl_horas integer,
  add column if not exists dpl_metodologia text,
  add column if not exists dpl_software text,
  add column if not exists dpl_ia_consigna_corrido boolean,
  add column if not exists dpl_ia_rubrica_corrido boolean,
  add column if not exists dpl_ia_matrizconrubrica_corrido boolean,
  add column if not exists dpl_ia_matrizsinrubrica_corrido boolean,
  add column if not exists dpl_ia_escala_corrido boolean,
  add column if not exists dpl_ia_lista_corrido boolean,
  add column if not exists dpl_ia_sesiones_corrido boolean,
  add column if not exists dpl_notif_consigna_enviada boolean,
  add column if not exists dpl_notif_rubrica_enviada boolean,
  add column if not exists dpl_notif_matrizsinrubrica_enviada boolean,
  add column if not exists dpl_notif_escala_enviada boolean,
  add column if not exists dpl_notif_lista_enviada boolean;

-- ── Programa ─────────────────────────────────────────────────────────────────
create table if not exists dpl_programa (
  dpl_programaid uuid primary key default gen_random_uuid(),
  dpl_idprogramatext text unique,
  dpl_nombre text,
  createdon timestamptz not null default now()
);

-- ── Curso <-> Programa (many-to-many) ─────────────────────────────────────
create table if not exists dpl_cursoprograma (
  dpl_cursoprogramaid uuid primary key default gen_random_uuid(),
  dpl_cursoid uuid references dpl_curso (dpl_cursoid) on delete cascade,
  dpl_programaid uuid references dpl_programa (dpl_programaid) on delete cascade,
  createdon timestamptz not null default now(),
  unique (dpl_cursoid, dpl_programaid)
);
create index if not exists idx_cursoprograma_curso on dpl_cursoprograma (dpl_cursoid);
create index if not exists idx_cursoprograma_programa on dpl_cursoprograma (dpl_programaid);

-- ── Competencia (catalog) ──────────────────────────────────────────────────
create table if not exists dpl_competencia (
  dpl_competenciaid uuid primary key default gen_random_uuid(),
  dpl_idcompetenciatext text unique,
  dpl_competencia text,
  dpl_descripcion text,
  dpl_tipocompetencia text,
  dpl_catalogoevidencia boolean,
  createdon timestamptz not null default now()
);

-- ── Curso+Programa <-> Competencia (which competencies a course maps to) ──
create table if not exists dpl_cursoprogramacompetencia (
  dpl_cursoprogramacompetenciaid uuid primary key default gen_random_uuid(),
  dpl_cursoid uuid references dpl_curso (dpl_cursoid) on delete cascade,
  dpl_programaid uuid references dpl_programa (dpl_programaid) on delete cascade,
  dpl_competenciaid uuid references dpl_competencia (dpl_competenciaid) on delete cascade,
  dpl_nivel integer,
  dpl_cursoevidencia boolean,
  dpl_competenciaevidencia boolean,
  createdon timestamptz not null default now()
);
create index if not exists idx_cpc_curso on dpl_cursoprogramacompetencia (dpl_cursoid);
create index if not exists idx_cpc_competencia on dpl_cursoprogramacompetencia (dpl_competenciaid);

-- ── Criterio de Rúbrica <-> Competencia (which competency each criterion evidences) ──
create table if not exists dpl_rubricacriteriocompetencia (
  dpl_rubricacriteriocompetenciaid uuid primary key default gen_random_uuid(),
  dpl_rubricacriterioid uuid references dpl_rubricacriterio (dpl_rubricacriterioid) on delete cascade,
  dpl_competenciaid uuid references dpl_competencia (dpl_competenciaid) on delete cascade,
  dpl_nivel integer,
  dpl_competenciaevidencia boolean,
  createdon timestamptz not null default now()
);
create index if not exists idx_rcc_criterio on dpl_rubricacriteriocompetencia (dpl_rubricacriterioid);
create index if not exists idx_rcc_competencia on dpl_rubricacriteriocompetencia (dpl_competenciaid);

-- ── Taxonomía de Bloom -> Tipo de Ítem -> etiqueta (catalog for Matriz dropdowns) ──
create table if not exists dpl_taxonomiaitem (
  dpl_taxonomiaitemid uuid primary key default gen_random_uuid(),
  dpl_taxonomia text,
  dpl_tipoitem text,
  dpl_nombreplataforma text,
  dpl_orden integer,
  createdon timestamptz not null default now()
);
create index if not exists idx_taxonomiaitem_taxonomia on dpl_taxonomiaitem (dpl_taxonomia);

-- ── Row Level Security (same permissive policy as schema.sql — see its note) ──
do $$
declare
  t text;
begin
  for t in
    select unnest(array[
      'dpl_programa', 'dpl_cursoprograma', 'dpl_competencia',
      'dpl_cursoprogramacompetencia', 'dpl_rubricacriteriocompetencia',
      'dpl_taxonomiaitem'
    ])
  loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'drop policy if exists "allow_all_%1$s" on %1$I; create policy "allow_all_%1$s" on %1$I for all using (true) with check (true);',
      t
    );
  end loop;
end $$;
