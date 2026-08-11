import Link from "next/link";
import { FolderKanban, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listProjects } from "@/modules/projects/project-service";
import { ProjectTable } from "@/modules/projects/project-table";

export const metadata = { title: "Projects" };

export default async function ProjectsPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params;
  const { user, access } = await requireModule(businessId, "projects");
  const projects = listProjects(businessId, user.id);
  return <div className="page-container">
    <div className="page-header"><div><h1 className="page-title">Projects</h1><p className="page-description">Operational links and ledger-backed profitability without project-management overhead.</p></div><Button asChild><Link href={`/b/${businessId}/projects/new`}><Plus className="size-4" /> New Project</Link></Button></div>
    {projects.length ? <ProjectTable businessId={businessId} currency={access.business.currency} projects={projects} /> : <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><FolderKanban className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-semibold">No projects yet</h2><p className="mt-1 text-sm text-muted-foreground">Create a project to connect customer, sales, purchase, and accounting activity.</p><Button asChild className="mt-4"><Link href={`/b/${businessId}/projects/new`}><Plus className="size-4" /> New Project</Link></Button></div>}
  </div>;
}
