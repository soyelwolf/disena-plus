-- Diseña+ — flujo de edición y aprobación del "Diseño de contenido académico"
-- Additive DDL: run once in the Supabase SQL Editor, after schema.sql and
-- schema-competencias.sql. Safe to re-run.
--
-- Process state machine (one row per course and process):
--   en_edicion ──(all required instruments finalized)──► revision_monitor
--   revision_monitor ──(Monitor EA aprueba)──► revision_dda
--   revision_dda ──(DDA aprueba)──► aprobado  (everything frozen)
--   revision_* ──(devuelve con comentarios)──► en_edicion
--   any ──(Monitor EA habilita edición)──► en_edicion  (approval starts over)

-- ── Competencias elegidas por criterio, por programa ─────────────────────────
-- The rubric itself is shared by every programme of the course; only which
-- competencias each criterion evidences differs per programme.
alter table dpl_rubricacriteriocompetencia
  add column if not exists dpl_programaid uuid references dpl_programa (dpl_programaid) on delete cascade;

-- ── Estado del proceso por curso ─────────────────────────────────────────────
create table if not exists dpl_procesocurso (
  dpl_procesocursoid uuid primary key default gen_random_uuid(),
  dpl_cursoid uuid not null references dpl_curso (dpl_cursoid) on delete cascade,
  dpl_proceso text not null default 'contenido_academico',
  dpl_estado text not null default 'en_edicion'
    check (dpl_estado in ('en_edicion', 'revision_monitor', 'revision_dda', 'aprobado')),
  dpl_consignas_finalizado boolean not null default false,
  dpl_rubricas_finalizado boolean not null default false,
  dpl_matriz_finalizado boolean not null default false,
  dpl_lista_finalizado boolean not null default false,
  dpl_escala_finalizado boolean not null default false,
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now(),
  unique (dpl_cursoid, dpl_proceso)
);

-- ── Historial: finalizaciones, aprobaciones, devoluciones, reaperturas ───────
create table if not exists dpl_procesoevento (
  dpl_procesoeventoid uuid primary key default gen_random_uuid(),
  dpl_cursoid uuid not null references dpl_curso (dpl_cursoid) on delete cascade,
  dpl_proceso text not null default 'contenido_academico',
  -- finalizado | enviado | aprobado | devuelto | habilitado
  dpl_accion text not null,
  dpl_instrumento text,
  dpl_rol text,
  dpl_usuario text,
  dpl_comentario text,
  createdon timestamptz not null default now()
);
create index if not exists dpl_procesoevento_curso_idx on dpl_procesoevento (dpl_cursoid, createdon);

-- ── Comentarios de los aprobadores sobre un elemento o un criterio ───────────
create table if not exists dpl_comentario (
  dpl_comentarioid uuid primary key default gen_random_uuid(),
  dpl_cursoid uuid not null references dpl_curso (dpl_cursoid) on delete cascade,
  dpl_instrumento text not null,         -- consignas | rubricas | ...
  dpl_entidadid uuid not null,           -- dpl_consignaid / dpl_rubricacriterioid
  dpl_autor text,
  dpl_rol text,
  dpl_texto text not null,
  createdon timestamptz not null default now()
);
create index if not exists dpl_comentario_curso_idx on dpl_comentario (dpl_cursoid, dpl_instrumento);

-- ── Row Level Security (same permissive policy as schema.sql — see its note) ──
do $$
declare t text;
begin
  foreach t in array array['dpl_procesocurso', 'dpl_procesoevento', 'dpl_comentario'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'drop policy if exists "allow_all_%1$s" on %1$I; create policy "allow_all_%1$s" on %1$I for all using (true) with check (true);',
      t
    );
  end loop;
end $$;
