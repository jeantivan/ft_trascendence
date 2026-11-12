# Modal

- **File:** `Modal.tsx` (client component)
- **Purpose:** dialog over a dimmed backdrop (`surface-base` at 85% + blur), with an orange-lime-cyan gradient strip (`session-cuestas`, `session-fartlek`, `session-rodaje`) on top, a fixed header, a scrolling body and an optional fixed footer.
- **Props:**
  - `open`: the parent owns it; the native `<dialog>` is only synced to it (`showModal()` / `close()`).
  - `onClose`: called on Escape, on a click on the backdrop, on the "×" button and when the browser closes the dialog by itself (e.g. a `<form method="dialog">` inside). The Modal never closes itself: the parent sets `open` to `false`.
  - `title`: shown in the header and used as the accessible name of the dialog.
  - `closeLabel`: accessible name of the "×" button ("Cerrar" by default).
  - `footer`: optional actions, pinned to the bottom while the body scrolls.
  - `children`: the body.
- **Behaviour:** built on `<dialog>`, so the browser traps focus, makes the rest of the page inert and returns focus to the element that opened it.
- **Example:**

  ```tsx
  <Modal
    open={open}
    onClose={() => setOpen(false)}
    title="Log metrics"
    footer={<Button onClick={save}>Save</Button>}
  >
    <p>Body</p>
  </Modal>
  ```
