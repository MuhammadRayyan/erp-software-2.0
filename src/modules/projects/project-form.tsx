"use client";
import { useRouter } from "next/navigation";
import { FormError } from "@/components/form-error";

import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { LoaderCircle } from "lucide-react";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createProjectAction, updateProjectAction } from "./actions";
import { projectInputSchema, type ProjectInput } from "./project-input";
import { DocumentFormFooter } from "@/components/document-form-footer";
import { SelectNative } from "@/components/ui/select-native";
import { requestGuardedNavigation, useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { FieldError } from "@/components/ui/field-error";
import { fieldErrorProps, applyServerFieldErrors, focusFirstInvalidField } from "@/lib/form-errors";

type CustomerOption = { id: string; name: string };

export function ProjectForm({ businessId, projectId, customers, initial }: { businessId: string; projectId?: string; customers: CustomerOption[]; initial: ProjectInput }) {
  const router = useRouter();
  const [serverError, setServerError] = useState("");
  const form = useForm<ProjectInput>({ resolver: zodResolver(projectInputSchema), defaultValues: initial });
  const { register, handleSubmit, setError, formState: { errors, isSubmitting, isDirty, isSubmitSuccessful } } = form;
  useUnsavedChanges(isDirty && !isSubmitSuccessful);
  const cancelHref = projectId ? `/b/${businessId}/projects/${projectId}` : `/b/${businessId}/projects`;

  async function save(values: ProjectInput) {
    setServerError("");
    const result = projectId
      ? await updateProjectAction(businessId, projectId, values)
      : await createProjectAction(businessId, values);
    if (result.fieldErrors) applyServerFieldErrors(setError, result.fieldErrors);
    if (result.error) setServerError(result.error);
  }

  return <form className="space-y-7 max-w-4xl" noValidate onSubmit={handleSubmit(save, focusFirstInvalidField)}>
    {serverError && <FormError message={serverError} />}
    <section className="border-b border-border pb-7">
      <h2 className="text-base font-semibold">Project details</h2>
      <p className="mt-1 text-sm text-muted-foreground">Keep the operational identity concise; accounting actuals are derived from tagged postings.</p>
      <div className="mt-5 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5 lg:col-span-2"><Label htmlFor="name">Project name</Label><Input id="name" autoFocus {...register("name")} {...fieldErrorProps("name", errors.name)} /><FieldError name="name" message={errors.name?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="code">Project code <span className="font-normal text-muted-foreground">(automatic if blank)</span></Label><Input id="code" placeholder="PRJ-00001" className="tabular" {...register("code")} {...fieldErrorProps("code", errors.code)} /><FieldError name="code" message={errors.code?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="customerId">Customer <span className="font-normal text-muted-foreground">(optional)</span></Label><SelectNative id="customerId"  {...register("customerId")} {...fieldErrorProps("customerId", errors.customerId)}><option value="">No customer</option>{customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}</SelectNative><FieldError name="customerId" message={errors.customerId?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="status">Status</Label><SelectNative id="status"  {...register("status")}><option value="draft">Draft</option><option value="active">Active</option><option value="on_hold">On Hold</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></SelectNative></div>
        <div className="space-y-1.5"><Label htmlFor="managerName">Project manager / contact <span className="font-normal text-muted-foreground">(optional)</span></Label><Input id="managerName" {...register("managerName")} /></div>
        <div className="space-y-1.5"><Label htmlFor="startDate">Start date</Label><Input id="startDate" type="date" {...register("startDate")} {...fieldErrorProps("startDate", errors.startDate)} /><FieldError name="startDate" message={errors.startDate?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="targetEndDate">Target end date</Label><Input id="targetEndDate" type="date" {...register("targetEndDate")} {...fieldErrorProps("targetEndDate", errors.targetEndDate)} /><FieldError name="targetEndDate" message={errors.targetEndDate?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="actualEndDate">Actual end date</Label><Input id="actualEndDate" type="date" {...register("actualEndDate")} {...fieldErrorProps("actualEndDate", errors.actualEndDate)} /><FieldError name="actualEndDate" message={errors.actualEndDate?.message} /></div>
      </div>
      <div className="mt-5 space-y-1.5"><Label htmlFor="description">Description <span className="font-normal text-muted-foreground">(optional)</span></Label><Textarea id="description" rows={4} {...register("description")} /></div>
    </section>
    <section className="border-b border-border pb-7">
      <h2 className="text-base font-semibold">Budget</h2>
      <p className="mt-1 text-sm text-muted-foreground">Simple revenue and cost targets only—no budget line items or cost codes.</p>
      <div className="mt-5 grid max-w-2xl gap-5 sm:grid-cols-2">
        <div className="space-y-1.5"><Label htmlFor="budgetRevenue">Revenue budget</Label><Input id="budgetRevenue" inputMode="decimal" placeholder="0.00" className="money text-right" {...register("budgetRevenue")} {...fieldErrorProps("budgetRevenue", errors.budgetRevenue)} /><FieldError name="budgetRevenue" message={errors.budgetRevenue?.message} /></div>
        <div className="space-y-1.5"><Label htmlFor="budgetCost">Cost budget</Label><Input id="budgetCost" inputMode="decimal" placeholder="0.00" className="money text-right" {...register("budgetCost")} {...fieldErrorProps("budgetCost", errors.budgetCost)} /><FieldError name="budgetCost" message={errors.budgetCost?.message} /></div>
      </div>
    </section>
    <DocumentFormFooter onCancel={() => requestGuardedNavigation(cancelHref, () => router.push(cancelHref))}>
      <Button permission={"save"} type="submit" disabled={isSubmitting}>{isSubmitting && <LoaderCircle className="size-4 animate-spin" />}{projectId ? "Save Changes" : "Create Project"}</Button>
    </DocumentFormFooter>
    </form>;
}
