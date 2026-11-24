import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TrainingWorkspace } from "@/components/training/TrainingWorkspace";
import {
  assignTrainingTemplateAction,
  createTrainingTemplateAction,
  deleteTrainingTemplateAction,
  updateTrainingTemplateAction,
} from "@/lib/training/actions";

const push = vi.hoisted(() => vi.fn());
const refresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh }),
}));
vi.mock("@/lib/training/actions", () => ({
  createTrainingTemplateAction: vi.fn(),
  updateTrainingTemplateAction: vi.fn(),
  deleteTrainingTemplateAction: vi.fn(),
  assignTrainingTemplateAction: vi.fn(),
}));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function close() {
    this.removeAttribute("open");
  };
});

const CLUB_A = { id: "11111111-1111-4111-8111-111111111111", name: "Madrid Runners" };
const CLUB_B = { id: "22222222-2222-4222-8222-222222222222", name: "Retiro Trail" };

const SAMPLE_TEMPLATE = {
  id: "tpl-1",
  orgId: CLUB_A.id,
  name: "Preparación 10K",
  createdBy: "manager-1",
  sessions: [
    {
      sessionType: "rodaje" as const,
      dayOffset: 0,
      position: 0,
      targetDistanceM: 10000,
      targetPaceSPerKm: 265,
      targetDurationS: 2650,
    },
  ],
};

const DEFAULT_START_DATE = "2026-11-24";

const SAMPLE_GROUPS = [
  { id: "grp-1", name: "Grupo Avanzado", level: "Avanzado", objective: "10K" },
  { id: "grp-2", name: "Grupo Base", level: "Iniciación", objective: "Rodaje" },
];

