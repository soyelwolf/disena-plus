-- Diseña+ — remaining SharePoint columns (run once in the Supabase SQL Editor; safe to re-run)
--
-- 1. IA columns: where each generated proposal will be stored, as in the
--    CONSOLIDADO_* lists (JSON = context sent, RESULTADO_GPT = answer,
--    MODELO_IA / HERRAMIENTA_IA = which model/tool produced it).
-- 2. LISTADO_CURSOS_PARA_IA columns that were not migrated (Permite_Matriz_CN is
--    obsolete: Matriz is enabled by Permite_Matriz_SN only).
-- 3. ID_CONSIGNA_TEXT always as <curso>-<unidad>-<sesión> (C16-U69-S313).

-- ── 1. IA columns ────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['dpl_consigna', 'dpl_rubrica', 'dpl_matriz', 'dpl_listacotejo', 'dpl_escalavaloracion'] loop
    execute format('alter table %I add column if not exists dpl_json text', t);            -- JSON
    execute format('alter table %I add column if not exists dpl_resultadogpt text', t);    -- RESULTADO_GPT
    execute format('alter table %I add column if not exists dpl_modeloia text', t);        -- MODELO_IA
    execute format('alter table %I add column if not exists dpl_herramientaia text', t);   -- HERRAMIENTA_IA
    execute format('alter table %I add column if not exists dpl_fechaia timestamptz', t);  -- when the IA ran
  end loop;
end $$;

-- ── 2. LISTADO_CURSOS_PARA_IA ────────────────────────────────────────────────
alter table dpl_curso add column if not exists dpl_cursoevidencia boolean not null default false;         -- Curso_Evidencia
alter table dpl_curso add column if not exists dpl_ppt boolean not null default false;                    -- PPT
alter table dpl_curso add column if not exists dpl_sinppt boolean not null default false;                 -- Sin_PPT
alter table dpl_curso add column if not exists dpl_channelid text;                                        -- ChannelID (Teams)

-- ── 3. ID_CONSIGNA_TEXT = curso-unidad-sesión ────────────────────────────────
update dpl_consigna c
set dpl_idconsignatext = concat_ws('-', cu.dpl_idcursotext, u.dpl_idunidadtext, s.dpl_idsesiontext)
from dpl_sesion s
join dpl_unidad u on u.dpl_unidadid = s.dpl_unidadid
join dpl_curso cu on cu.dpl_cursoid = u.dpl_cursoid
where c.dpl_sesionid = s.dpl_sesionid
  and coalesce(c.dpl_idconsignatext, '') is distinct from concat_ws('-', cu.dpl_idcursotext, u.dpl_idunidadtext, s.dpl_idsesiontext);
