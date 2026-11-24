import { TrainingWorkspace } from "@/components/training/TrainingWorkspace";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { getTrainingPageData } from "@/lib/training/queries";

interface TrainingPageProps {
  searchParams?: Promise<{ orgId?: string | string[] }>;
}

export default async function TrainingPage({ searchParams }: TrainingPageProps) {
  const resolvedParams = searchParams ? await searchParams : undefined;
  const data = await getTrainingPageData(resolvedParams?.orgId);

  if (data.status === "no-club") {
    return (
      <div className="mx-auto flex w-full max-w-content flex-col gap-6">
        <header className="border-b border-border-subtle pb-6">
          <h1 className="font-heading text-headline-lg-mobile md:text-headline-lg text-text-primary">
            Entrenamiento
          </h1>
        </header>
        <EmptyState
          icon="groups"
          title="No perteneces a ningún club activo"
          description="Únete a un club de running para acceder a sus grupos de entrenamiento y plantillas semanales."
          action={
            <Button variant="ghost" href="/club">
              Explorar clubes
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <TrainingWorkspace
      clubs={data.clubs}
      activeClub={data.activeClub}
      role={data.role}
      templates={data.templates}
      groups={data.groups}
    />
  );
}
