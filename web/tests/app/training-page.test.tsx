import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTrainingPageData } from "@/lib/training/queries";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock("@/lib/training/queries", () => ({
  getTrainingPageData: vi.fn(),
}));
vi.mock("@/lib/training/actions", () => ({
  createTrainingTemplateAction: vi.fn(),
  updateTrainingTemplateAction: vi.fn(),
  deleteTrainingTemplateAction: vi.fn(),
  assignTrainingTemplateAction: vi.fn(),
}));

import TrainingPage from "@/app/(app)/training/page";

const CLUB_1 = { id: "11111111-1111-4111-8111-111111111111", name: "Madrid Runners" };
const CLUB_2 = { id: "22222222-2222-4222-8222-222222222222", name: "Retiro Trail" };

describe("/training page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra estado vacío con enlace a /club cuando el usuario no pertenece a ningún club", async () => {
    vi.mocked(getTrainingPageData).mockResolvedValue({ status: "no-club" });

    render(await TrainingPage({ searchParams: Promise.resolve({}) }));

    expect(getTrainingPageData).toHaveBeenCalledWith(undefined);
    expect(screen.getByRole("heading", { level: 1, name: "Entrenamiento" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ningún club/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /explorar clubes/i })).toHaveAttribute("href", "/club");
  });

  it("muestra la vista de atleta en solo lectura con selector de club cuando pertenece a varios clubes", async () => {
    vi.mocked(getTrainingPageData).mockResolvedValue({
      status: "ready",
      clubs: [CLUB_1, CLUB_2],
      activeClub: CLUB_2,
      role: "athlete",
      templates: [
        {
          id: "tpl-1",
          orgId: CLUB_2.id,
          name: "Base Trail",
          createdBy: "manager-1",
          sessions: [
            {
              sessionType: "cuestas",
              dayOffset: 0,
              position: 0,
              targetDistanceM: 8000,
              targetPaceSPerKm: 280,
              targetDurationS: 2240,
            },
          ],
        },
      ],
      groups: [],
      defaultStartDate: "2026-11-24",
    });

    render(await TrainingPage({ searchParams: Promise.resolve({ orgId: CLUB_2.id }) }));

    expect(getTrainingPageData).toHaveBeenCalledWith(CLUB_2.id);
    expect(screen.getByRole("status")).toHaveTextContent(/140|próxima/i);
    expect(screen.getByLabelText(/club activo/i)).toHaveValue(CLUB_2.id);
    expect(screen.getByText("Base Trail")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nueva plantilla/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /editar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /eliminar/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /asignar a grupo/i })).toBeNull();
  });
});
