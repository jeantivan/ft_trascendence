# Design system de StrideSync

Componentes reutilizables y tokens de la app. Fuente de verdad del diseño:
`ideas/stitch_athlete_training_dashboard/kinetic_obsidian/DESIGN.md`. Si algo no está ahí, preguntar; no decidirlo por cuenta propia.

## Reglas (personas e IAs)

1. Antes de escribir UI, mira la lista de componentes de abajo y **úsalos**. No dupliques un botón, badge, input... con clases sueltas.
2. Si falta un componente o una variante, **pregunta antes de crearlo**. Un componente nuevo va en su propio PR.
3. Solo tokens: nada de colores hex, `px` ni sombras escritas a mano (`bg-[#ccff00]`, `shadow-[0_0_20px_...]`). Si falta un token, se añade a `web/src/app/globals.css` (y a `DESIGN.md` si es del diseño).
4. Un fichero por componente en `web/src/components/ui/`, nombre en PascalCase (`Button.tsx`). Importar con `@/components/ui/Button`.
5. Fuentes: `font-heading` (Space Grotesk) y `font-sans` (Hanken Grotesk). No usar otras.
6. Al añadir un componente, actualizar la tabla de este README en el mismo PR.

## Definition of Done (un ticket de componente)

- Cumple sus criterios de aceptación y usa solo tokens (regla 3).
- Está en la tabla de componentes de este README, con su ejemplo de uso.
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

Se añaden por oleadas (ver el ticket del módulo). Al crear uno, añade una fila:

| Componente | Fichero | Para qué | Props principales |
|---|---|---|---|
| `Button` | `Button.tsx` | Acciones y enlaces con aspecto de botón (48px) | `variant`: `primary` (por defecto), `ghost`, `destructive`. Con `href` es un `Link`; sin `href`, un `<button type="button">` (pasa `type="submit"` para enviar formularios). Acepta el resto de props de `<button>` o `Link` y `className` |
| `Logo` | `Logo.tsx` | Logo de StrideSync (SVG inline, con sus colores propios: no usa tokens, a propósito) | `variant`: `full` (por defecto, marca + texto) o `mark` (solo el cuadrado con el rayo, para la barra lateral colapsada). El tamaño lo da `className` (`h-8 w-auto`). Acepta el resto de props de `<svg>` |
| `Input` | `Input.tsx` | Campo de texto de una línea (48px) | Acepta las props de `<input>` y `className`. Con `aria-invalid="true"` muestra borde y foco en rojo (`rpe-max`); en reposo, foco `volt`. `disabled` lo atenúa. La etiqueta (`<label htmlFor>`) va fuera del componente |

Ejemplo: `<Button variant="ghost" href="/events">Ver Events</Button>`.
Ejemplo: `<Logo className="h-8 w-auto" />`, o `<Logo variant="mark" className="size-10" />` para solo la marca.
Ejemplo: `<label htmlFor="email">Email</label>` y `<Input id="email" name="email" type="email" aria-invalid={Boolean(error)} />`.
