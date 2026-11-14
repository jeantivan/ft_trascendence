# Badge

- **File:** `Badge.tsx`
- **Purpose:** uppercase pill (`label-caps`) that tags a session type or a warning (the "Data Tags & Badges" of `DESIGN.md`): 12% background of the accent color and an opaque border and text of the same color.
- **Props:** accepts the `<span>` props and `className`. `variant` (required): `rodaje`, `intervalos`, `cuestas`, `tirada-larga` (or `tirada_larga`, the Prisma `SessionType` spelling) or `fartlek` use the matching `session-*` token; `warning` uses `volume-alert` (amber) for the volume alert. The children must say the type in text: color alone is not enough.
- **Example:** `<Badge variant="intervalos">Intervalos</Badge>`, or `<Badge variant="warning">+12% vs. semana anterior</Badge>`.
