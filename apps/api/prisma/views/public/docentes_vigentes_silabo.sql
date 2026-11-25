SELECT
  silabos.silabo_id,
  asignaciones_rol.usuario_id,
  asignaciones_rol.asignacion_rol_id,
  asignaciones_paralelo.asignacion_paralelo_id,
  silabos.paralelo_id
FROM
  (
    (
      silabos
      JOIN asignaciones_paralelo ON (
        (
          (
            asignaciones_paralelo.paralelo_id = silabos.paralelo_id
          )
          AND asignaciones_paralelo.asignacion_paralelo_activa
        )
      )
    )
    JOIN asignaciones_rol ON (
      (
        (
          asignaciones_rol.asignacion_rol_id = asignaciones_paralelo.asignacion_rol_id
        )
        AND asignaciones_rol.asignacion_rol_activa
        AND ((asignaciones_rol.rol) :: text = 'docente' :: text)
      )
    )
  );