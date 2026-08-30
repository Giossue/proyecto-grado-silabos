# Stack tecnológico

## Línea base

| Área | Tecnología | Estado |
|---|---|---|
| Lenguaje backend | PHP 8.3+ | Confirmado/propuesto como mínimo |
| Framework | Laravel 13 | Confirmado |
| Interfaz | Inertia 3 + Vue 3 Composition API | Actualizado al starter oficial vigente |
| Tipos frontend | TypeScript | Confirmado |
| Estilos/componentes | Tailwind + shadcn-vue | Confirmado en diagnóstico y starter oficial |
| Lienzo de mallas | Vue Flow | Confirmado para presentación; ADR-0006 |
| Compilación | Vite del starter Laravel | Base oficial |
| Rutas tipadas | Wayfinder del starter oficial | Mantener salvo ADR |
| Autenticación | Laravel Fortify mediante starter | Base técnica; política de cuentas por validar |
| Datos | PostgreSQL | Confirmado |
| Acceso a datos | Eloquent + Query Builder | Base Laravel |
| Colas/caché | Redis + workers | Confirmado |
| Observación de colas | Laravel Horizon | Propuesto |
| Archivos | Disco privado local o S3 compatible | Confirmado como abstracción; proveedor por validar |
| IA | Servicio local por HTTP | Confirmado como frontera; runtime/modelo por validar |
| Despliegue | Linux + contenedores | Confirmado |

Las versiones exactas quedan fijadas por `composer.lock` y `package-lock.json`. No
actualices dependencias principales de forma incidental dentro de una feature.

## Línea exacta verificada el 2026-08-14

| Componente | Versión bloqueada |
|---|---:|
| Laravel | 13.25.0 |
| PHP local de verificación | 8.5.8 (mínimo del proyecto: 8.3) |
| Inertia Laravel / Vue | 3.3.1 / 3.6.1 |
| Vue | 3.5.41 |
| Vite | 8.2.1 |
| Tailwind CSS | 4.3.3 |
| TypeScript | 5.9.3 |
| Fortify | 1.38.0 |
| Larastan | 3.10.0, nivel 7 |
| Predis | 3.5.1 |
| PostgreSQL local/CI | 18 |
| Redis local/CI | 8 |
| Vue Flow core / controles / minimapa / toolbar | 1.48.2 / 1.1.3 / 1.5.4 / 1.1.1 |

## Decisiones deliberadamente abiertas

- motor DOCX/PDF y estrategia de fidelidad (`PV-07`);
- modelo de embeddings/generación y runtime del servicio (`PV-13`, `PV-14`);
- SSO o credenciales administradas (`PV-09` y decisión institucional adicional);
- proveedor de almacenamiento, correo y observabilidad;
- Pest/PHPUnit y Vitest según lo que entregue/admita el starter al bootstrap;
- análisis estático PHP y cobertura mínima.

Cada elección se prueba con un spike y se registra si afecta portabilidad o mantenimiento.

## Política de dependencias

Antes de agregar un paquete:

1. demuestra que el framework o el código existente no resuelve la necesidad;
2. revisa compatibilidad con las versiones fijadas;
3. evalúa mantenimiento, licencia, seguridad y tamaño;
4. registra el motivo en el plan/ADR;
5. agrega una prueba del contrato que se espera del paquete;
6. actualiza este documento y el lockfile en el mismo cambio.

No se agregan SDK específicos de proveedores al dominio. Se encapsulan en adaptadores.

## Comandos objetivo

```bash
# desarrollo
composer run dev

# puerta canónica (formato, lint, tipos, análisis, pruebas y build)
composer verify
```

Durante I-00 se crearán scripts canónicos para formato, lint, tipos, pruebas y build. El
agente debe leer los archivos de proyecto; este documento no reemplaza sus scripts.

## Fuentes técnicas

- Laravel 13 starter kits: `https://laravel.com/docs/13.x/starter-kits`
- Laravel 13: `https://laravel.com/docs/13.x`
- Inertia 3: `https://inertiajs.com/docs/v3`
- Vue 3: `https://vuejs.org/guide/typescript/overview.html`
- Vue Flow: `https://vueflow.dev/`
- PostgreSQL: `https://www.postgresql.org/docs/`
