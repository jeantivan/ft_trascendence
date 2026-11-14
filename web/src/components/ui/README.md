# StrideSync design system

Reusable components and tokens of the app. Source of truth for the design:
`ideas/stitch_athlete_training_dashboard/kinetic_obsidian/DESIGN.md`. If something is not there, ask; do not decide it on your own.

## Rules (people and AIs)

1. Before writing UI, look at the `docs/` folder (one file per component) and **use them**. Do not duplicate a button, badge, input... with loose classes.
2. If a component or a variant is missing, **ask before creating it**. A new component goes in its own PR.
3. Tokens only: no hex colors, `px` or hand-written shadows (`bg-[#ccff00]`, `shadow-[0_0_20px_...]`). If a token is missing, add it to `web/src/app/globals.css` (and to `DESIGN.md` if it belongs to the design).
4. One file per component in `web/src/components/ui/`, named in PascalCase (`Button.tsx`). Import with `@/components/ui/Button`.
5. Fonts: `font-heading` (Space Grotesk) and `font-sans` (Hanken Grotesk). Do not use others.
6. When adding a component, add its `docs/<Component>.md` in the same PR.

## Definition of Done (a component ticket)

- Meets its acceptance criteria and uses tokens only (rule 3).
- Has its `docs/<Component>.md` with a usage example.
- The screens that already had that element use it (no duplicates with loose classes).
- `make test` passes and it has been checked in the browser (`https://localhost:8443`).
- The PR says what has been checked and what has not, and CI passes. Jean does the merge.

## Tokens (`web/src/app/globals.css`)

| What | Tailwind classes | Notes |
|---|---|---|
| Color | `bg-surface-base`, `bg-surface-elevated`, `bg-surface-overlay`, `border-border-subtle`, `border-border-strong`, `text-text-primary`, `text-text-secondary`, `text-text-muted`, `text-volt`, `text-rpe-low` ... `text-rpe-max`, `text-session-rodaje` ... | `volt` is the accent (#CCFF00) |
| Radius | `rounded-sm` (4px), `rounded` (8px, the standard), `rounded-md` (12px), `rounded-lg` (16px), `rounded-xl` (24px), `rounded-full` | Buttons, inputs and cards: `rounded` |
| Spacing | `gutter`, `gutter-desktop`, `margin`, `margin-tablet`, `margin-desktop` (e.g. `px-margin`, `gap-gutter`) | For xs to xl use the Tailwind scale: `1`, `2`, `4`, `6`, `10` |
| Shadow | `shadow-kinetic-glow` (active card), `shadow-button-glow` (primary button hover), `shadow-error-glow` (errors) | |
| Layout | `w-rail` (260px), `w-rail-collapsed` (72px), `max-w-content` (1440px) | |
| Typography | `text-display-hero`, `text-display-hero-mobile`, `text-headline-lg`, `text-headline-lg-mobile`, `text-headline-md`, `text-headline-sm`, `text-metric-huge`, `text-body-lg`, `text-body-md`, `text-body-sm`, `text-label-caps`, `text-label-badge` | They already include line height, tracking and weight. Add `font-heading` or `font-sans` |

## Components

One file per component in `web/src/components/ui/docs/` (`Button.md`, `Input.md`...). **The list of components is that folder.** Each doc has: file, what it is for, main props and a usage example.

When creating a component, add its `docs/<Component>.md` and **do not edit any shared table**: that way two PRs for different components never conflict in this README.
