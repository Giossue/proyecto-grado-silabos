BEGIN;

CREATE TEMP TABLE formacion_marca_plantilla ON COMMIT DROP AS
SELECT plantilla_id, plantilla_modificada_en FROM plantilla_silabo;

ALTER TABLE "valores_campo" ADD COLUMN "huella_definicion_campo" char(64);

CREATE FUNCTION public.formacion_json_js(valor jsonb) RETURNS text LANGUAGE plpgsql IMMUTABLE AS $fn$
DECLARE
  tipo text := jsonb_typeof(valor);
  claves text[];
  numero numeric;
BEGIN
  IF tipo = 'object' THEN
    SELECT array_agg(key ORDER BY (key ~ '^(0|[1-9][0-9]{0,8})$') DESC, CASE WHEN key ~ '^(0|[1-9][0-9]{0,8})$' THEN key::bigint END, orden)
      INTO claves FROM jsonb_each(valor) WITH ORDINALITY AS e(key, value, orden);
    IF claves IS NULL THEN RETURN '[]'; END IF;
    IF (SELECT bool_and(claves[i] = (i - 1)::text) FROM generate_subscripts(claves, 1) AS i) THEN
      RETURN '[' || (SELECT string_agg(public.formacion_json_js(valor -> claves[i]), ',' ORDER BY i) FROM generate_subscripts(claves, 1) AS i) || ']';
    END IF;
    RETURN '{' || (SELECT string_agg(to_jsonb(claves[i])::text || ':' || public.formacion_json_js(valor -> claves[i]), ',' ORDER BY i) FROM generate_subscripts(claves, 1) AS i) || '}';
  ELSIF tipo = 'array' THEN
    RETURN '[' || coalesce((SELECT string_agg(public.formacion_json_js(e), ',' ORDER BY o) FROM jsonb_array_elements(valor) WITH ORDINALITY AS x(e, o)), '') || ']';
  ELSIF tipo = 'number' THEN
    numero := valor::text::numeric;
    IF numero = trunc(numero) AND abs(numero) < 1e15 THEN RETURN trunc(numero)::text; END IF;
    RETURN numero::float8::text;
  END IF;
  RETURN valor::text;
END
$fn$;

CREATE FUNCTION public.formacion_huella(valor jsonb) RETURNS char(64) LANGUAGE sql IMMUTABLE AS $fn$
  SELECT encode(sha256(convert_to((
    SELECT string_agg(
      CASE
        WHEN c = '/' THEN '\/'
        WHEN ascii(c) BETWEEN 128 AND 65535 THEN '\u' || lpad(to_hex(ascii(c)), 4, '0')
        WHEN ascii(c) > 65535 THEN '\u' || to_hex(55296 + ((ascii(c) - 65536) >> 10)) || '\u' || to_hex(56320 + ((ascii(c) - 65536) & 1023))
        ELSE c
      END, '' ORDER BY n)
    FROM regexp_split_to_table(public.formacion_json_js(valor), '') WITH ORDINALITY AS t(c, n)
  ), 'UTF8')), 'hex')
$fn$;

