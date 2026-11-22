# Select

- **File:** `Select.tsx`
- **Purpose:** full-width native `<select>` styled like `Input` (48px), with a `chevron-down` icon on the right (`pointer-events-none`).
- **Props:** accepts the `<select>` props (`id`, `name`, `value`, `defaultValue`, `onChange`, `disabled`, `required`, `children`...) and `className`. Optional `placeholder` renders a disabled `<option value="">` at the start (selected by default when neither `value` nor `defaultValue` is passed) and dims the text while it is selected; optional `options` (`{ value, label, disabled? }[]`) renders `<option>` elements instead of `children`. With `aria-invalid="true"` it shows a red border and focus (`rpe-max`); at rest, focus is `volt`. `disabled` dims it.
- **Example:** `<FormField label="Session Type" htmlFor="session-type" error={error}><Select id="session-type" name="sessionType" placeholder="Select a type" options={[{ value: "rodaje", label: "Rodaje" }]} /></FormField>`
