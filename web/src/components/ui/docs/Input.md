# Input

- **File:** `Input.tsx`
- **Purpose:** single-line text field (48px).
- **Props:** accepts the `<input>` props and `className`. With `aria-invalid="true"` it shows a red border and focus (`rpe-max`); at rest, focus is `volt`. `disabled` dims it. The label (`<label htmlFor>`) lives outside the component.
- **Example:** `<label htmlFor="email">Email</label>` and `<Input id="email" name="email" type="email" aria-invalid={Boolean(error)} />`