CREATE FUNCTION public.formacion_documento(texto text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_build_object('type', 'doc', 'content', coalesce((
    SELECT jsonb_agg(
      CASE WHEN linea = '' THEN '{"type": "paragraph", "attrs": {"textAlign": "left"}}'::jsonb
      ELSE jsonb_build_object('type', 'paragraph', 'attrs', '{"textAlign": "left"}'::jsonb, 'content', jsonb_build_array(jsonb_build_object('type', 'text', 'text', linea)))
      END ORDER BY n)
    FROM regexp_split_to_table(replace(texto, E'\r', ''), E'\n') WITH ORDINALITY AS l(linea, n)
  ), '[{"type": "paragraph", "attrs": {"textAlign": "left"}}]'::jsonb))
$fn$;

DO $migracion$
DECLARE
  plantilla uuid;
  vacia boolean;
  seccion uuid;
  posicion integer;
  campo uuid := uuidv7();
  definicion uuid := uuidv7();
BEGIN
  SELECT p.plantilla_id, p.definicion_plantilla::jsonb = '{}'::jsonb INTO plantilla, vacia
  FROM plantilla_silabo p
  WHERE p.definicion_plantilla::jsonb = '{}'::jsonb
    OR (jsonb_typeof(p.definicion_plantilla::jsonb -> 'variables') = 'object'
      AND EXISTS (SELECT 1 FROM jsonb_each(p.definicion_plantilla::jsonb -> 'variables') AS v WHERE v.value ->> 'source' = 'identification.formation'))
  LIMIT 1;
  IF plantilla IS NULL THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM campos_plantilla c WHERE c.plantilla_id = plantilla AND c.vigente_en_plantilla AND c.clave_campo_plantilla = 'formacion_docente') THEN RETURN; END IF;

  SELECT s.seccion_plantilla_id INTO seccion FROM secciones_plantilla s
  WHERE s.plantilla_id = plantilla AND s.vigente_en_plantilla AND s.clave_seccion_plantilla = 'identificacion' LIMIT 1;
  IF seccion IS NULL THEN RETURN; END IF;

  SELECT coalesce(
    (SELECT c.posicion_campo_plantilla FROM campos_plantilla c WHERE c.seccion_plantilla_id = seccion AND c.vigente_en_plantilla AND c.clave_campo_plantilla = 'asignatura' LIMIT 1),
    (SELECT max(c.posicion_campo_plantilla) FROM campos_plantilla c WHERE c.seccion_plantilla_id = seccion AND c.vigente_en_plantilla),
    0) INTO posicion;

  UPDATE campos_plantilla SET posicion_campo_plantilla = posicion_campo_plantilla + 1
  WHERE seccion_plantilla_id = seccion AND posicion_campo_plantilla > posicion;

  INSERT INTO campos_plantilla (campo_plantilla_id, seccion_plantilla_id, plantilla_id, clave_campo_plantilla, titulo_campo_plantilla, posicion_campo_plantilla, vigente_en_plantilla)
  VALUES (campo, seccion, plantilla, 'formacion_docente', 'Formación y experiencia académica-investigativa', posicion + 1, true);

  INSERT INTO definiciones_campo (definicion_campo_id, campo_plantilla_id, plantilla_id, vigente_en_plantilla, quien_llena_definicion_campo, contenido_definicion_campo)
  VALUES (definicion, campo, plantilla, true, 'carrera', '{"type": "doc", "content": [{"type": "paragraph", "attrs": {"textAlign": "left"}}]}'::jsonb);

  IF NOT vacia THEN
    UPDATE plantilla_silabo p SET definicion_plantilla = (
      SELECT json_object_agg(e.key, e.value ORDER BY e.orden)
      FROM (
        SELECT j.key, j.value, j.orden FROM json_each(p.definicion_plantilla) WITH ORDINALITY AS j(key, value, orden) WHERE j.key <> 'teacher_fields'
        UNION ALL SELECT 'teacher_fields', '["formacion_docente"]'::json, 2147483647
      ) AS e)
    WHERE p.plantilla_id = plantilla;
  END IF;

  INSERT INTO valores_campo (valor_campo_id, silabo_id, definicion_campo_id, valor_campo)
  SELECT uuidv7(), s.silabo_id, definicion, public.formacion_documento(
    CASE
      WHEN s.estado_silabo IN ('en_revision', 'aprobado') AND ultima.contenido IS NOT NULL THEN ultima.contenido -> 'identification' ->> 'formation'
      ELSE (
        SELECT string_agg(docente.formacion, E'\n\n' ORDER BY docente.usuario_id)
        FROM (
          SELECT DISTINCT ON (btrim(u.formacion_experiencia_usuario)) u.usuario_id, btrim(u.formacion_experiencia_usuario) AS formacion
          FROM docentes_vigentes_silabo d INNER JOIN usuarios u ON u.usuario_id = d.usuario_id
          WHERE d.silabo_id = s.silabo_id AND coalesce(btrim(u.formacion_experiencia_usuario), '') <> ''
          ORDER BY btrim(u.formacion_experiencia_usuario), u.usuario_id
        ) AS docente)
    END)
  FROM silabos s
  LEFT JOIN LATERAL (
    SELECT r.contenido_enviado AS contenido FROM revisiones_silabo r WHERE r.silabo_id = s.silabo_id ORDER BY r.numero_revision DESC LIMIT 1
  ) AS ultima ON true
  WHERE EXISTS (SELECT 1 FROM convocatorias_carreras cc WHERE cc.convocatoria_carrera_id = s.convocatoria_carrera_id
      AND EXISTS (SELECT 1 FROM convocatorias_universidad cu WHERE cu.convocatoria_universidad_id = cc.convocatoria_universidad_id))
    AND NOT EXISTS (SELECT 1 FROM valores_campo v WHERE v.silabo_id = s.silabo_id AND v.definicion_campo_id = definicion);
END
$migracion$;

UPDATE valores_campo v SET huella_definicion_campo = public.formacion_huella(d.contenido_definicion_campo)
FROM definiciones_campo d
WHERE d.definicion_campo_id = v.definicion_campo_id AND v.silabo_id IS NOT NULL;

UPDATE plantilla_silabo p SET plantilla_modificada_en = m.plantilla_modificada_en
FROM formacion_marca_plantilla m
WHERE m.plantilla_id = p.plantilla_id;

ALTER TABLE "usuarios" DROP COLUMN "formacion_experiencia_usuario";

DROP FUNCTION public.formacion_documento(text);
DROP FUNCTION public.formacion_huella(jsonb);
DROP FUNCTION public.formacion_json_js(jsonb);

COMMIT;
