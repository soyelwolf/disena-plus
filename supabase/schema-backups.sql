-- Diseña+ — SharePoint columns of Matriz / Lista de cotejo / Escala, and the
-- BACKUP lists of the IA proposals (run once in the Supabase SQL Editor; safe to re-run)
--
-- 1. Columns the SharePoint lists have and Diseña+ did not (from the current
--    exports MATRIZ_SN_RUBRICA, LISTA_DE_COTEJO, ESCALA_DE_VALORACION).
--    MATRIZ_SN_RUBRICA holds every Matriz, with and without rubric.
--    The review columns (ComentarioI1DCI, _Check, _Revisado, _Hora, _DocyAse,
--    RegistroUsuario…) are NOT copied: the comments per item (dpl_comentario)
--    keep the same information (author, role, date and time, replies, resolved).
--    Course data (NOMBRE_CURSO, LOGRO_CURSO, CARRERA, ELEMENTO…) still comes from
--    the related lists instead of being repeated.
-- 2. BACKUP lists: when the IA generates a proposal it is written to the
--    instrument AND copied to its backup untouched, so at the end the initial
--    IA proposal can be compared with the teacher's final version.

-- ── 1a. IA columns on every header (+ consigna) ─────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['dpl_consigna', 'dpl_rubrica', 'dpl_matriz', 'dpl_listacotejo', 'dpl_escalavaloracion'] loop
    execute format('alter table %I add column if not exists dpl_json text', t);           -- JSON / JSON_IA
    execute format('alter table %I add column if not exists dpl_inputs text', t);         -- INPUTS_1 / IA_Inputs
    execute format('alter table %I add column if not exists dpl_resultadogpt text', t);   -- RESULTADO_GPT / RESULTADO_IA
    execute format('alter table %I add column if not exists dpl_modeloia text', t);       -- MODELO_IA
    execute format('alter table %I add column if not exists dpl_herramientaia text', t);  -- HERRAMIENTA_IA
    execute format('alter table %I add column if not exists dpl_fechaia timestamptz', t); -- IA_…_Fecha
    execute format('alter table %I add column if not exists dpl_usuarioia text', t);      -- IA_…_Usuario
    execute format('alter table %I add column if not exists dpl_paraia boolean not null default true', t); -- PARA_IA
    execute format('alter table %I add column if not exists dpl_realizado boolean not null default false', t); -- Realizado…
  end loop;
end $$;

-- ── 1b. MATRIZ_SN_RUBRICA: per question (N°PREGUNTA = dpl_orden) ────────────
alter table dpl_matrizpregunta add column if not exists dpl_nombreunidad text;             -- NOMBRE_UNIDAD_n
alter table dpl_matrizpregunta add column if not exists dpl_indicador text;                -- INDICADOR_n
alter table dpl_matrizpregunta add column if not exists dpl_puntajeestandar numeric(6, 2); -- P_estandar_n
alter table dpl_matrizpregunta add column if not exists dpl_criterio text;                 -- Criterio_n

-- ── 1c. LISTA_DE_COTEJO ──────────────────────────────────────────────────────
alter table dpl_listacotejo add column if not exists dpl_idlistatext text;                 -- ID_LISTA_TEXT

-- ── 1d. ESCALA_DE_VALORACION: the SharePoint levels ──────────────────────────
alter table dpl_escalavaloracion add column if not exists dpl_idescalatext text;           -- ID_ESCALA_TEXT
alter table dpl_escalavaloracion add column if not exists dpl_tipoescala text;             -- Escala (Cualitativa…)
alter table dpl_escalaindicador add column if not exists dpl_puntajeconsolidado numeric(6, 2);  -- Consolidado_n
alter table dpl_escalaindicador add column if not exists dpl_puntajeendesarrollo numeric(6, 2); -- En desarrollo_n
alter table dpl_escalaindicador add column if not exists dpl_puntajeeninicio numeric(6, 2);     -- En inicio_n
-- No evidenciado_n = dpl_puntajenoevidenciado (already existed). The old levels
-- (excelente, bueno, regular, con errores) are kept but hidden in the Centro de datos.

