# FormField

- **File:** `FormField.tsx`
- **Purpose:** form field: label + control + error message.
- **Props:** `label`, `htmlFor` (the control's `id`), `error` (optional) and a single child (`Input`...). With `error` it shows the message in red (`role="alert"`) and adds `aria-invalid` and `aria-describedby` to the control.
- **Example:** `<FormField label="Email" htmlFor="email" error={emailError}><Input id="email" name="email" type="email" /></FormField>` (the `Input`'s `id` and `htmlFor` must match)
