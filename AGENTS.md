## Agent skills

### Issue tracker

Issues live in GitHub. Use `gh issue` CLI or the GitHub web interface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Coding standards

Review-time conventions live in `CODING_STANDARDS.md`.

## Nombre de la app

El nombre de la app es **StrideSync** (elegido por Jean). Usarlo en la UI, textos y documentación. `ft_transcendence` es solo el nombre del proyecto de 42 y del repositorio.

## Skill obligatoria

Usar siempre la skill 42-slow-mode al escribir, editar o revisar código y configuración (Docker, Prisma, NGINX).

## Skill management

Local skills live in `.agents/skills/` and are symlinked in `.claude/skills/` and `.agent/skills/`. To add an external skill (e.g., from [Matt Pocock's v1.3 skills](https://github.com/mattpocock/skills/tree/main/skills/engineering)): download its SKILL.md and README.md, place in `.agents/skills/{skill-name}/`, then symlink to `.claude/skills/{skill-name}` and `.agent/skills/{skill-name}`.

## Diseño y branding

- Toda UI nueva o modificada sigue `ideas/stitch_athlete_training_dashboard/kinetic_obsidian/DESIGN.md` (paleta, tipografías, botones, inputs, estados). Leerlo antes de tocar estilos.
- Usar los tokens de `web/src/app/globals.css` y las fuentes de `web/src/app/layout.tsx` (`font-heading`, `font-sans`) en lugar de colores o fuentes sueltas.
- Antes de escribir UI, leer `web/src/components/ui/README.md` (tokens y reglas) y la carpeta `web/src/components/ui/docs/` (un fichero por componente, escrito en inglés), y reutilizar sus componentes en lugar de crear clases sueltas.
- `DESIGN.md` es el diseño acordado (diseño de Stitch de Jean). Si algo no está en él, preguntar; no decidirlo por cuenta propia. Esta regla prevalece sobre skills de diseño genéricas.

## Antes de tocar código

- Leer `CONTEXT.md` y usar su vocabulario, leer el ticket en GitHub y leer los archivos que se van a modificar.
- Trabajar un solo ticket a la vez. No cambiar su estado ni cerrar tickets sin confirmación del equipo.
- Si una decisión de dominio, permisos o seguridad no está cerrada en un ticket, no la inventes: pregunta.

## Git

- Nunca push directo a `main`. Una rama por ticket (`feat/`, `fix/`, `docs/`, `chore/`) y un PR pequeño por ticket.
- No hacer merge sin confirmación explícita.
- No usar `--force`, `reset --hard`, `clean -fd` ni borrar ramas remotas sin explicar el impacto y esperar confirmación.

## Secretos y datos personales

- No leer, mostrar ni versionar `.env`, tokens, claves privadas ni certificados. Si se añade una variable, actualizar `.env.example` con valores vacíos o ficticios.
- RPE y Feedback son datos de salud: no van a logs ni dentro del payload de eventos SSE o notificaciones. El evento lleva solo ids; el cliente pide el dato a un endpoint que comprueba permisos.
- Un token en un enlace va siempre en `?token=...`, nunca en la ruta (#185); antes de tocar Next.js o `nginx/app.conf` para rutas con token, lee `docs/security/tokens.md`.

## Datos de ejemplo (seed)

- Los datos de ejemplo de cada parte van en `web/prisma/seed/<su-parte>.ts` (en el mismo PR que la funcionalidad, #213), usan `upsert` con los IDs fijos de `web/prisma/seed/ids.ts` y al terminar solo imprimen recuentos, nunca contraseñas ni datos de salud. Antes de tocar el seed, lee las reglas de idempotencia y rangos en la cabecera de `web/prisma/seed.ts` (#226).

## Operaciones destructivas

- `prisma migrate reset`, `db push --force-reset`, `DROP`, `TRUNCATE` y borrar volúmenes de Docker requieren explicar la pérdida de datos y confirmación explícita.

## Autorización

- La matriz de permisos es la fuente de verdad (issue #2; espejo de roles por club en `web/src/lib/permissions/org-roles.ts`). No duplicarla en otros documentos; si el código necesita un permiso que no está en la matriz, preguntar.
- Toda acción que lea o modifique datos comprueba permisos en el servidor, y las sensibles comprueban usuario y rol vigente en la base de datos. No basta el rol del JWT ni el proxy.ts (antes middleware).

## Veracidad

- No decir que algo está probado sin ejecutar el comando y mostrar su resultado real.

## Commits

Commit solo como el usuario: sin líneas `Co-Authored-By` ni firmas de Claude, ChatGPT/Codex, Gemini ni ninguna otra IA, y sin "Generated with Claude Code" ni equivalentes en commits ni PRs.

## Alcance de la entrega

- Lo que tiene que funcionar son los flujos de demo de #238. Antes de añadir tests, arreglos o hallazgos de revisión, comprobar que tocan uno de esos flujos, un requisito del subject, la seguridad o una pérdida de datos en un uso normal.
- Las acciones simultáneas sobre lo mismo dentro de un flujo de demo (doble clic, dos Managers que deciden la misma solicitud) se protegen con las cuatro reglas de #238: botón desactivado mientras se envía, índice único con 409, update condicional de estado y comprobación del estado del padre en la misma transacción.
- Las carreras entre sucesos independientes que coinciden en el mismo instante no llevan tests ni arreglos: se documentan con un comentario `Known limit` y se sigue.
- No proponer funcionalidades fuera de los módulos del README.

