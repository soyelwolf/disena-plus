-- Diseña+ — comments per item, with threads and "resolved" (run once in the Supabase SQL Editor; safe to re-run)
--
-- One table for every instrument instead of one SharePoint column per field:
-- a comment points to (instrument, record, field). Monitor EA / DDA open a
-- comment (optionally quoting a highlighted fragment); teachers and advisers
-- reply in the thread; only the author marks it resolved.

alter table dpl_comentario add column if not exists dpl_campo text;                -- field of the record (null = whole record, older comments)
alter table dpl_comentario add column if not exists dpl_padreid uuid references dpl_comentario (dpl_comentarioid) on delete cascade; -- reply to
alter table dpl_comentario add column if not exists dpl_lado text;                 -- monitor_ea | dda | docente (who is speaking)
alter table dpl_comentario add column if not exists dpl_correoautor text;
alter table dpl_comentario add column if not exists dpl_cita text;                 -- highlighted fragment
alter table dpl_comentario add column if not exists dpl_textoitem text;            -- field text when the comment was made
alter table dpl_comentario add column if not exists dpl_resuelto boolean not null default false;
alter table dpl_comentario add column if not exists dpl_resueltopor text;
alter table dpl_comentario add column if not exists dpl_fecharesuelto timestamptz;

create index if not exists dpl_comentario_entidad_idx on dpl_comentario (dpl_entidadid, dpl_campo);
create index if not exists dpl_comentario_padre_idx on dpl_comentario (dpl_padreid);

-- Older comments: infer who wrote them from the role label.
update dpl_comentario
set dpl_lado = case when dpl_rol ilike '%dda%' then 'dda' else 'monitor_ea' end
where dpl_lado is null;
