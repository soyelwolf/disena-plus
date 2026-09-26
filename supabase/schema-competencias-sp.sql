-- Diseña+ — Competencias like the 3 SharePoint lists (run once in the Supabase SQL Editor; safe to re-run)
--
-- SharePoint has PROGRAMAS (one row per course × programme, each with its own ID_PROGRAMA),
-- COMPTENCIAS_PARA MAPEO (one row per course × programme × competence, each with its own
-- ID_Comptencia; shown as COMPETENCIAS in Diseña+). The first import split
-- each of the first two into two tables (1 to 1). Now each row keeps its course / programme
-- data, and triggers keep the link tables the app reads (dpl_cursoprograma,
-- dpl_cursoprogramacompetencia) in step, so Rúbricas and the course page work as before.

-- ── PROGRAMAS: the course of each programme row ──────────────────────────────
alter table dpl_programa add column if not exists dpl_cursoid uuid references dpl_curso (dpl_cursoid) on delete cascade;
update dpl_programa p set dpl_cursoid = cp.dpl_cursoid
from dpl_cursoprograma cp
where cp.dpl_programaid = p.dpl_programaid and p.dpl_cursoid is null;

create or replace function dpl_sync_cursoprograma() returns trigger language plpgsql as $$
begin
  if tg_op = 'UPDATE' and old.dpl_cursoid is distinct from new.dpl_cursoid and old.dpl_cursoid is not null then
    delete from dpl_cursoprograma where dpl_programaid = old.dpl_programaid and dpl_cursoid = old.dpl_cursoid;
  end if;
  if new.dpl_cursoid is not null then
    insert into dpl_cursoprograma (dpl_cursoid, dpl_programaid) values (new.dpl_cursoid, new.dpl_programaid)
    on conflict (dpl_cursoid, dpl_programaid) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists dpl_programa_sync on dpl_programa;
create trigger dpl_programa_sync after insert or update of dpl_cursoid on dpl_programa
for each row execute function dpl_sync_cursoprograma();

-- ── COMPTENCIAS_PARA MAPEO: course, programme, level and evidence on each competence row ──
alter table dpl_competencia add column if not exists dpl_cursoid uuid references dpl_curso (dpl_cursoid) on delete cascade;
alter table dpl_competencia add column if not exists dpl_programaid uuid references dpl_programa (dpl_programaid) on delete cascade;
alter table dpl_competencia add column if not exists dpl_nivel integer;
alter table dpl_competencia add column if not exists dpl_cursoevidencia boolean;
alter table dpl_competencia add column if not exists dpl_competenciaevidencia boolean;
update dpl_competencia c
set dpl_cursoid = x.dpl_cursoid, dpl_programaid = x.dpl_programaid, dpl_nivel = x.dpl_nivel,
    dpl_cursoevidencia = x.dpl_cursoevidencia, dpl_competenciaevidencia = x.dpl_competenciaevidencia
from dpl_cursoprogramacompetencia x
where x.dpl_competenciaid = c.dpl_competenciaid and c.dpl_cursoid is null;

create or replace function dpl_sync_cursoprogramacompetencia() returns trigger language plpgsql as $$
begin
  if exists (select 1 from dpl_cursoprogramacompetencia where dpl_competenciaid = new.dpl_competenciaid) then
    update dpl_cursoprogramacompetencia
    set dpl_cursoid = new.dpl_cursoid, dpl_programaid = new.dpl_programaid, dpl_nivel = new.dpl_nivel,
        dpl_cursoevidencia = new.dpl_cursoevidencia, dpl_competenciaevidencia = new.dpl_competenciaevidencia
    where dpl_competenciaid = new.dpl_competenciaid;
  elsif new.dpl_cursoid is not null and new.dpl_programaid is not null then
    insert into dpl_cursoprogramacompetencia (dpl_cursoid, dpl_programaid, dpl_competenciaid, dpl_nivel, dpl_cursoevidencia, dpl_competenciaevidencia)
    values (new.dpl_cursoid, new.dpl_programaid, new.dpl_competenciaid, new.dpl_nivel, new.dpl_cursoevidencia, new.dpl_competenciaevidencia);
  end if;
  return null;
end $$;
drop trigger if exists dpl_competencia_sync on dpl_competencia;
create trigger dpl_competencia_sync after insert or update on dpl_competencia
for each row execute function dpl_sync_cursoprogramacompetencia();

-- ── MAPEO_PROGRAMAS is not used: PROGRAMAS + COMPETENCIAS are enough for Rúbricas ──
drop table if exists dpl_mapeoprograma;
