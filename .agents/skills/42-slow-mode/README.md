# 42 Slow Mode

Skill para trabajar en este proyecto (TypeScript / Node / React) **paso a paso y entendiendo todo**. Pensada para quien viene de C/C++ y es nueva en este stack.

El agente pasa de "generador de código" a **tutor**: explica antes y después de cada cambio, compara con C/C++ y se detiene después de cada paso.

## Cómo invocarla

Desde la raíz del repo, abre Claude Code:

```bash
cd TRANSCENDENCE-42
claude
```

Y dentro de la sesión, escribe:

```
/42-slow-mode
```

También se activa sola cuando le pides escribir, editar o revisar código del proyecto y se nota que quieres ir despacio. Si no lo hace, invócala a mano.

> La skill está en `.claude/skills/`, así que Claude Code la detecta automáticamente al abrir el repo. No hay que instalar nada.

### Con otros agentes (Codex, Antigravity...)

La carpeta sigue el formato estándar de skill, igual que las de Matt Pocock:

```
42-slow-mode/
├── SKILL.md            # las reglas (las lee Claude Code y otros agentes)
└── agents/
    └── openai.yaml     # metadatos para Codex (nombre visible, invocación)
```

- **Codex**: lee `agents/openai.yaml`. Está con `allow_implicit_invocation: false`, así que solo se activa si la invocas tú.
- **Antigravity y otros**: instala o copia la carpeta donde ese agente busque skills. Comprueba su ruta en su documentación.
- **Agente sin soporte de skills** (por ejemplo Gemini CLI): empieza la sesión con
  `Lee .claude/skills/42-slow-mode/SKILL.md y sigue esas reglas durante toda la sesión.`

Las skills de Matt Pocock (`grill-with-docs`, `to-issues`, `tdd`...) que menciona la guía se pueden instalar también en Codex y Antigravity. Si no las tienes, las reglas de ritmo funcionan igual por separado.

## Cómo funciona

Cada paso sigue este bucle:

1. **Plan (sin código)**: el agente dice qué va a hacer y por qué.
2. **Pausa**: pregunta "¿Seguimos?" y espera tu respuesta.
3. **Código**: un solo paso pequeño (una función, un componente o un archivo; máximo ~30 líneas).
4. **Explicación línea a línea**: qué es cada concepto nuevo, por qué existe y su equivalente en C/C++.
5. **Comprobación**: una pregunta corta para ver si lo has entendido.
6. **Verificar**: el comando exacto para probarlo y el resultado esperado.

Reglas importantes:

- No encadena pasos sin pausa, ni siquiera en auto-mode.
- No hace commit, push ni instala dependencias sin pedirlo y explicarlo.
- Trabaja **un ticket de `.scratch/` a la vez** y no pasa al siguiente sin tu confirmación.
- Responde en español y deja en inglés los nombres técnicos (`useState`, `Promise`, `interface`).

## Con qué se combina

Es una capa de **ritmo y explicación**, no un flujo propio. Se usa junto con `grill-with-docs`, `to-prd`, `to-issues`, `triage`, `tdd`, `prototype`, `diagnose` y `/wayfinder`. Ellas deciden el qué y el orden; esta decide el ritmo. Los artefactos (`CONTEXT.md`, `docs/adr/`, `.scratch/`) mantienen su formato.

## Cuando necesites profundizar

La skill va paso a paso y no se detiene mucho en la teoría. **Si un concepto necesita más explicación, no alargues la sesión de trabajo:** amplíalo fuera.

- En **otra terminal** con otra sesión de Claude (o con la skill `42-tutor`).
- En la **web** (claude.ai, MDN, documentación oficial de TypeScript / React / Node).
- Donde prefieras revisarlo: apuntes, un compañero, etc.

Vuelve a la sesión cuando lo tengas claro y sigue con el siguiente paso. Mantener la sesión de slow mode centrada en el código hace que el hilo no se pierda.

## Consejos

- Si algo no lo entiendes, dilo: "no entendí X". No contestes "sí" a "¿Seguimos?" por inercia.
- Si pides "hazlo todo del tirón", la skill te ofrecerá agrupar 2-3 pasos pequeños, con explicación al final de cada uno.
- Al terminar la sesión te resume lo construido y los conceptos nuevos, y te pregunta si quieres repasar alguno.
