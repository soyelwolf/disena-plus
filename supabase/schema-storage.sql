-- Diseña+ — Storage bucket for "Datos adjuntos" (Consigna file attachments)
--
-- Run this once in the Supabase SQL Editor. Creates a public bucket and a
-- permissive policy on storage.objects — same trust boundary as every other
-- table in this project right now (anon key, no real auth yet, see the note
-- in schema.sql). Tighten this once Supabase Auth is wired up.

insert into storage.buckets (id, name, public)
values ('adjuntos', 'adjuntos', true)
on conflict (id) do nothing;

drop policy if exists "allow_all_adjuntos" on storage.objects;
create policy "allow_all_adjuntos"
  on storage.objects
  for all
  using (bucket_id = 'adjuntos')
  with check (bucket_id = 'adjuntos');
