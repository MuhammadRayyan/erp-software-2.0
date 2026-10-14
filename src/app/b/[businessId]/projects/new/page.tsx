import { requireModule } from "@/core/permissions/require-module";
import { listCustomers } from "@/modules/customers/customer-service";
import { ProjectForm } from "@/modules/projects/project-form";
import { BackLink } from "@/components/back-link";

export default async function NewProjectPage({ params, searchParams }: { params: Promise<{ businessId: string }>; searchParams: Promise<{ customerId?: string }> }) {
  const { businessId } = await params;
  const query = await searchParams;
  const { user } = await requireModule(businessId, "projects");
  const customers = listCustomers(businessId, user.id);
  const customerId = customers.some((customer) => customer.id === query.customerId) ? query.customerId! : "";
  return <div className="page-container"><BackLink href={`/b/${businessId}/projects`}>Projects</BackLink><div className="mb-7"><h1 className="page-title">New Project</h1><p className="page-description">Create the operational record; documents and posted P&amp;L lines provide the actuals.</p></div><ProjectForm businessId={businessId} customers={customers.map(({ id, name }) => ({ id, name }))} initial={{ code: "", name: "", customerId, status: "active", description: "", startDate: "", targetEndDate: "", actualEndDate: "", budgetRevenue: "", budgetCost: "", managerName: "" }} /></div>;
}
