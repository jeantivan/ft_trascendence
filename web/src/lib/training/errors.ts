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

export type TemplateSessionErrorField =
  | "dayOffset"
  | "distanceKm"
  | "pace"
  | "duration"
  | "metrics";

export type TemplateSessionFieldErrors = Partial<
  Record<TemplateSessionErrorField, string>
>;

export type TemplateValidationFieldErrors = {
  name?: string;
  sessions?: Record<number, TemplateSessionFieldErrors>;
};

export class TrainingValidationError extends Error {
  readonly fieldErrors?: TemplateValidationFieldErrors;

  constructor(
    message = "Datos de entrenamiento inválidos",
    fieldErrors?: TemplateValidationFieldErrors,
  ) {
    super(message);
    this.name = "TrainingValidationError";
    this.fieldErrors = fieldErrors;
  }
}

export const SESSION_ALREADY_LOGGED = "SESSION_ALREADY_LOGGED" as const;
export const CUSTOMIZED_SESSION_ALREADY_EXISTS =
  "CUSTOMIZED_SESSION_ALREADY_EXISTS" as const;

export type TrainingConflictCode =
  | typeof SESSION_ALREADY_LOGGED
  | typeof CUSTOMIZED_SESSION_ALREADY_EXISTS;

export class TrainingConflictError extends Error {
  readonly code?: TrainingConflictCode;

  constructor(
    message = "Esta plantilla ya está asignada a este grupo para esa fecha",
    code?: TrainingConflictCode
  ) {
    super(message);
    this.name = "TrainingConflictError";
    this.code = code;
  }
}
