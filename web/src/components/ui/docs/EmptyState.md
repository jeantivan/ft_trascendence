# EmptyState

- **File:** `EmptyState.tsx`
- **Purpose:** reusable placeholder block for views, lists, tables or filtered searches with no data.
- **Props:** accepts the `<div>` props (except `title`) and `className`.
  - `title` (required): heading text (`<h2>`).
  - `description`: optional supporting text below the title.
  - `icon`: optional `IconName` (rendered inside a circular `surface-overlay` badge) or custom `ReactNode`.
  - `action`: optional CTA (usually a `<Button>`).
  - `size`: `"md"` (default, `py-10`) or `"sm"` (`py-6`, compact text).
  - `variant`: `"card"` (default, wraps content in `<Card>`) or `"plain"` (no border or background, for use inside an existing `<Card>` or table).
  - `live`: when `true`, sets `role="status"` so screen readers announce empty search/filter results.
- **Example:**

  ```tsx
  <EmptyState
    icon="groups"
    title="No perteneces a ningún club activo"
    description="Únete a un club de running para acceder a sus plantillas."
    action={
      <Button variant="ghost" href="/club">
        Explorar clubes
      </Button>
    }
  />
  ```
