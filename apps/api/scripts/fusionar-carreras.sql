-- Merge one career into another (the absorbed career becomes a second malla of the kept career).
--
-- Usage:
--   psql "$DATABASE_URL" -v keep=SW-9 -v absorb=SW-8 -f apps/api/scripts/fusionar-carreras.sql
--
-- What it does, in one transaction:
--   1. Every malla of the absorbed career moves to the kept career and keeps its state (a career
--      may have several 'vigente' mallas); a malla whose code collides gets the suffix
--      " (<absorb>)" (a code holds 80 characters: a longer result aborts). Subjects follow their
--      malla through the ON UPDATE CASCADE composite FK asignaturas(malla_id, carrera_id) -> mallas.
--   2. convocatorias_carreras: when the kept career already takes part in the same university
--      convocatoria, the absorbed row's syllabi move to the kept row (its state is kept) and the
--      absorbed row is deleted; otherwise the row itself moves.
--   3. asignaciones_rol: an active role that the user already holds actively in the kept career
--      is folded into that one (paralelo assignments and sessions repointed, duplicate deleted);
--      an active coordination of a different user is moved inactive when the kept career already
--      has an active coordination (trigger comprobar_coordinacion_activa_unica); the rest move.
--   4. documentos_apoyo move to the kept career.
--   5. The absorbed career is deleted.
-- It aborts (nothing changes) when a code does not exist or both codes are the same.

\set ON_ERROR_STOP on

\if :{?keep}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Falta la variable keep: psql -v keep=<código a conservar> -v absorb=<código a absorber>'; END $$;
\endif
\if :{?absorb}
\else
  DO $$ BEGIN RAISE EXCEPTION 'Falta la variable absorb: psql -v keep=<código a conservar> -v absorb=<código a absorber>'; END $$;
\endif

BEGIN;

SELECT set_config('fusion.keep', :'keep', true) AS conservar, set_config('fusion.absorb', :'absorb', true) AS absorber;

DO $$
DECLARE
    v_keep_code text := current_setting('fusion.keep');
    v_absorb_code text := current_setting('fusion.absorb');
    v_keep uuid;
    v_absorb uuid;
    r record;
BEGIN
    IF v_keep_code = v_absorb_code THEN
        RAISE EXCEPTION 'La carrera a conservar y la carrera a absorber deben ser distintas (%).', v_keep_code;
    END IF;

    SELECT carrera_id INTO v_keep FROM carreras WHERE codigo_carrera = v_keep_code FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la carrera a conservar con código %.', v_keep_code;
    END IF;

    SELECT carrera_id INTO v_absorb FROM carreras WHERE codigo_carrera = v_absorb_code FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No existe la carrera a absorber con código %.', v_absorb_code;
    END IF;

    -- 1. Mallas (subjects follow through ON UPDATE CASCADE).
    UPDATE mallas AS m
    SET codigo_malla = m.codigo_malla || ' (' || v_absorb_code || ')'
    WHERE m.carrera_id = v_absorb
      AND EXISTS (SELECT 1 FROM mallas AS k WHERE k.carrera_id = v_keep AND k.codigo_malla = m.codigo_malla);

    UPDATE mallas AS m
    SET carrera_id = v_keep
    WHERE m.carrera_id = v_absorb;

    -- 2. Career participation in university convocatorias.
    -- Syllabus content does not change: keep its actualizado_en.
    ALTER TABLE silabos DISABLE TRIGGER marcar_actualizado_en;

    FOR r IN
        SELECT a.convocatoria_carrera_id AS absorbed_id,
               k.convocatoria_carrera_id AS kept_id,
               a.estado_convocatoria_carrera AS absorbed_state,
               k.estado_convocatoria_carrera AS kept_state
        FROM convocatorias_carreras AS a
        JOIN convocatorias_carreras AS k
          ON k.convocatoria_universidad_id = a.convocatoria_universidad_id
         AND k.carrera_id = v_keep
        WHERE a.carrera_id = v_absorb
    LOOP
        IF EXISTS (
            SELECT 1
            FROM silabos AS s
            JOIN silabos AS t ON t.paralelo_id = s.paralelo_id
            WHERE s.convocatoria_carrera_id = r.absorbed_id
              AND t.convocatoria_carrera_id = r.kept_id
        ) THEN
            RAISE EXCEPTION 'Ambas carreras tienen sílabo para el mismo paralelo en la convocatoria %; no se puede fusionar.', r.kept_id;
        END IF;

        UPDATE silabos SET convocatoria_carrera_id = r.kept_id WHERE convocatoria_carrera_id = r.absorbed_id;
        DELETE FROM convocatorias_carreras WHERE convocatoria_carrera_id = r.absorbed_id;

        IF r.absorbed_state IS DISTINCT FROM r.kept_state THEN
            RAISE NOTICE 'Convocatoria %: se conserva el estado % de %; el estado % de % se descarta.',
                r.kept_id, r.kept_state, v_keep_code, r.absorbed_state, v_absorb_code;
        END IF;
    END LOOP;

    ALTER TABLE silabos ENABLE TRIGGER marcar_actualizado_en;

    UPDATE convocatorias_carreras SET carrera_id = v_keep WHERE carrera_id = v_absorb;

    -- 3. Role assignments.
    FOR r IN
        SELECT a.asignacion_rol_id AS absorbed_id, k.asignacion_rol_id AS kept_id
        FROM asignaciones_rol AS a
        JOIN asignaciones_rol AS k
          ON k.carrera_id = v_keep
         AND k.usuario_id = a.usuario_id
         AND k.rol = a.rol
         AND k.asignacion_rol_activa
        WHERE a.carrera_id = v_absorb
          AND a.asignacion_rol_activa
    LOOP
        UPDATE asignaciones_paralelo SET asignacion_rol_id = r.kept_id WHERE asignacion_rol_id = r.absorbed_id;
        UPDATE sesiones_usuario SET active_role_assignment_id = r.kept_id WHERE active_role_assignment_id = r.absorbed_id;
        DELETE FROM asignaciones_rol WHERE asignacion_rol_id = r.absorbed_id;
    END LOOP;

    UPDATE asignaciones_rol AS a
    SET asignacion_rol_activa = false
    WHERE a.carrera_id = v_absorb
      AND a.rol = 'coordinador'
      AND a.asignacion_rol_activa
      AND EXISTS (
          SELECT 1
          FROM asignaciones_rol AS k
          JOIN usuarios AS u ON u.usuario_id = k.usuario_id
          WHERE k.carrera_id = v_keep
            AND k.rol = 'coordinador'
            AND k.asignacion_rol_activa
            AND u.usuario_activo
      );

    UPDATE asignaciones_rol SET carrera_id = v_keep WHERE carrera_id = v_absorb;

    -- 4. Support documents.
    UPDATE documentos_apoyo SET carrera_id = v_keep WHERE carrera_id = v_absorb;

    -- 5. The absorbed career.
    DELETE FROM carreras WHERE carrera_id = v_absorb;

    RAISE NOTICE 'Carrera % fusionada en %.', v_absorb_code, v_keep_code;
END
$$;

SELECT m.codigo_malla, m.estado_malla, m.numero_ciclos, count(a.asignatura_id) AS asignaturas
FROM mallas AS m
JOIN carreras AS c ON c.carrera_id = m.carrera_id
LEFT JOIN asignaturas AS a ON a.malla_id = m.malla_id
WHERE c.codigo_carrera = :'keep'
GROUP BY m.malla_id
ORDER BY m.estado_malla DESC, m.codigo_malla;

COMMIT;