-- IDs like the SharePoint lists: <curso>-<unidad>-<sesión>.
update dpl_listacotejo l set dpl_idlistatext = concat_ws('-', cu.dpl_idcursotext, u.dpl_idunidadtext, s.dpl_idsesiontext)
from dpl_sesion s join dpl_unidad u on u.dpl_unidadid = s.dpl_unidadid join dpl_curso cu on cu.dpl_cursoid = u.dpl_cursoid
where l.dpl_sesionid = s.dpl_sesionid and l.dpl_idlistatext is null;
update dpl_escalavaloracion e set dpl_idescalatext = concat_ws('-', cu.dpl_idcursotext, u.dpl_idunidadtext, s.dpl_idsesiontext)
from dpl_sesion s join dpl_unidad u on u.dpl_unidadid = s.dpl_unidadid join dpl_curso cu on cu.dpl_cursoid = u.dpl_cursoid
where e.dpl_sesionid = s.dpl_sesionid and e.dpl_idescalatext is null;

-- ── 2. BACKUP lists ──────────────────────────────────────────────────────────
-- Each backup has ALL the columns of its list, plus the IA columns of the
-- instrument, the course/element context and the copy data:
--   dpl_backupid (key) · dpl_version (1, 2, 3… per generation of the same element)
--   dpl_fechabackup · dpl_origen ('ia') · dpl_sesionbackupid (element)
--   dpl_idcursotext · dpl_nombrecurso · dpl_elemento
-- The id column of the original list (dpl_consignaid, dpl_rubricacriterioid…)
-- keeps the id of the original row, so both can be matched.
-- Re-running this script also copies any column added later to the originals.
do $$
declare
  par text[];
  pares text[][] := array[
    array['dpl_consigna',             'dpl_consigna_backup'],
    array['dpl_rubricacriterio',      'dpl_rubricacriterio_backup'],
    array['dpl_matrizpregunta',       'dpl_matrizpregunta_backup'],
    array['dpl_listacotejoindicador', 'dpl_listacotejoindicador_backup'],
    array['dpl_escalaindicador',      'dpl_escalaindicador_backup']
  ];
  col text[];
  extras text[][] := array[
    array['dpl_json', 'text'],
    array['dpl_inputs', 'text'],
    array['dpl_resultadogpt', 'text'],
    array['dpl_modeloia', 'text'],
    array['dpl_herramientaia', 'text'],
    array['dpl_fechaia', 'timestamptz'],
    array['dpl_usuarioia', 'text'],
    array['dpl_idcursotext', 'text'],
    array['dpl_nombrecurso', 'text'],
    array['dpl_elemento', 'text'],
    array['dpl_sesionbackupid', 'uuid'],
    array['dpl_version', 'integer not null default 1'],
    array['dpl_fechabackup', 'timestamptz not null default now()'],
    array['dpl_origen', 'text not null default ''ia''']
  ];
  faltante record;
begin
  foreach par slice 1 in array pares loop
    execute format('create table if not exists %I (like %I including defaults)', par[2], par[1]);
    -- Columns added to the original after the backup was created.
    for faltante in
      select o.column_name, format_type(a.atttypid, a.atttypmod) as tipo
      from information_schema.columns o
      join pg_attribute a on a.attrelid = par[1]::regclass and a.attname = o.column_name
      where o.table_schema = 'public' and o.table_name = par[1]
        and not exists (select 1 from information_schema.columns b where b.table_schema = 'public' and b.table_name = par[2] and b.column_name = o.column_name)
    loop
      execute format('alter table %I add column %I %s', par[2], faltante.column_name, faltante.tipo);
    end loop;
    execute format('alter table %I add column if not exists dpl_backupid uuid not null default gen_random_uuid()', par[2]);
    foreach col slice 1 in array extras loop
      execute format('alter table %I add column if not exists %I %s', par[2], col[1], col[2]);
    end loop;
    if not exists (select 1 from pg_constraint where conrelid = par[2]::regclass and contype = 'p') then
      execute format('alter table %I add primary key (dpl_backupid)', par[2]);
    end if;
    execute format('create index if not exists %I on %I (dpl_sesionbackupid, dpl_version)', par[2] || '_sesion_idx', par[2]);
    execute format('alter table %I enable row level security', par[2]);
    execute format('drop policy if exists %I on %I', 'allow_all_' || par[2], par[2]);
    execute format('create policy %I on %I for all using (true) with check (true)', 'allow_all_' || par[2], par[2]);
  end loop;
end $$;
