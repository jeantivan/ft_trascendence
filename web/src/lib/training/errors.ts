export class TrainingNotFoundError extends Error {
  constructor(message = "Plantilla o recurso no encontrado") {
    super(message);
    this.name = "TrainingNotFoundError";
  }
}

export class TrainingForbiddenError extends Error {
  constructor(message = "No tienes permiso para realizar esta acción") {
    super(message);
    this.name = "TrainingForbiddenError";
  }
}

export class TrainingValidationError extends Error {
  constructor(message = "Datos de entrenamiento inválidos") {
    super(message);
    this.name = "TrainingValidationError";
  }
}

export class TrainingConflictError extends Error {
  constructor(
    message = "Esta plantilla ya está asignada a este grupo para esa fecha"
  ) {
    super(message);
    this.name = "TrainingConflictError";
  }
}
