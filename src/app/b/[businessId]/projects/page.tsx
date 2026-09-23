import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listProjects } from "@/modules/projects/project-service";
import { ProjectTable } from "@/modules/projects/project-table";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "projects");
  const projects = listProjects(businessId, user.id);

  return (
    <div className="page-container">
      <PageHeader
        title="Projects"
        description="Operational links and ledger-backed profitability without project-management overhead."
      >
        <Button asChild>
          <Link href={`/b/${businessId}/projects/new`}>
            <Plus className="size-4" /> New Project
          </Link>
        </Button>
      </PageHeader>
      
      {projects.length ? (
        <ProjectTable businessId={businessId} currency={access.business.currency} projects={projects} />
      ) : (
        <EmptyState
          icon={<FolderKanban className="mx-auto mb-3 size-7 text-muted-foreground" />}
          title="No projects yet"
          description="Create a project to connect customer, sales, purchase, and accounting activity."
          action={
            <Button asChild>
              <Link href={`/b/${businessId}/projects/new`}>
                <Plus className="size-4" /> New Project
              </Link>
            </Button>
          }
        />
      )}
    </div>
  );
}