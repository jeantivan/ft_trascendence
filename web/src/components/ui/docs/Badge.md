# Badge

- **File:** `Badge.tsx`
- **Purpose:** uppercase pill (`label-caps`) that tags a session type, a warning or a semantic status (the "Data Tags & Badges" of `DESIGN.md`). Accent variants use a 12% background with an opaque border and text of the same color; `neutral` uses `surface-overlay` with `border-strong` and `text-secondary`.
- **Props:** accepts the `<span>` props and `className`. `variant` (required, exported as `BadgeVariant`):
  - Session types (`session-*` tokens): `rodaje`, `intervalos`, `cuestas`, `tirada-larga` (or `tirada_larga`, the Prisma `SessionType` spelling), `fartlek`.
  - Semantic statuses: `warning` (`volume-alert`), `success` (`rpe-low`), `info` (`session-rodaje`), `destructive` (`rpe-max`), and `neutral` (`surface-overlay` / `border-strong` / `text-secondary`).
  - The children must state the type or status in text: color alone is not enough.
- **Example:** `<Badge variant="intervalos">Intervalos</Badge>`, `<Badge variant="warning">+12% vs. semana anterior</Badge>`, `<Badge variant="success">Plaza Confirmada</Badge>`, or `<Badge variant="info">{12}</Badge>` (tabular figures for counters).
