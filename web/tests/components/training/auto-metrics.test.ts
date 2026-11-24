import { describe, expect, it } from "vitest";
import {
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

  it("no sobrescribe un tercer campo introducido manualmente ni al editar el campo automático", () => {
    const manualAll: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:30",
      duration: "40:00",
      autoField: null,
    };

    const edited = recomputeSessionMetrics(manualAll, "pace", "5:00");
    expect(edited).toEqual({
      distanceKm: "10",
      pace: "5:00",
      duration: "40:00",
      autoField: null,
    });

    const autoDuration: SessionMetricsState = {
      distanceKm: "10",
      pace: "4:30",
      duration: "45:00",
      autoField: "duration",
    };

    const overrideAuto = recomputeSessionMetrics(autoDuration, "duration", "42:00");
    expect(overrideAuto).toEqual({
      distanceKm: "10",
      pace: "4:30",
      duration: "42:00",
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
