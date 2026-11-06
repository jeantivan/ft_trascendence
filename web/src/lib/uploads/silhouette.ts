// The generic avatar that GET /api/files/[id] returns when there is no photo to
// show (#23). PROVISIONAL: to be replaced by the app's own icon set once it is
// ready (agreed on #23); the colours are --color-surface-overlay and --color-text-secondary from
// globals.css, copied because an <img> cannot read CSS variables.
export const SILHOUETTE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#1e2638"/>
  <circle cx="32" cy="24" r="12" fill="#94a3b8"/>
  <path d="M10 60c2-12 11-18 22-18s20 6 22 18z" fill="#94a3b8"/>
</svg>`;
