# Prototipo: registro de sesión y dashboard

Type: prototype
Status: resolved
Assignee: mvigara- (con jtivan-r en el registro de sesión)

## Question

¿Cómo se ve y se comporta lo que hace el Athlete al terminar una Session (Completion, RPE, distancia y tiempo opcionales) y el dashboard resultante (frecuencia, volumen semanal, RPE a lo largo del tiempo, Volume Alert)? Hacer un prototipo barato para reaccionar sobre él y decidir qué gráficas entran. Enlazar el prototipo como asset.

## Answer

Prototipo validado y disponible como asset en [.scratch/running-club-spec/prototype-session-dashboard.html](../prototype-session-dashboard.html).

### 1. Flujo de registro de sesión

- **Sesiones prescritas y Events pendientes**:
  - Se accede directamente desde la tarjeta de la sesión en el dashboard o calendario ("Registrar").
  - Formulario pre-cargado con el tipo de sesión (`session_type`) y los objetivos fijados por el Manager (`target_distance_m`, `target_duration_s`).
- **Free Sessions (Sesiones libres)**:
  - Botón visible `+ Registrar sesión libre`.
  - Permite elegir libremente el `Session Type` (*rodaje*, *intervalos*, *cuestas*, *tirada_larga*, *fartlek*).
- **Manejo de resultados y sesiones incompletas**:
  - **Completada** (`completed: true`): registra RPE (1-10) y distancia/duración reales opcionales.
  - **Interrumpida** (`completed: false`): permite guardar distancia y duración parciales realizadas antes de parar, RPE de lo realizado y motivo en `extra` (JSONB) (`molestia_lesion`, `fatiga`, `falta_tiempo`, `clima`).
  - **No realizada** (`completed: false`): limpia la sesión de pendientes sin registrar métricas de volumen, guardando el motivo en `extra`. El Manager puede ver estos registros para evaluar adherencia y fatiga.
- **Selector de RPE**:
  - Escala numérica del 1 al 10 vinculada a descriptores de esfuerzo (escala Borg adaptada):
    1 (Regenerativo), 2 (Fácil), 3 (Cómodo), 4 (Moderado), 5 (Algo exigente), 6 (Retador), 7 (Duro), 8 (Muy duro), 9 (Casi máximo), 10 (Esfuerzo máximo).
  - Incluye guía pedagógica de sensaciones físicas y capacidad de conversación.

### 2. Dashboard del Athlete

- **KPIs principales (Semana actual)**:
  - *Volumen semanal*: kilómetros totales y variación porcentual frente a la semana anterior.
  - *Frecuencia semanal*: número de sesiones completadas e interrumpidas.
  - *RPE medio semanal*: esfuerzo medio ponderado y descriptor cualitativo correspondiente.
  - *Cumplimiento*: porcentaje de sesiones planificadas registradas.
- **Volume Alert**:
  - Banner informativo destacado cuando el volumen semanal sube más de un 10% respecto a la semana previa.
  - Mensaje pedagógico que alerta sobre el riesgo de sobrecarga y notifica que el Manager ha recibido el aviso.
- **Gráfica de evolución (Últimas 6 semanas)**:
  - Barras de volumen semanal acumulado (km).
  - Semana en curso destacada con alerta si excede el 10%.
  - Línea/etiqueta de evolución de RPE promedio por semana.

