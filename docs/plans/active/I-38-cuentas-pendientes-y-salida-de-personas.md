# I-38: Cuentas pendientes de activación y salida de personas

## Estado

Parte 1 implementada el 2026-09-03 (cuentas pendientes). Parte 2 (salida de docentes y
coordinadores) implementada el mismo día en `I-39-salida-de-personas-y-relevos.md`, con
la tabla completa de casos.

## Parte 1: cuentas que nadie ha estrenado

Una cuenta «pendiente de activación» es la que conserva su contraseña temporal
(`usuarios.debe_cambiar_contrasena`). Mientras esté así, Administración puede:

- **Reenviar acceso** (`POST admin/usuarios/{user}/reenviar-acceso`,
  `ResendManagedUserCredentials`): nueva contraseña temporal generada en el servidor
  (`TemporaryPassword`, misma política que el navegador), sesiones fuera, correo
  `ManagedUserCredentialsMail` al correo actual, auditoría `usuario.acceso_reenviado`.
- **Corregir el correo** y que el acceso viaje solo al nuevo (`UpdateManagedUserProfile`
  llama al reenvío cuando cambia el correo de una cuenta pendiente).
- **Eliminar** (`DELETE admin/usuarios/{user}`, `DeleteManagedUser`): solo si la cuenta no
  dejó rastro (`DeleteManagedUser::TRACES`: asignaciones docentes, sílabos, revisiones,
  auditoría como actor…). Borra rol, nombramiento y notificaciones; audita
  `usuario.eliminado` con correo y nombre. Con historia, el mensaje remite a archivar.
- Política `UserPolicy::managePending`; ambas acciones aparecen en el menú de la fila
  (`ManagedUserPendingActions`) solo para cuentas pendientes.

## Parte 2: cuando alguien deja de formar parte (análisis)

### Lo que ya existe

- Archivar la cuenta (`SetUserStatus`): cierra sesiones y el nombramiento de
  coordinación abierto. La persona no vuelve a entrar; su historia (sílabos, revisiones,
  auditoría) queda intacta y atribuida.
- Nombramientos de coordinación con vigencia (`asignaciones_coordinador`): Administración
  puede cerrar uno y abrir otro sobre la misma carrera. Malla, ofertas, paralelos y
  convocatorias pertenecen a la carrera, no a la persona.
- Asignaciones docentes con vigencia por paralelo, y **relevo docente** por sílabo
  (`ReviewController::transferTeacher`): cierra al saliente, abre al entrante sobre los
  mismos paralelos; el borrador sin enviar se descarta con aviso.

### Por qué no es un caos

Nada del sistema «es» de una persona: es de la carrera (malla, ofertas, paralelos,
convocatoria) o de un sílabo (borradores, revisiones). Las personas solo tienen
**vigencias** sobre esas cosas. Salir = cerrar vigencias + cerrar la cuenta. La
historia no se toca ni se reasigna: quien revisó, revisó.

### Lo que falta para que salir sea un solo paso

1. **Coordinador que sale**: hoy Administración archiva la cuenta (se cierra el
   nombramiento) y después nombra al reemplazo desde Carreras. Propuesta: en la misma
   pantalla, «Reemplazar coordinador» = cerrar vigencia + abrir la del entrante + (si el
   saliente no tiene otro rol) archivar la cuenta. Un paso, con auditoría.
2. **Docente que sale a mitad de periodo**: hoy Coordinación releva sílabo por sílabo y
   edita la asignación de cada paralelo. Propuesta: «Relevar en todos sus paralelos»
   desde Asignación docente, que aplique el relevo por sílabo a todos los del periodo
   activo, y archivar la cuenta si no le queda nada vigente.
3. **Bloqueo útil**: no permitir archivar una cuenta con asignaciones docentes vigentes
   en un periodo con proceso abierto sin haber hecho el relevo (mensaje que lo dice).
   Así el archivo nunca deja sílabos huérfanos.
4. **Nunca** «pasar el poder» de una cuenta a otra ni reutilizar cuentas: cada persona
   tiene la suya y la auditoría es personal. Cambiar nombre y correo es solo para
   corregir errores, no para reasignar.

Cuentas de docentes y coordinadores se archivan, no se borran (excepto las pendientes
sin rastro de la Parte 1).

## Verificación

`ManagedUserTest` (reenvío con nueva contraseña, reenvío al corregir el correo,
eliminación de pendiente sin rastro, rechazo de cuenta activada o con asignación);
suite de identidad y arquitectura en verde, phpstan, eslint, vue-tsc y build.
