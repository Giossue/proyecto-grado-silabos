# ADR-0001: Monolito modular Laravel/Inertia

- Estado: Aceptado
- Fecha: 2026-08-14
- Trazabilidad: DP-11, RNF-029, arquitectura v0.1.

## Contexto

El producto tiene un único dominio transaccional, equipo académico pequeño, reglas que
requieren consistencia y un despliegue institucional todavía por validar. Separar API y
SPA o crear microservicios aumentaría contratos, despliegues y fallos distribuidos sin
beneficio demostrado.

## Decisión

Usar Laravel 13 como monolito modular y unidad de despliegue. La interfaz usa Inertia con
Vue/TypeScript. Los módulos tienen límites explícitos y las integraciones externas se
encapsulan detrás de puertos.

## Consecuencias

- Transacciones e identidad simples en un único proceso.
- Menor coste de operación y desarrollo inicial.
- Se necesitan reglas/pruebas de arquitectura para evitar un monolito desordenado.
- Un módulo podría extraerse solo si métricas y límites demuestran la necesidad.
