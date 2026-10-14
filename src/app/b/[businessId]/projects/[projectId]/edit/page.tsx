import { notFound } from "next/navigation";
import { requireModule } from "@/core/permissions/require-module";
import { listCustomers } from "@/modules/customers/customer-service";
import { ProjectForm } from "@/modules/projects/project-form";
import { getProject, projectToInput } from "@/modules/projects/project-service";
import { BackLink } from "@/components/back-link";

export default async function EditProjectPage({ params }: { params: Promise<{ businessId: string; projectId: string }> }) {
  const { businessId, projectId } = await params;
  const { user } = await requireModule(businessId, "projects");
  const project = getProject(businessId, user.id, projectId);
  if (!project) notFound();
  const customers = listCustomers(businessId, user.id);
  return <div className="page-container"><BackLink href={`/b/${businessId}/projects/${projectId}`}>{project.code}</BackLink><div className="mb-7"><h1 className="page-title">Edit Project</h1><p className="page-description">Update the project record without altering its derived accounting actuals.</p></div><ProjectForm businessId={businessId} projectId={projectId} customers={customers.map(({ id, name }) => ({ id, name }))} initial={projectToInput(project)} /></div>;
}
