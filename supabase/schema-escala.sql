-- Diseña+ — Escala de valoración: scores stored by level position, as the SharePoint export
-- (run once in the Supabase SQL Editor; safe to re-run)
--
--   level 1 → dpl_puntajeconsolidado   (Consolidado / Siempre / Excelente)       Consolidado_n
--   level 2 → dpl_puntajeendesarrollo  (En desarrollo / Casi siempre / Bueno)    En desarrollo_n
--   level 3 → dpl_puntajeeninicio      (En inicio / Algunas veces / Regular)     En inicio_n
--   level 4 → dpl_puntajeconerrores    (Con varios errores: administración only) Errores_n
--   zero    → dpl_puntajenoevidenciado (No evidenciado / Nunca / No presenta = 0) No evidenciado_n
-- dpl_escalavaloracion.dpl_tipoescala = Cualitativa | Cuantitativa | Mixta (Escala; empty for administración).
--
-- The first import wrote levels 1-3 into the old columns (excelente, bueno, regular):
-- copy them to their place. The old columns are kept, hidden in the Centro de datos.

alter table dpl_escalaindicador add column if not exists dpl_puntajeconsolidado numeric(6, 2);
alter table dpl_escalaindicador add column if not exists dpl_puntajeendesarrollo numeric(6, 2);
alter table dpl_escalaindicador add column if not exists dpl_puntajeeninicio numeric(6, 2);
alter table dpl_escalavaloracion add column if not exists dpl_tipoescala text;
alter table dpl_escalavaloracion add column if not exists dpl_idescalatext text;

update dpl_escalaindicador
set dpl_puntajeconsolidado  = coalesce(dpl_puntajeconsolidado, dpl_puntajeexcelente),
    dpl_puntajeendesarrollo = coalesce(dpl_puntajeendesarrollo, dpl_puntajebueno),
    dpl_puntajeeninicio     = coalesce(dpl_puntajeeninicio, dpl_puntajeregular),
    dpl_puntajenoevidenciado = coalesce(dpl_puntajenoevidenciado, 0)
where dpl_puntajeconsolidado is null or dpl_puntajeendesarrollo is null or dpl_puntajeeninicio is null or dpl_puntajenoevidenciado is null;
