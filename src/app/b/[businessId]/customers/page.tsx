import Link from "next/link";
import { ContactRound, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { requireModule } from "@/core/permissions/require-module";
import { listCustomers } from "@/modules/customers/customer-service";
import { CustomerTable } from "@/modules/customers/customer-table";

export const metadata = { title: "Customers" };

export default async function CustomersPage({ params }: { params: Promise<{ businessId: string }> }) {
  const { businessId } = await params; const { user } = await requireModule(businessId, "sales"); const customers = listCustomers(businessId, user.id);
  return <div className="page-container"><div className="page-header"><div><h1 className="page-title">Customers</h1><p className="page-description">Contacts stored only in this business database.</p></div><Button asChild><Link href={`/b/${businessId}/customers/new`}><Plus className="size-4" /> New Customer</Link></Button></div>{customers.length ? <CustomerTable businessId={businessId} customers={customers} /> : <div className="rounded-lg border border-dashed border-border-strong bg-surface py-12 text-center"><ContactRound className="mx-auto mb-3 size-7 text-muted-foreground" /><h2 className="font-semibold">No customers yet</h2><p className="mt-1 text-sm text-muted-foreground">Create your first customer to start billing.</p><Button asChild className="mt-4"><Link href={`/b/${businessId}/customers/new`}><Plus className="size-4" /> New Customer</Link></Button></div>}</div>;
}
