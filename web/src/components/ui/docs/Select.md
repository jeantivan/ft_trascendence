# Select

- **File:** `Select.tsx`
- **Purpose:** native `<select>` styled like `Input` (48px, full width), with a `chevron-down` icon on the right (`pointer-events-none`).
- **Props:** accepts the `<select>` props (`id`, `name`, `value`, `defaultValue`, `onChange`, `disabled`, `required`, `children`...) and `className`. Optional `placeholder` renders a disabled `<option value="">` at the start and dims the text while it is selected; optional `options` (`{ value, label, disabled? }[]`) renders `<option>` elements instead of `children`. With `aria-invalid="true"` it shows a red border and focus (`rpe-max`); at rest, focus is `volt`. `disabled` dims it.
- **Example:** `<FormField label="Session Type" htmlFor="session-type" error={error}><Select id="session-type" name="sessionType" placeholder="Select a type" options={[{ value: "rodaje", label: "Rodaje" }]} /></FormField>`
