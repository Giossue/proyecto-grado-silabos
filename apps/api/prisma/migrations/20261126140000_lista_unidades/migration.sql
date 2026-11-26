BEGIN;

CREATE TEMP TABLE unidades_marca_plantilla ON COMMIT DROP AS
SELECT plantilla_id, plantilla_modificada_en FROM plantilla_silabo;

UPDATE "plantilla_silabo"
    SET "definicion_plantilla" = regexp_replace(regexp_replace(regexp_replace("definicion_plantilla"::text, '("value"\s*:\s*\{\s*)"units"(\s*:)', '\1"unidades"\2', 'g'), '("(count|filled|sum)"\s*:\s*")units([."])', '\1unidades\3', 'g'), '("repeat"\s*:\s*\{\s*"value"\s*:\s*")units(")', '\1unidades\2', 'g')::json
    WHERE "definicion_plantilla"::text LIKE '%"units%';

UPDATE "definiciones_campo"
    SET "contenido_definicion_campo" = regexp_replace(regexp_replace(regexp_replace("contenido_definicion_campo"::text, '("value"\s*:\s*\{\s*)"units"(\s*:)', '\1"unidades"\2', 'g'), '("(count|filled|sum)"\s*:\s*")units([."])', '\1unidades\3', 'g'), '("repeat"\s*:\s*\{\s*"value"\s*:\s*")units(")', '\1unidades\2', 'g')::jsonb
    WHERE "contenido_definicion_campo"::text LIKE '%"units%';

UPDATE "valores_campo"
    SET "valor_campo" = regexp_replace(regexp_replace(regexp_replace("valor_campo"::text, '("value"\s*:\s*\{\s*)"units"(\s*:)', '\1"unidades"\2', 'g'), '("(count|filled|sum)"\s*:\s*")units([."])', '\1unidades\3', 'g'), '("repeat"\s*:\s*\{\s*"value"\s*:\s*")units(")', '\1unidades\2', 'g')::jsonb
    WHERE "valor_campo"::text LIKE '%"units%';

UPDATE "propuestas_ia_plantilla"
    SET "estructura_propuesta" = regexp_replace(regexp_replace(regexp_replace("estructura_propuesta"::text, '("value"\s*:\s*\{\s*)"units"(\s*:)', '\1"unidades"\2', 'g'), '("(count|filled|sum)"\s*:\s*")units([."])', '\1unidades\3', 'g'), '("repeat"\s*:\s*\{\s*"value"\s*:\s*")units(")', '\1unidades\2', 'g')::jsonb
    WHERE "estructura_propuesta"::text LIKE '%"units%';

UPDATE "propuestas_ia_plantilla"
    SET "cambios_propuesta" = regexp_replace(regexp_replace(regexp_replace("cambios_propuesta"::text, '("value"\s*:\s*\{\s*)"units"(\s*:)', '\1"unidades"\2', 'g'), '("(count|filled|sum)"\s*:\s*")units([."])', '\1unidades\3', 'g'), '("repeat"\s*:\s*\{\s*"value"\s*:\s*")units(")', '\1unidades\2', 'g')::jsonb
    WHERE "cambios_propuesta"::text LIKE '%"units%';

UPDATE "silabos"
    SET "datos_academicos_silabo" = regexp_replace(regexp_replace(regexp_replace("datos_academicos_silabo"::text, '("value"\s*:\s*\{\s*)"units"(\s*:)', '\1"unidades"\2', 'g'), '("(count|filled|sum)"\s*:\s*")units([."])', '\1unidades\3', 'g'), '("repeat"\s*:\s*\{\s*"value"\s*:\s*")units(")', '\1unidades\2', 'g')::jsonb
    WHERE "datos_academicos_silabo"::text LIKE '%"units%';

UPDATE plantilla_silabo p SET plantilla_modificada_en = m.plantilla_modificada_en
    FROM unidades_marca_plantilla m WHERE m.plantilla_id = p.plantilla_id;

COMMIT;
