-- Diseña+ — CATALOGO_ELEMENTOS (lookup of UNIDADES_CURSOS_IA → Elemento_Catalogo)
-- Like the SharePoint lookup column: each unit picks an element of the catalogue
-- and gets its ABREVIATURA and DESCRIPCIÓN (the IA uses them to choose the prompt).
-- Run once in the Supabase SQL Editor (safe to re-run). It loads the official
-- catalogue (CATALOGO_ELEMENTOS_EVALUACION.csv, 21 elements) and links every unit.

create table if not exists dpl_catalogoelemento (
  dpl_catalogoelementoid uuid primary key default gen_random_uuid(),
  dpl_tipo text,                       -- TIPO
  dpl_elemento text not null,          -- ELEMENTO
  dpl_abreviatura text,                -- ABREVIATURA
  dpl_descripcion text,                -- DESCRIPCIÓN
  createdon timestamptz not null default now(),
  modifiedon timestamptz not null default now()
);
alter table dpl_catalogoelemento add column if not exists dpl_tipo text;
create unique index if not exists dpl_catalogoelemento_elemento_idx on dpl_catalogoelemento (lower(dpl_elemento));

alter table dpl_unidad
  add column if not exists dpl_catalogoelementoid uuid references dpl_catalogoelemento (dpl_catalogoelementoid) on delete set null;

-- Official catalogue. Re-running updates tipo/abreviatura/descripción of existing elements.
insert into dpl_catalogoelemento (dpl_tipo, dpl_elemento, dpl_abreviatura, dpl_descripcion)
values
  ('Examen', 'Examen de entrada', 'EET', 'Evaluación de preguntas a partir de casos, problemas o ejercicios. Determina los aprendizajes al inicio del tema o unidades. Preguntas abiertas o cerradas. No tiene peso en la fórmula de evaluación.'),
  ('Examen final', 'Examen final', 'EXFN', 'Evaluación de preguntas a partir de casos, problemas o ejercicios. El estudiante demuestra, individual o grupalmente, el logro general del curso. Preguntas abiertas o cerradas.'),
  ('Examen oral', 'Exposición', 'EXPO', 'Presentación de un tema o sustentación de proyectos, trabajos, etc., de manera oral.'),
  ('Examen parcial', 'Examen parcial', 'EXPA', 'Evaluación de preguntas a partir de casos, problemas o ejercicios. El estudiante demuestra los logros de las unidades desarrolladas hasta alrededor de la mitad del ciclo. Preguntas abiertas o cerradas.'),
  ('Participación en clase', 'Participación', 'PA', 'Diversas actividades (intervenciones, organizadores visuales, resúmenes, etc.) que evidencian el rol activo del estudiante. Solo se puede usar una vez en la fórmula.'),
  ('Práctica', 'Práctica calificada', 'PC', 'Evaluación de preguntas a partir de casos, problemas o ejercicios. Desarrollada de manera individual o grupal. Preguntas de respuesta abierta.'),
  ('Laboratorio', 'Laboratorio calificado', 'LC', 'Desarrollo de procedimientos en un contexto artificial controlado. El estudiante realiza análisis y valoración. Evidenciado mediante informe o ejercicios resueltos en guía de laboratorio.'),
  ('Portafolio', 'Portafolio final', 'PTF', 'Entrega de un conjunto de evidencias (documentos, resúmenes, fotografías, videos, etc.) que demuestran lo trabajado en el curso a lo largo del ciclo.'),
  ('Portafolio', 'Avance de portafolio', 'AP', 'Entrega parcial de evidencias que exhiben el progreso del estudiante. Permite monitorear el aprendizaje e introducir mejoras. Debe incluirse PTF en la fórmula.'),
  ('Trabajo', 'Trabajo de investigación', 'TI', 'Texto académico que presenta ordenadamente información de una investigación para la solución de problemas o necesidades identificadas.'),
  ('Entregables de proceso', 'Avance de trabajo de investigación', 'ATI', 'Entrega parcial del trabajo de investigación. Se pueden incluir varios avances (ATI1, ATI2, ATI3…). Debe incluirse TI en la fórmula.'),
  ('Proyecto', 'Proyecto final', 'PROY', 'Entrega final de la producción de un proyecto (producto o servicio) en un tiempo determinado y en función de las consignas.'),
  ('Entregables de proceso', 'Avance de proyecto final', 'APF', 'Entrega parcial de un proyecto. Se pueden incluir varios avances (APF1, APF2, APF3…). Debe incluirse PROY en la fórmula.'),
  ('Informe', 'Informe final', 'IF', 'Documento que presenta ordenadamente información de una investigación bibliográfica o de campo sobre un tema elegido o asignado.'),
  ('Entregables de proceso', 'Avance de informe', 'AIF', 'Entrega parcial del informe final. Se pueden incluir varios avances (AIF1, AIF2, AIF3…). Debe incluirse IF en la fórmula.'),
  ('Tarea', 'Tarea académica', 'TA', 'Actividad o conjunto de actividades donde se aplican los aprendizajes del curso. Puede incluir resúmenes, organizadores visuales, ejercicios, uso de herramientas de recojo de información, entre otros.'),
  ('Práctica', 'Control de lectura', 'CL', 'Resolución de preguntas relacionadas con el dominio del contenido de uno o más textos analizados. Preguntas abiertas o cerradas.'),
  ('Práctica', 'Análisis de caso', 'C', 'Análisis de situaciones reales o simuladas: identificar el problema, comprender los datos y proponer alternativas de solución fundamentadas en las teorías del ámbito disciplinar.'),
  ('Simulación', 'Simulación', 'SIM', 'Realización de experiencias o procedimientos con características similares a las que los estudiantes enfrentarían en la realidad.'),
  ('Debate', 'Debate', 'DE', 'Espacio de discusión sobre un tema controversial donde los estudiantes defienden una postura con argumentos sólidos. Puede realizarse de forma sincrónica o asincrónica.'),
  ('Práctica', 'Análisis de caso final', 'CF', 'Análisis de situaciones reales o simuladas: identificar el problema, comprender los datos y proponer alternativas de solución fundamentadas en las teorías del ámbito disciplinar.')
