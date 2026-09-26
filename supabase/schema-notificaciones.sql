-- Diseña+ — in-app notifications (the bell in the header)
-- (run once in the Supabase SQL Editor; safe to re-run)
--
-- One row per recipient. They are written by the app when something happens in a
-- course (a part is finalized, a reviewer comments, an approval, an incident) to
-- the people of that course according to their role (dpl_cursoasignacion).
-- Later a daily e-mail digest can be built from the unread rows.

create table if not exists dpl_notificacion (
  dpl_notificacionid uuid primary key default gen_random_uuid(),
  dpl_usuarioid uuid not null references dpl_usuario (dpl_usuarioid) on delete cascade, -- recipient
  dpl_cursoid uuid references dpl_curso (dpl_cursoid) on delete cascade,
  dpl_tipo text not null,          -- finalizado | enviado | comentario | respuesta | aprobado | devuelto | habilitado | incidencia
  dpl_titulo text not null,
  dpl_detalle text,
  dpl_ruta text,                   -- screen to open, e.g. /cursos/<id>/rubricas
  dpl_actor text,                  -- who did it (name)
  dpl_leida boolean not null default false,
  createdon timestamptz not null default now()
);
create index if not exists dpl_notificacion_usuario_idx on dpl_notificacion (dpl_usuarioid, dpl_leida, createdon desc);

alter table dpl_notificacion enable row level security;
drop policy if exists "allow_all_dpl_notificacion" on dpl_notificacion;
create policy "allow_all_dpl_notificacion" on dpl_notificacion for all using (true) with check (true);
