# I-59 — Hoja de plantilla vacía

## Estado

Implementación verificada localmente el 2026-09-08 por decisión explícita del
responsable del producto. Permanece activo hasta la revisión visual de la hoja.

## Decisión

ADM-06 muestra únicamente una hoja carta blanca y vacía. Se retiran de esa superficie
el constructor, bloques, campos, tablas, menús y personalización. El servidor deja de
enviar esas estructuras al navegador. No se borran registros de la base ni revisiones:
esa eliminación sería destructiva y no es necesaria para dejar limpia la pantalla.

## Alcance

- RF-017..026; RN-009..012; CU-04; ADM-06.
- Reemplaza en la interfaz administrativa I-56 e I-58.
- Conserva I-32, la plantilla única y la inmutabilidad de revisiones.

## Criterios

- [x] La hoja permanece visible con orientación, tamaño y márgenes.
- [x] La hoja no muestra contenido ni controles.
- [x] La respuesta Inertia no contiene secciones, bloques, campos ni catálogos del
      constructor.
- [x] Los datos persistidos no se eliminan.
- [x] Verificar tipos, formato, pruebas focalizadas y compilación.

## Evidencia local

- 40 pruebas focalizadas y 1.225 aserciones.
- Pint, ESLint, `vue-tsc`, PHPStan y compilación Vite aprobados.
