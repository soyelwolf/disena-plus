-- Diseña+ — support requests with a chat thread (run once in the Supabase SQL Editor; safe to re-run)
--
-- Anyone signed in opens a request from the Soporte screen; the
-- administrators answer it there. Each request is a thread of messages.
-- estado: abierto (waiting for support) | respondido (support answered) | cerrado.

create table if not exists dpl_soporte (
  dpl_soporteid uuid primary key default gen_random_uuid(),
  dpl_correo text not null,               -- who asked (lower-case @utp.edu.pe)
  dpl_nombre text not null,
  dpl_tema text not null,                 -- uso | error | acceso | sugerencia | otro
  dpl_asunto text not null,
  dpl_estado text not null default 'abierto',
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
create index if not exists dpl_soporte_correo_idx on dpl_soporte (dpl_correo);

create table if not exists dpl_soportemensaje (
  dpl_soportemensajeid uuid primary key default gen_random_uuid(),
  dpl_soporteid uuid not null references dpl_soporte (dpl_soporteid) on delete cascade,
  dpl_autor text not null,
  dpl_correoautor text,
  dpl_esadmin boolean not null default false, -- written by support
  dpl_texto text not null,
  createdon timestamptz not null default now()
);
create index if not exists dpl_soportemensaje_soporte_idx on dpl_soportemensaje (dpl_soporteid, createdon);

do $$
declare t text;
begin
  foreach t in array array['dpl_soporte', 'dpl_soportemensaje'] loop
    execute format('alter table %I enable row level security', t);
    execute format(
      'drop policy if exists "allow_all_%1$s" on %1$I; create policy "allow_all_%1$s" on %1$I for all using (true) with check (true);',
      t
    );
  end loop;
end $$;
