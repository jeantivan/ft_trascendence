# Switch

- **File:** `Switch.tsx` (client component)
- **Purpose:** accessible boolean toggle (`role="switch"`) for immediate settings such as Club Profile visibility or notification preferences.
- **Props:**
  - `checked` (controlled) or `defaultChecked` (uncontrolled, `false` by default), `onCheckedChange?: (checked: boolean) => void`.
  - `label?: ReactNode`, `description?: string`: optional text block rendered on the left and linked via `aria-labelledby` and `aria-describedby` (`htmlFor` on the label too).
  - `name?: string`, `value?: string` (`"on"` by default): renders a `<input type="hidden">` disabled while unchecked so standard `<form>` submissions match native checkboxes.
  - Accepts `<button>` props (`disabled`, `id`, `aria-invalid`, `aria-labelledby`, `className`).
- **Behaviour:** toggles on click, `Space` and `Enter` via native `<button type="button">`, respects `prefers-reduced-motion` (`motion-reduce:transition-none`), and uses Kinetic Obsidian tokens (`volt` when on, `border-rpe-max` when invalid).
- **Example:**

  ```tsx
  <Switch
    label="Estadísticas públicas en Club Profile"
    description="Muestra kilómetros totales y sesiones completadas a tu club."
    checked={statsPublic}
    onCheckedChange={setStatsPublic}
  />
  ```
