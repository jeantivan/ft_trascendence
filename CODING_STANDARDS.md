# Coding Standards

Criterios de revisión para `code-review` (las comprobaciones mecánicas viven en ESLint, TypeScript y Vitest).

## Separación de capas

- **Repositorios** (`*Repository`, `Prisma*Repository`, `InMemory*Repository`): solo acceso a datos y transacciones; no comprueban permisos de usuario.
- **Servicios** (`*Service`): validan entrada, comprueban membresía y rol vigente en base de datos y aplican las reglas de dominio.
- **Server Actions** (`web/src/lib/<modulo>/actions.ts`): validan rol en la entrada con `requireOrgRole` / `requireAuth` / `requireAdmin` (fuera de `try/catch`), eligen el permiso de `ORG_ROLES` que coincide con el alcance de la acción y traducen errores de dominio a señales de Next.js (`notFound()`, `forbidden()`) o `{ success: false, error }`.
- **Tests de acciones**: toda Server Action añadida o modificada en `web/src/lib/<modulo>/actions.ts` debe quedar cubierta en `web/tests/unit/<modulo>/actions.test.ts`.
- **Paridad de repositorios**: cuando un módulo tenga suite de contrato compartida (`*-repository-contract.ts`), los casos nuevos de repositorio se añaden en el contrato para validar a la vez la implementación en memoria y la de Prisma.

## Autorización y anti-enumeración

- **404 (`NotFoundError`)**: para recursos de otro club, identificadores inexistentes, actores fuera del club o intentos de un Athlete de leer recursos privados de otro Athlete (evita revelar existencia de IDs).
- **403 (`ForbiddenError`)**: cuando un miembro legítimo del club intenta una acción reservada a otro rol dentro de su propio club (p. ej. un Athlete llamando a una acción de Manager).

## Datos de salud y privacidad

- **Minimización con `select`**: al consultar tablas con datos de salud (`session_logs`, `feedback`) solo para comprobar existencia o relaciones, usar `select` explícito (p. ej. `select: { sessionId: true }`) sin cargar `rpe` ni `body`.
- **Notificaciones y SSE**: los payloads llevan únicamente identificadores (`*Id`), nunca RPE, Feedback ni texto sensible.

## Terminología y alcance

- Usar el vocabulario de `CONTEXT.md` (`Organization`, `Group`, `Training Template`, `Template Session`, `Customized Session`, `Free Session`, `Spot Request`, `Session Metrics`).
- Concurrencia fuera de los flujos de demo de #238 (carreras entre sucesos independientes en el mismo milisegundo) se documenta con `Known limit (#238)` en lugar de añadir tests o complejidad innecesaria.
