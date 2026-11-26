BEGIN;

CREATE TEMP TABLE estilos_marca_plantilla ON COMMIT DROP AS
SELECT plantilla_id, plantilla_modificada_en FROM plantilla_silabo;

CREATE TEMP TABLE estilos_fondo_plantilla ON COMMIT DROP AS
SELECT plantilla_id, upper("definicion_plantilla"::jsonb #>> '{document,colors,table_header_background}') AS fondo
    FROM plantilla_silabo
    WHERE "definicion_plantilla"::jsonb #>> '{document,colors,table_header_background}' IS NOT NULL
      AND upper(coalesce("definicion_plantilla"::jsonb #>> '{document,colors,table_header_text}', '')) = upper(coalesce("definicion_plantilla"::jsonb #>> '{document,colors,text}', ''));

CREATE FUNCTION pg_temp.encabezados_sin_estilo_repetido(nodo jsonb, fondo text) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
    resultado jsonb;
BEGIN
    IF jsonb_typeof(nodo) = 'array' THEN
        SELECT coalesce(jsonb_agg(pg_temp.encabezados_sin_estilo_repetido(elemento, fondo) ORDER BY posicion), '[]'::jsonb)
            INTO resultado FROM jsonb_array_elements(nodo) WITH ORDINALITY AS t(elemento, posicion);
        RETURN resultado;
    END IF;
    IF jsonb_typeof(nodo) <> 'object' THEN
        RETURN nodo;
    END IF;
    SELECT coalesce(jsonb_object_agg(clave, pg_temp.encabezados_sin_estilo_repetido(valor, fondo)), '{}'::jsonb)
        INTO resultado FROM jsonb_each(nodo) AS t(clave, valor);
    IF resultado ->> 'type' = 'tableHeader'
        AND jsonb_typeof(resultado -> 'attrs') = 'object'
        AND upper(resultado #>> '{attrs,backgroundColor}') = fondo
        AND resultado #> '{attrs,bold}' = 'true'::jsonb
        AND coalesce(resultado #> '{attrs,textColor}', 'null'::jsonb) = 'null'::jsonb
        AND coalesce(resultado #> '{attrs,textAlign}', 'null'::jsonb) = 'null'::jsonb
        AND coalesce(resultado #> '{attrs,italic}', 'null'::jsonb) = 'null'::jsonb
        AND coalesce(resultado -> 'content', '[]'::jsonb)::text NOT LIKE '%"color"%' THEN
        resultado := jsonb_set(jsonb_set(resultado, '{attrs,backgroundColor}', 'null'::jsonb), '{attrs,bold}', 'null'::jsonb);
    END IF;
    RETURN resultado;
END;
$$;

UPDATE "plantilla_silabo" p
    SET "definicion_plantilla" = pg_temp.encabezados_sin_estilo_repetido(p."definicion_plantilla"::jsonb, f.fondo)::json
    FROM estilos_fondo_plantilla f
    WHERE f.plantilla_id = p.plantilla_id
      AND pg_temp.encabezados_sin_estilo_repetido(p."definicion_plantilla"::jsonb, f.fondo) IS DISTINCT FROM p."definicion_plantilla"::jsonb;

UPDATE "definiciones_campo" d
    SET "contenido_definicion_campo" = pg_temp.encabezados_sin_estilo_repetido(d."contenido_definicion_campo", f.fondo)
    FROM estilos_fondo_plantilla f
    WHERE f.plantilla_id = d.plantilla_id
      AND pg_temp.encabezados_sin_estilo_repetido(d."contenido_definicion_campo", f.fondo) IS DISTINCT FROM d."contenido_definicion_campo";

UPDATE "valores_campo" v
    SET "valor_campo" = pg_temp.encabezados_sin_estilo_repetido(v."valor_campo", f.fondo)
    FROM "definiciones_campo" d, estilos_fondo_plantilla f
    WHERE d.definicion_campo_id = v.definicion_campo_id
      AND f.plantilla_id = d.plantilla_id
      AND v."valor_campo" IS NOT NULL
      AND pg_temp.encabezados_sin_estilo_repetido(v."valor_campo", f.fondo) IS DISTINCT FROM v."valor_campo";

UPDATE plantilla_silabo p SET plantilla_modificada_en = m.plantilla_modificada_en
    FROM estilos_marca_plantilla m WHERE m.plantilla_id = p.plantilla_id;

COMMIT;