describe("TrainingWorkspace", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("navega a /training?orgId=... al cambiar el club activo", () => {
    render(
      <TrainingWorkspace
        clubs={[CLUB_A, CLUB_B]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.change(screen.getByLabelText(/club activo/i), {
      target: { value: CLUB_B.id },
    });

    expect(push).toHaveBeenCalledWith(`/training?orgId=${CLUB_B.id}`);
  });

  it("muestra controles de Manager y permite crear una plantilla añadiendo y reordenando sesiones", async () => {
    vi.mocked(createTrainingTemplateAction).mockResolvedValue({
      success: true,
      data: SAMPLE_TEMPLATE,
    });

    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    expect(screen.getByRole("button", { name: /asignar a grupo/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^editar$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^eliminar$/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /nueva plantilla/i }));

    const dialog = screen.getByRole("dialog", { name: /nueva plantilla/i });
    fireEvent.change(within(dialog).getByLabelText(/nombre de la plantilla/i), {
      target: { value: "Velocidad 10K" },
    });

    const row1 = within(dialog).getByRole("group", { name: "Sesión 1" });
    fireEvent.change(within(row1).getByLabelText(/distancia/i), { target: { value: "8.5" } });
    fireEvent.change(within(row1).getByLabelText(/ritmo/i), { target: { value: "4:30" } });
    fireEvent.change(within(row1).getByLabelText(/duración/i), { target: { value: "38" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /añadir sesión/i }));

    const row2 = within(dialog).getByRole("group", { name: "Sesión 2" });
    fireEvent.change(within(row2).getByLabelText(/tipo de sesión/i), {
      target: { value: "intervalos" },
    });
    fireEvent.change(within(row2).getByLabelText(/día/i), { target: { value: "2" } });

    // Reordenamos Sesión 2 hacia arriba para que pase a position 0
    fireEvent.click(within(row2).getByRole("button", { name: /subir/i }));

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /guardar plantilla/i }));
    });

    expect(createTrainingTemplateAction).toHaveBeenCalledWith(CLUB_A.id, {
      name: "Velocidad 10K",
      sessions: [
        {
          sessionType: "intervalos",
          dayOffset: 2,
          targetDistanceM: null,
          targetPaceSPerKm: null,
          targetDurationS: null,
        },
        {
          sessionType: "rodaje",
          dayOffset: 0,
          targetDistanceM: 8500,
          targetPaceSPerKm: 270,
          targetDurationS: 2280,
        },
      ],
    });
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("permite editar una plantilla existente precargando sus datos", async () => {
    vi.mocked(updateTrainingTemplateAction).mockResolvedValue({
      success: true,
      data: { ...SAMPLE_TEMPLATE, name: "Preparación 10K Editada" },
    });

    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^editar$/i }));

    const dialog = screen.getByRole("dialog", { name: /editar plantilla/i });
    const nameInput = within(dialog).getByLabelText(/nombre de la plantilla/i);
    expect(nameInput).toHaveValue("Preparación 10K");

    const row1 = within(dialog).getByRole("group", { name: "Sesión 1" });
    expect(within(row1).getByLabelText(/distancia/i)).toHaveValue("10");
    expect(within(row1).getByLabelText(/ritmo/i)).toHaveValue("4:25");

    fireEvent.change(nameInput, { target: { value: "Preparación 10K Editada" } });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /guardar plantilla/i }));
    });

    expect(updateTrainingTemplateAction).toHaveBeenCalledWith(
      CLUB_A.id,
      SAMPLE_TEMPLATE.id,
      {
        name: "Preparación 10K Editada",
        sessions: [
          {
            sessionType: "rodaje",
            dayOffset: 0,
            targetDistanceM: 10000,
            targetPaceSPerKm: 265,
            targetDurationS: 2650,
          },
        ],
      },
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("pide confirmación antes de eliminar una plantilla y ejecuta deleteTrainingTemplateAction", async () => {
    vi.mocked(deleteTrainingTemplateAction).mockResolvedValue({
      success: true,
      data: undefined,
    });

    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    expect(deleteTrainingTemplateAction).not.toHaveBeenCalled();

    const dialog = screen.getByRole("dialog", { name: /eliminar plantilla/i });
    expect(dialog).toHaveTextContent("Preparación 10K");

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /confirmar eliminación/i }));
    });

    expect(deleteTrainingTemplateAction).toHaveBeenCalledWith(
      CLUB_A.id,
      SAMPLE_TEMPLATE.id,
    );
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("permite asignar una plantilla a un grupo y fecha de inicio", async () => {
    vi.mocked(assignTrainingTemplateAction).mockResolvedValue({
      success: true,
      data: [],
    });

    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /asignar a grupo/i }));

    const dialog = screen.getByRole("dialog", { name: /asignar plantilla/i });
    const startDateInput = within(dialog).getByLabelText(/fecha de inicio/i);
    expect(startDateInput).toHaveValue(DEFAULT_START_DATE);

    fireEvent.change(within(dialog).getByLabelText(/grupo del club/i), {
      target: { value: "grp-2" },
    });
    fireEvent.change(startDateInput, {
      target: { value: "2026-12-01" },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /confirmar asignación/i }));
    });

    expect(assignTrainingTemplateAction).toHaveBeenCalledWith(CLUB_A.id, {
      templateId: SAMPLE_TEMPLATE.id,
      groupId: "grp-2",
      startDate: "2026-12-01",
    });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(
      /Preparación 10K.*Grupo Base.*2026-12-01/,
    );
  });

  it("muestra EmptyState adecuado sin plantillas para Manager y para Atleta", () => {
    const { rerender } = render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /aún no hay plantillas en este club/i }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /nueva plantilla/i }).length).toBeGreaterThan(0);

    rerender(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="athlete"
        templates={[]}
        groups={[]}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    expect(
      screen.getByRole("heading", { name: /tus grupos aún no tienen plantillas asignadas/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /nueva plantilla/i })).toBeNull();
  });

  it("muestra aviso en AssignTemplateModal cuando el club no tiene grupos", () => {
    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={[]}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /asignar a grupo/i }));

    const dialog = screen.getByRole("dialog", { name: /asignar plantilla/i });
    expect(within(dialog).getByRole("status")).toHaveTextContent(/no hay grupos/i);
    expect(within(dialog).queryByRole("button", { name: /confirmar asignación/i })).toBeNull();
  });

  it("permite eliminar una sesión añadida dentro del formulario de plantilla", async () => {
    vi.mocked(createTrainingTemplateAction).mockResolvedValue({
      success: true,
      data: SAMPLE_TEMPLATE,
    });

    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /nueva plantilla/i }));
    const dialog = screen.getByRole("dialog", { name: /nueva plantilla/i });

    const row1 = within(dialog).getByRole("group", { name: "Sesión 1" });
    expect(within(row1).getByRole("button", { name: /eliminar sesión/i })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: /añadir sesión/i }));
    const row2 = within(dialog).getByRole("group", { name: "Sesión 2" });
    fireEvent.change(within(row2).getByLabelText(/tipo de sesión/i), {
      target: { value: "fartlek" },
    });

    fireEvent.click(within(row1).getByRole("button", { name: /eliminar sesión/i }));
    expect(within(dialog).queryByRole("group", { name: "Sesión 2" })).toBeNull();

    fireEvent.change(within(dialog).getByLabelText(/nombre de la plantilla/i), {
      target: { value: "Solo Fartlek" },
    });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /guardar plantilla/i }));
    });

    expect(createTrainingTemplateAction).toHaveBeenCalledWith(CLUB_A.id, {
      name: "Solo Fartlek",
      sessions: [
        {
          sessionType: "fartlek",
          dayOffset: 0,
          targetDistanceM: null,
          targetPaceSPerKm: null,
          targetDurationS: null,
        },
      ],
    });
  });

  it("autocompleta la tercera métrica en el formulario al rellenar dos campos", () => {
    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /nueva plantilla/i }));
    const dialog = screen.getByRole("dialog", { name: /nueva plantilla/i });
    const row1 = within(dialog).getByRole("group", { name: "Sesión 1" });

    const distanceInput = within(row1).getByLabelText(/distancia/i) as HTMLInputElement;
    const paceInput = within(row1).getByLabelText(/ritmo/i) as HTMLInputElement;
    const durationInput = within(row1).getByLabelText(/duración/i) as HTMLInputElement;

    fireEvent.change(distanceInput, { target: { value: "10" } });
    fireEvent.change(paceInput, { target: { value: "4:30" } });
    expect(durationInput.value).toBe("45:00");

    // Si cambia el ritmo, recalcula duración; si edita duración manualmente, ya no se pisa.
    fireEvent.change(paceInput, { target: { value: "5:00" } });
    expect(durationInput.value).toBe("50:00");

    fireEvent.change(durationInput, { target: { value: "48:00" } });
    fireEvent.change(paceInput, { target: { value: "4:30" } });
    expect(durationInput.value).toBe("48:00");
  });

  it("deshabilita el envío y evita doble llamada mientras una asignación está en curso (#238)", async () => {
    let resolveAssign: ((value: { success: true; data: never[] }) => void) | undefined;
    vi.mocked(assignTrainingTemplateAction).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveAssign = resolve;
        }),
    );

    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /asignar a grupo/i }));
    const dialog = screen.getByRole("dialog", { name: /asignar plantilla/i });
    const submitButton = within(dialog).getByRole("button", { name: /confirmar asignación/i });

    await act(async () => {
      fireEvent.click(submitButton);
    });

    expect(within(dialog).getByRole("button", { name: /asignando/i })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: /cancelar/i })).toBeDisabled();

    // Intentar cerrar o reenviar mientras está pendiente no debe duplicar ni cerrar el modal
    fireEvent.click(within(dialog).getByRole("button", { name: /^cerrar$/i }));
    fireEvent.submit(dialog.querySelector("form")!);
    expect(assignTrainingTemplateAction).toHaveBeenCalledTimes(1);
    expect(dialog).toHaveAttribute("open");

    await act(async () => {
      resolveAssign?.({ success: true, data: [] });
    });

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("muestra el error del servidor sin cerrar el modal cuando una acción devuelve success: false", async () => {
    vi.mocked(assignTrainingTemplateAction).mockResolvedValue({
      success: false,
      error: "Esta plantilla ya estaba asignada a este grupo en esa fecha",
    });

    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /asignar a grupo/i }));
    const dialog = screen.getByRole("dialog", { name: /asignar plantilla/i });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /confirmar asignación/i }));
    });

    expect(within(dialog).getByRole("alert")).toHaveTextContent(/ya estaba asignada/i);
    expect(dialog).toHaveAttribute("open");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("captura rechazos de Server Actions (404/red) y muestra alerta en el modal", async () => {
    const notFoundError = Object.assign(new Error("NEXT_HTTP_ERROR_FALLBACK;404"), {
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    vi.mocked(deleteTrainingTemplateAction).mockRejectedValue(notFoundError);

    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /^eliminar$/i }));
    const dialog = screen.getByRole("dialog", { name: /eliminar plantilla/i });

    await act(async () => {
      fireEvent.click(within(dialog).getByRole("button", { name: /confirmar eliminación/i }));
    });

    expect(within(dialog).getByRole("alert")).toHaveTextContent(/ya no existe/i);
    expect(dialog).toHaveAttribute("open");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("valida nombre, día y métricas en cliente antes de llamar a createTrainingTemplateAction", async () => {
    render(
      <TrainingWorkspace
        clubs={[CLUB_A]}
        activeClub={CLUB_A}
        role="manager"
        templates={[SAMPLE_TEMPLATE]}
        groups={SAMPLE_GROUPS}
        defaultStartDate={DEFAULT_START_DATE}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /nueva plantilla/i }));
    const dialog = screen.getByRole("dialog", { name: /nueva plantilla/i });
    const nameInput = within(dialog).getByLabelText(/nombre de la plantilla/i);
    const row1 = within(dialog).getByRole("group", { name: "Sesión 1" });

    // Nombre con solo espacios
    fireEvent.change(nameInput, { target: { value: "   " } });
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/nombre.*obligatorio/i);
    expect(createTrainingTemplateAction).not.toHaveBeenCalled();

    // Ritmo con formato inválido
    fireEvent.change(nameInput, { target: { value: "Plan Test" } });
    fireEvent.change(within(row1).getByLabelText(/ritmo/i), { target: { value: "abc" } });
    await act(async () => {
      fireEvent.submit(dialog.querySelector("form")!);
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent(/ritmo inválido/i);
    expect(createTrainingTemplateAction).not.toHaveBeenCalled();
  });
});
