export class TrainingNotFoundError extends Error {
  readonly status = 404;

  constructor(message = "Plantilla o recurso no encontrado") {
    super(message);
    this.name = "TrainingNotFoundError";
  }
}

export class TrainingForbiddenError extends Error {
  readonly status = 403;

  constructor(message = "No tienes permiso para realizar esta acción") {
    super(message);
    this.name = "TrainingForbiddenError";
  }
}

export class TrainingValidationError extends Error {
  readonly status = 400;

  constructor(message = "Datos de entrenamiento inválidos") {
    super(message);
    this.name = "TrainingValidationError";
  }
}
