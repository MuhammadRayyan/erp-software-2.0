import Link from "next/link";

export type LinkedProject = { id: string; code: string; name: string };

export function ProjectLinks({ businessId, projects, empty = "Not linked" }: { businessId: string; projects: LinkedProject[]; empty?: string }) {
  const unique = Array.from(new Map(projects.map((project) => [project.id, project])).values());
  if (!unique.length) return <span className="text-muted-foreground">{empty}</span>;
  return <span className="inline-flex flex-wrap gap-x-2 gap-y-1">{unique.map((project) => <Link key={project.id} href={`/b/${businessId}/projects/${project.id}`} className="tabular font-medium text-primary hover:underline" title={project.name}>{project.code}</Link>)}</span>;
}
