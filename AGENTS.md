## Agent skills

### Issue tracker

Issues live in GitHub. Use `gh issue` CLI or the GitHub web interface. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Skill obligatoria

Usar siempre la skill 42-slow-mode al escribir, editar o revisar código y configuración (Docker, Prisma, NGINX).

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

## Operaciones destructivas

- `prisma migrate reset`, `db push --force-reset`, `DROP`, `TRUNCATE` y borrar volúmenes de Docker requieren explicar la pérdida de datos y confirmación explícita.

## Autorización

- La matriz de permisos es la fuente de verdad (referenciada en GitHub issues o documentación). No duplicarla en otros documentos; si el código necesita un permiso que no está en la matriz, preguntar.
- Toda acción que lea o modifique datos comprueba permisos en el servidor, y las sensibles comprueban usuario y rol vigente en la base de datos. No basta el rol del JWT ni el proxy.ts (antes middleware).

## Veracidad

- No decir que algo está probado sin ejecutar el comando y mostrar su resultado real.

## Commits

Commit solo como el usuario: sin líneas `Co-Authored-By` ni firmas de Claude, ChatGPT/Codex, Gemini ni ninguna otra IA, y sin "Generated with Claude Code" ni equivalentes en commits ni PRs.
