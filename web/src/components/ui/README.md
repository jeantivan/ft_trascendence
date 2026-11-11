# Design system de StrideSync

Componentes reutilizables y tokens de la app. Fuente de verdad del diseño:
`ideas/stitch_athlete_training_dashboard/kinetic_obsidian/DESIGN.md`. Si algo no está ahí, preguntar; no decidirlo por cuenta propia.

## Reglas (personas e IAs)

1. Antes de escribir UI, mira la carpeta `docs/` (un fichero por componente) y **úsalos**. No dupliques un botón, badge, input... con clases sueltas.
2. Si falta un componente o una variante, **pregunta antes de crearlo**. Un componente nuevo va en su propio PR.
3. Solo tokens: nada de colores hex, `px` ni sombras escritas a mano (`bg-[#ccff00]`, `shadow-[0_0_20px_...]`). Si falta un token, se añade a `web/src/app/globals.css` (y a `DESIGN.md` si es del diseño).
4. Un fichero por componente en `web/src/components/ui/`, nombre en PascalCase (`Button.tsx`). Importar con `@/components/ui/Button`.
5. Fuentes: `font-heading` (Space Grotesk) y `font-sans` (Hanken Grotesk). No usar otras.
6. Al añadir un componente, añadir su `docs/<Componente>.md` en el mismo PR.

## Definition of Done (un ticket de componente)

- Cumple sus criterios de aceptación y usa solo tokens (regla 3).
- Tiene su `docs/<Componente>.md` con su ejemplo de uso.
- Las pantallas que ya tenían ese elemento lo usan (nada de duplicados con clases sueltas).
- `make test` pasa y se ha comprobado en el navegador (`https://localhost:8443`).
- El PR dice qué se ha comprobado y qué no, y el CI pasa. El merge lo hace Jean.

## Tokens (`web/src/app/globals.css`)

| Qué | Clases de Tailwind | Notas |
|---|---|---|
| Color | `bg-surface-base`, `bg-surface-elevated`, `bg-surface-overlay`, `border-border-subtle`, `border-border-strong`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `text-volt`, `text-rpe-low` ... `text-rpe-max`, `text-session-rodaje` ... | `volt` es el acento (#CCFF00) |
| Radio | `rounded-sm` (4px), `rounded` (8px, el estándar), `rounded-md` (12px), `rounded-lg` (16px), `rounded-xl` (24px), `rounded-full` | Botones, inputs y tarjetas: `rounded` |
| Espaciado | `gutter`, `gutter-desktop`, `margin`, `margin-tablet`, `margin-desktop` (p. ej. `px-margin`, `gap-gutter`) | Para xs a xl usa la escala de Tailwind: `1`, `2`, `4`, `6`, `10` |
| Sombra | `shadow-kinetic-glow` (tarjeta activa), `shadow-button-glow` (hover de botón primario), `shadow-error-glow` (errores) | |
| Layout | `w-rail` (260px), `w-rail-collapsed` (72px), `max-w-content` (1440px) | |
| Tipografía | `text-display-hero`, `text-display-hero-mobile`, `text-headline-lg`, `text-headline-lg-mobile`, `text-headline-md`, `text-headline-sm`, `text-metric-huge`, `text-body-lg`, `text-body-md`, `text-body-sm`, `text-label-caps`, `text-label-badge` | Ya incluyen interlineado, tracking y peso. Añade `font-heading` o `font-sans` |

## Componentes

Un fichero por componente en `web/src/components/ui/docs/` (`Button.md`, `Input.md`...). **La lista de componentes es esa carpeta.** Cada doc lleva: fichero, para qué sirve, props principales y un ejemplo de uso.

Al crear un componente, añade su `docs/<Componente>.md` y **no edites ninguna tabla compartida**: así dos PRs de componentes distintos nunca chocan en este README.
