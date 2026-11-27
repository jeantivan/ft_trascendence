import { describe, expect, it } from "vitest";
import {
  inferInitialAutoField,
  recomputeSessionMetrics,
  type SessionMetricsState,
} from "@/components/training/auto-metrics";

const EMPTY_STATE: SessionMetricsState = {
  distanceKm: "",
  pace: "",
  duration: "",
  autoField: null,
};

describe("recomputeSessionMetrics", () => {
  it("calcula duración automáticamente cuando se rellenan distancia y ritmo", () => {
    const step1 = recomputeSessionMetrics(EMPTY_STATE, "distanceKm", "10");
    expect(step1).toEqual({
      distanceKm: "10",
      pace: "",
      duration: "",
      autoField: null,
    });

    const step2 = recomputeSessionMetrics(step1, "pace", "4:30");
    expect(step2).toEqual({
      distanceKm: "10",
      pace: "4:30",
      duration: "45:00",
      autoField: "duration",
    });
  });

  it("recalcula el campo automático si cambia otro campo mientras sigue marcado como automático", () => {
    const initial: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:30",
      duration: "45:00",
      autoField: "duration",
    };

    const updated = recomputeSessionMetrics(initial, "pace", "5:00");
    expect(updated).toEqual({
      distanceKm: "10",
      pace: "5:00",
      duration: "50:00",
      autoField: "duration",
    });
  });

  it("calcula ritmo automáticamente cuando se rellenan distancia y duración", () => {
    const step1 = recomputeSessionMetrics(EMPTY_STATE, "distanceKm", "10");
    const step2 = recomputeSessionMetrics(step1, "duration", "45:00");

    expect(step2).toEqual({
      distanceKm: "10",
      pace: "4:30",
      duration: "45:00",
      autoField: "pace",
    });
  });

  it("calcula distancia automáticamente cuando se rellenan duración y ritmo", () => {
    const step1 = recomputeSessionMetrics(EMPTY_STATE, "duration", "47:15");
    const step2 = recomputeSessionMetrics(step1, "pace", "4:30");

    expect(step2).toEqual({
      distanceKm: "10.5",
      pace: "4:30",
      duration: "47:15",
      autoField: "distanceKm",
    });
  });

  it("recalcula el campo emparejado cuando los tres campos tienen valor", () => {
    const loadedSession: SessionMetricsState = {
      distanceKm: "10",
      pace: "6:00",
      duration: "1:00:00",
      autoField: "duration",
    };

    // Editar duración mantiene la distancia y recalcula el ritmo
    const editedDuration = recomputeSessionMetrics(loadedSession, "duration", "2:00:00");
    expect(editedDuration).toEqual({
      distanceKm: "10",
      pace: "12:00",
      duration: "2:00:00",
      autoField: "pace",
    });

    // Desde ahí, editar distancia sigue manteniendo pace como autoField
    const editedDistance = recomputeSessionMetrics(editedDuration, "distanceKm", "20");
    expect(editedDistance).toEqual({
      distanceKm: "20",
      pace: "6:00",
      duration: "2:00:00",
      autoField: "pace",
    });

    // Editar ritmo (cuando es autoField o con autoField null) recalcula duración
    const editedPace = recomputeSessionMetrics(editedDistance, "pace", "5:00");
    expect(editedPace).toEqual({
      distanceKm: "20",
      pace: "5:00",
      duration: "01:40:00",
      autoField: "duration",
    });

    const manualAll: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:30",
      duration: "40:00",
      autoField: null,
    };
    expect(recomputeSessionMetrics(manualAll, "pace", "5:00")).toEqual({
      distanceKm: "10",
      pace: "5:00",
      duration: "50:00",
      autoField: "duration",
    });
  });

  it("permite vaciar un campo con los tres rellenos sin volver a rellenarlo al instante", () => {
    const autoDuration: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:30",
      duration: "45:00",
      autoField: "duration",
    };

    const cleared = recomputeSessionMetrics(autoDuration, "duration", "");
    expect(cleared).toEqual({
      distanceKm: "10",
      pace: "4:30",
      duration: "",
      autoField: null,
    });
  });

  it("ignora entradas parciales o inválidas sin romper el estado ni sobrescribir", () => {
    const step1: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:",
      duration: "",
      autoField: null,
    };

    const stillPartial = recomputeSessionMetrics(step1, "pace", "4:");
    expect(stillPartial).toEqual({
      distanceKm: "10",
      pace: "4:",
      duration: "",
      autoField: null,
    });
  });

  it("limpia el campo automático anterior si se borra uno de los campos de entrada", () => {
    const autoDuration: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:30",
      duration: "45:00",
      autoField: "duration",
    };

    const cleared = recomputeSessionMetrics(autoDuration, "pace", "");
    expect(cleared).toEqual({
      distanceKm: "10",
      pace: "",
      duration: "",
      autoField: null,
    });
  });

  it("limpia un campo automático obsoleto si el recálculo se sale de rango, sin tocar valores manuales", () => {
    const autoDuration: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:30",
      duration: "45:00",
      autoField: "duration",
    };

    const overflowed = recomputeSessionMetrics(autoDuration, "distanceKm", "10000");
    expect(overflowed).toEqual({
      distanceKm: "10000",
      pace: "4:30",
      duration: "",
      autoField: null,
    });

    const manualDuration: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:30",
      duration: "45:00",
      autoField: null,
    };

    const preserved = recomputeSessionMetrics(manualDuration, "distanceKm", "10000");
    expect(preserved).toEqual({
      distanceKm: "10000",
      pace: "4:30",
      duration: "45:00",
      autoField: null,
    });
  });
});

describe("inferInitialAutoField", () => {
  it("marca duration cuando las tres métricas cuadran de forma exacta", () => {
    expect(inferInitialAutoField(10000, 300, 3000)).toBe("duration");
  });

  it("marca duration cuando el ritmo guardado tiene redondeo respecto a distancia y duración", () => {
    // 10 km en 47:23 (2843 s) -> ritmo promedio 284 s/km (4:44)
    expect(inferInitialAutoField(10000, 284, 2843)).toBe("duration");
  });

  it("devuelve null cuando falta alguna métrica o no son coherentes entre sí", () => {
    expect(inferInitialAutoField(10000, 300, null)).toBeNull();
    expect(inferInitialAutoField(10000, 300, undefined)).toBeNull();
    expect(inferInitialAutoField(10000, 300, 2400)).toBeNull();
  });
});
