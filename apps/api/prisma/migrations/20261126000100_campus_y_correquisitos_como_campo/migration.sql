-- Campus and corequisites become teacher-filled fields of the syllabus (same mechanism as formacion_docente).
-- 1. Stored template variables move from the removed sources identification.campus / identification.corequisites
--    to identification.teacher_campus / identification.teacher_corequisites (key order of the JSON is kept).
-- 2. The «Identificación» section gets the fields nombre_campus and correquisitos_asignatura right after «asignatura»,
--    and both are listed in teacher_fields.
-- 3. Every existing syllabus gets its value pre-filled with what it shows today, so it keeps what it shows and can be sent.
-- Safe to run twice: each step only acts when its target is still missing.
BEGIN;

CREATE TEMP TABLE campus_marca_plantilla ON COMMIT DROP AS
SELECT plantilla_id, plantilla_modificada_en FROM plantilla_silabo;

CREATE FUNCTION public.campus_documento(texto text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_build_object('type', 'doc', 'content', coalesce((
    SELECT jsonb_agg(
      CASE WHEN linea = '' THEN '{"type": "paragraph", "attrs": {"textAlign": "left"}}'::jsonb
      ELSE jsonb_build_object('type', 'paragraph', 'attrs', '{"textAlign": "left"}'::jsonb, 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', linea)))
      END ORDER BY n)
    FROM regexp_split_to_table(replace(btrim(texto), E'\r', ''), E'\n') WITH ORDINALITY AS l(linea, n)
    WHERE btrim(texto) <> ''
  ), '[{"type": "paragraph", "attrs": {"textAlign": "left"}}]'::jsonb))
$fn$;

-- Same text the identification card showed: codes joined with ", ", «Ninguno» when the stored list is empty.
CREATE FUNCTION public.campus_correquisitos(valor jsonb) RETURNS text LANGUAGE sql IMMUTABLE AS $fn$
  SELECT CASE
    WHEN valor IS NULL OR jsonb_typeof(valor) = 'null' THEN NULL
    WHEN jsonb_typeof(valor) = 'array' THEN coalesce(nullif(nullif((
      SELECT string_agg(btrim(e), ', ' ORDER BY o) FROM jsonb_array_elements_text(valor) WITH ORDINALITY AS x(e, o)
      WHERE jsonb_typeof(valor -> (o::int - 1)) IN ('string', 'number') AND btrim(e) <> ''), ''), '0'), 'Ninguno')
    WHEN jsonb_typeof(valor) IN ('string', 'number') THEN coalesce(nullif(nullif(btrim(valor #>> '{}'), ''), '0'), 'Ninguno')
    ELSE 'Ninguno'
  END
$fn$;

DO $migracion$
DECLARE
  plantilla record;
  vacia boolean;
  seccion uuid;
  posicion integer;
  campo uuid;
  definicion uuid;
  nuevo record;
  usa_fuente boolean;
  huella constant char(64) := 'fa767202bd3479a39b069ffbf86a9331fb51fb66db2e110ebfabfdd5a5cddf16';
BEGIN
  FOR plantilla IN SELECT p.plantilla_id FROM plantilla_silabo p LOOP
    -- 1. Rename the removed sources inside the stored variables.
    UPDATE plantilla_silabo p SET definicion_plantilla = (
      SELECT json_object_agg(d.key, CASE WHEN d.key = 'variables' AND json_typeof(d.value) = 'object' THEN (
          SELECT json_object_agg(v.key, CASE WHEN v.value ->> 'source' IN ('identification.campus', 'identification.corequisites') THEN (
              SELECT json_object_agg(a.key, CASE WHEN a.key = 'source'
                  THEN to_json(CASE a.value #>> '{}' WHEN 'identification.campus' THEN 'identification.teacher_campus' ELSE 'identification.teacher_corequisites' END)
                  ELSE a.value END ORDER BY a.orden)
              FROM json_each(v.value) WITH ORDINALITY AS a(key, value, orden))
            ELSE v.value END ORDER BY v.orden)
          FROM json_each(d.value) WITH ORDINALITY AS v(key, value, orden))
        ELSE d.value END ORDER BY d.orden)
      FROM json_each(p.definicion_plantilla) WITH ORDINALITY AS d(key, value, orden))
    WHERE p.plantilla_id = plantilla.plantilla_id
      AND json_typeof(p.definicion_plantilla -> 'variables') = 'object'
      AND EXISTS (SELECT 1 FROM json_each(p.definicion_plantilla -> 'variables') AS v
        WHERE v.value ->> 'source' IN ('identification.campus', 'identification.corequisites'));

    SELECT p.definicion_plantilla::jsonb = '{}'::jsonb INTO vacia FROM plantilla_silabo p WHERE p.plantilla_id = plantilla.plantilla_id;

    SELECT s.seccion_plantilla_id INTO seccion FROM secciones_plantilla s
    WHERE s.plantilla_id = plantilla.plantilla_id AND s.vigente_en_plantilla AND s.clave_seccion_plantilla = 'identificacion' LIMIT 1;
    CONTINUE WHEN seccion IS NULL;

    -- 2. Add each field when the template shows it (or uses the official definition) and does not have it yet.
    FOR nuevo IN
      SELECT * FROM (VALUES
        (1, 'nombre_campus', 'Campus universitario', 'identification.teacher_campus'),
        (2, 'correquisitos_asignatura', 'Correquisitos', 'identification.teacher_corequisites')
      ) AS n(orden, clave, titulo, fuente) ORDER BY n.orden
    LOOP
      SELECT vacia OR EXISTS (
        SELECT 1 FROM plantilla_silabo p, json_each(CASE WHEN json_typeof(p.definicion_plantilla -> 'variables') = 'object' THEN p.definicion_plantilla -> 'variables' ELSE '{}'::json END) AS v
        WHERE p.plantilla_id = plantilla.plantilla_id AND v.value ->> 'source' = nuevo.fuente) INTO usa_fuente;
      CONTINUE WHEN NOT usa_fuente;
      CONTINUE WHEN EXISTS (SELECT 1 FROM campos_plantilla c WHERE c.plantilla_id = plantilla.plantilla_id AND c.vigente_en_plantilla AND c.clave_campo_plantilla = nuevo.clave);

      -- Right after «asignatura» (or after the campus field just added), before formacion_docente.
      SELECT coalesce(
        (SELECT c.posicion_campo_plantilla FROM campos_plantilla c WHERE c.seccion_plantilla_id = seccion AND c.vigente_en_plantilla AND c.clave_campo_plantilla = 'nombre_campus' AND nuevo.clave = 'correquisitos_asignatura' LIMIT 1),
        (SELECT c.posicion_campo_plantilla FROM campos_plantilla c WHERE c.seccion_plantilla_id = seccion AND c.vigente_en_plantilla AND c.clave_campo_plantilla = 'asignatura' LIMIT 1),
        (SELECT max(c.posicion_campo_plantilla) FROM campos_plantilla c WHERE c.seccion_plantilla_id = seccion AND c.vigente_en_plantilla),
        0) INTO posicion;

      UPDATE campos_plantilla SET posicion_campo_plantilla = posicion_campo_plantilla + 1
      WHERE seccion_plantilla_id = seccion AND posicion_campo_plantilla > posicion;

      campo := uuidv7();
      definicion := uuidv7();
      INSERT INTO campos_plantilla (campo_plantilla_id, seccion_plantilla_id, plantilla_id, clave_campo_plantilla, titulo_campo_plantilla, posicion_campo_plantilla, vigente_en_plantilla)
      VALUES (campo, seccion, plantilla.plantilla_id, nuevo.clave, nuevo.titulo, posicion + 1, true);

      INSERT INTO definiciones_campo (definicion_campo_id, campo_plantilla_id, plantilla_id, vigente_en_plantilla, quien_llena_definicion_campo, contenido_definicion_campo)
      VALUES (definicion, campo, plantilla.plantilla_id, true, 'carrera', '{"type": "doc", "content": [{"type": "paragraph", "attrs": {"textAlign": "left"}}]}'::jsonb);

      -- 3. Pre-fill every existing syllabus with what its card shows today:
      --    the last sent snapshot for syllabi under review or approved, otherwise its stored academic context.
      INSERT INTO valores_campo (valor_campo_id, silabo_id, definicion_campo_id, valor_campo, huella_definicion_campo)
      SELECT uuidv7(), s.silabo_id, definicion, public.campus_documento(
        CASE
          WHEN s.estado_silabo IN ('en_revision', 'aprobado') AND ultima.contenido IS NOT NULL
            THEN ultima.contenido -> 'identification' ->> CASE nuevo.clave WHEN 'nombre_campus' THEN 'campus' ELSE 'corequisites' END
          WHEN nuevo.clave = 'nombre_campus'
            THEN coalesce(s.datos_academicos_silabo #>> '{scheduled_subject,campus}', s.datos_academicos_silabo #>> '{offering,campus}')
          ELSE public.campus_correquisitos(s.datos_academicos_silabo #> '{subject,corequisites}')
        END), huella
      FROM silabos s
      LEFT JOIN LATERAL (
        SELECT r.contenido_enviado AS contenido FROM revisiones_silabo r WHERE r.silabo_id = s.silabo_id ORDER BY r.numero_revision DESC LIMIT 1
      ) AS ultima ON true
      WHERE EXISTS (SELECT 1 FROM convocatorias_carreras cc WHERE cc.convocatoria_carrera_id = s.convocatoria_carrera_id
          AND EXISTS (SELECT 1 FROM convocatorias_universidad cu WHERE cu.convocatoria_universidad_id = cc.convocatoria_universidad_id))
        AND NOT EXISTS (SELECT 1 FROM valores_campo v WHERE v.silabo_id = s.silabo_id AND v.definicion_campo_id = definicion);
    END LOOP;

    -- teacher_fields: the two new keys first (only those the template has), then the existing entries without repeats.
    IF NOT vacia THEN
      UPDATE plantilla_silabo p SET definicion_plantilla = (
        SELECT json_object_agg(e.key, e.value ORDER BY e.orden)
        FROM (
          SELECT j.key, j.value, j.orden FROM json_each(p.definicion_plantilla) WITH ORDINALITY AS j(key, value, orden) WHERE j.key <> 'teacher_fields'
          UNION ALL
          SELECT 'teacher_fields', coalesce((
            SELECT json_agg(t.clave ORDER BY t.orden) FROM (
              SELECT DISTINCT ON (k.clave) k.clave, k.orden FROM (
                SELECT c.clave_campo_plantilla AS clave, n.orden FROM campos_plantilla c
                  INNER JOIN (VALUES ('nombre_campus', 1), ('correquisitos_asignatura', 2)) AS n(clave, orden) ON n.clave = c.clave_campo_plantilla
                WHERE c.plantilla_id = p.plantilla_id AND c.vigente_en_plantilla
                UNION ALL
                SELECT x.value #>> '{}', 2 + x.orden FROM json_array_elements(CASE WHEN json_typeof(p.definicion_plantilla -> 'teacher_fields') = 'array' THEN p.definicion_plantilla -> 'teacher_fields' ELSE '[]'::json END) WITH ORDINALITY AS x(value, orden)
              ) AS k ORDER BY k.clave, k.orden
            ) AS t), '[]'::json),
            coalesce((SELECT j.orden FROM json_each(p.definicion_plantilla) WITH ORDINALITY AS j(key, value, orden) WHERE j.key = 'teacher_fields'), 2147483647)
        ) AS e)
      WHERE p.plantilla_id = plantilla.plantilla_id
        AND EXISTS (SELECT 1 FROM campos_plantilla c WHERE c.plantilla_id = p.plantilla_id AND c.vigente_en_plantilla
          AND c.clave_campo_plantilla IN ('nombre_campus', 'correquisitos_asignatura'));
    END IF;
  END LOOP;
END
$migracion$;

UPDATE plantilla_silabo p SET plantilla_modificada_en = m.plantilla_modificada_en
FROM campus_marca_plantilla m
WHERE m.plantilla_id = p.plantilla_id;

DROP FUNCTION public.campus_correquisitos(jsonb);
DROP FUNCTION public.campus_documento(text);

COMMIT;
