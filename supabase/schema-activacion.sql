-- Diseña+ — "datos jalados" per process, separate from the IA columns
-- (run once in the Supabase SQL Editor; safe to re-run)
--
-- Permite_*            → the administrator lets the course work that process.
-- Activado_* (new)     → the course data was pulled into the process (ACTIVAR / Preparar
--                        nuevos): one row per element was created. Nothing about IA.
-- IA_Para*_Corrido     → IA only. From now on the IA runs inside each process, element by
--                        element (dpl_fechaia / dpl_usuarioia… of each header), so the app no
--                        longer uses these course columns to mean "activated".

alter table dpl_curso add column if not exists dpl_activado_consignas boolean not null default false;
alter table dpl_curso add column if not exists dpl_activado_rubrica boolean not null default false;
alter table dpl_curso add column if not exists dpl_activado_matriz boolean not null default false;
alter table dpl_curso add column if not exists dpl_activado_lista boolean not null default false;
alter table dpl_curso add column if not exists dpl_activado_escala boolean not null default false;

-- Keep what is already activated: the old flag was set when activating, and
-- courses that already have rows of the process were activated too.
do $$
declare
  par text[];
  pares text[][] := array[
    array['dpl_activado_consignas', 'dpl_ia_consigna_corrido',         'dpl_consigna'],
    array['dpl_activado_rubrica',   'dpl_ia_rubrica_corrido',          'dpl_rubrica'],
    array['dpl_activado_matriz',    'dpl_ia_matrizsinrubrica_corrido', 'dpl_matriz'],
    array['dpl_activado_lista',     'dpl_ia_lista_corrido',            'dpl_listacotejo'],
    array['dpl_activado_escala',    'dpl_ia_escala_corrido',           'dpl_escalavaloracion']
  ];
begin
  foreach par slice 1 in array pares loop
    execute format(
      'update dpl_curso c set %1$I = true
       where not c.%1$I
         and (coalesce(c.%2$I, false)
              or exists (select 1 from %3$I x
                         join dpl_sesion s on s.dpl_sesionid = x.dpl_sesionid
                         join dpl_unidad u on u.dpl_unidadid = s.dpl_unidadid
                         where u.dpl_cursoid = c.dpl_cursoid))',
      par[1], par[2], par[3]
    );
  end loop;
end $$;
