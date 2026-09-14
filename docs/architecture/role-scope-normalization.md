# Normalización de roles y responsabilidades académicas

## Estado

Implementado y verificado localmente y en producción el 14 de septiembre de 2026 mediante
las migraciones `000056`–`000059`.

## 1. Asignaciones de rol

## `asignaciones_rol`

**Contexto:** única relación RBAC. Indica qué rol puede ejercer una persona y, cuando
aplica, en qué carrera.

```text
id UUID (PK)
usuario_id UUID (FK → usuarios.id) NOT NULL
rol_id UUID (FK → roles.id) NOT NULL
carrera_id UUID (FK → carreras.id) NULL
activo BOOLEAN NOT NULL DEFAULT TRUE
asignado_en TIMESTAMPTZ NULL

UNIQUE parcial (usuario_id, rol_id, carrera_id) WHEN activo
```

Una fila activa con `roles.codigo = 'coordinador'` es la coordinación efectiva. No hay
una tabla adicional de coordinación.

**Regla:** PostgreSQL rechaza una segunda coordinación ejercible de la misma carrera.
Una cuenta inactiva conserva su asignación como historial, pero no cuenta como ejercible
ni bloquea el reemplazo.

## 2. Responsabilidad docente por paralelo

## `docentes_paralelo`

**Contexto:** responsabilidad operativa de una persona docente sobre un paralelo. No es
una tabla de roles: exige que una asignación RBAC de rol `docente` respalde el vínculo.

```text
id UUID (PK)
asignacion_rol_id UUID (FK → asignaciones_rol.id) NOT NULL
paralelo_id UUID (FK → paralelos.id) NOT NULL
activo BOOLEAN NOT NULL DEFAULT TRUE
asignado_en TIMESTAMPTZ NULL

UNIQUE (asignacion_rol_id, paralelo_id)
```

La aplicación verifica que la asignación de rol sea `docente`, esté activa y pertenezca a
la carrera del paralelo antes de crear o modificar la responsabilidad.

## 3. Colaboradores del sílabo

## `colaboradores_silabo`

**Contexto:** conserva qué persona responde por un sílabo y cuál era su responsabilidad
docente concreta.

```text
id UUID (PK)
silabo_id UUID (FK → silabos.id) NOT NULL
usuario_id UUID (FK → usuarios.id) NOT NULL
docente_paralelo_id UUID (FK → docentes_paralelo.id) NOT NULL

UNIQUE (silabo_id, docente_paralelo_id)
```

`usuario_id` permite resolver al colaborador directamente; `docente_paralelo_id`
conserva la evidencia de su paralelo y del rol que lo habilitaba en ese momento.

## Cardinalidades

```text
usuarios N:M roles mediante asignaciones_rol
carreras 1:N asignaciones_rol con alcance de carrera
asignaciones_rol (rol docente) 1:N docentes_paralelo
paralelos 1:N docentes_paralelo
silabos 1:N colaboradores_silabo
docentes_paralelo 1:N colaboradores_silabo
```

En forma derivada, usuarios y paralelos se relacionan N:M mediante
`asignaciones_rol → docentes_paralelo`, con el rol docente y la carrera validados.

## Migración y recuperación

La migración `000056` comprueba antes del cambio que cada responsabilidad docente tiene
un rol docente activo en la carrera correspondiente. Si alguna no lo tiene, aborta sin
eliminar datos. Antes de aplicar en producción se verificó un respaldo lógico y cero
responsabilidades huérfanas.