on conflict ((lower(dpl_elemento))) do update
  set dpl_tipo = excluded.dpl_tipo,
      dpl_abreviatura = excluded.dpl_abreviatura,
      dpl_descripcion = excluded.dpl_descripcion,
      modifiedon = now();

-- Elements some unit uses that are not in the catalogue file (kept, never lost).
insert into dpl_catalogoelemento (dpl_elemento, dpl_abreviatura, dpl_descripcion)
select distinct on (lower(trim(dpl_elementocatalogo)))
  trim(dpl_elementocatalogo), dpl_elementocatalogoabreviatura, dpl_elementocatalogodescripcion
from dpl_unidad
where coalesce(trim(dpl_elementocatalogo), '') <> ''
order by lower(trim(dpl_elementocatalogo)), dpl_elementocatalogodescripcion nulls last
on conflict do nothing;

-- Link every unit to its catalogue element and refresh the copied text.
update dpl_unidad u
set dpl_catalogoelementoid = c.dpl_catalogoelementoid,
    dpl_elementocatalogo = c.dpl_elemento,
    dpl_elementocatalogoabreviatura = c.dpl_abreviatura,
    dpl_elementocatalogodescripcion = c.dpl_descripcion
from dpl_catalogoelemento c
where lower(trim(u.dpl_elementocatalogo)) = lower(c.dpl_elemento);

alter table dpl_catalogoelemento enable row level security;
drop policy if exists "allow_all_dpl_catalogoelemento" on dpl_catalogoelemento;
create policy "allow_all_dpl_catalogoelemento" on dpl_catalogoelemento for all using (true) with check (true);
