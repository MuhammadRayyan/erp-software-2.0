"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePermission } from "@/core/permissions/require-module";
import { deleteProjectAttachment, uploadProjectAttachment } from "./project-attachment-service";
import { projectCustomerInputSchema, projectInputSchema, projectNoteInputSchema } from "./project-input";
import { createProjectNote, deleteProjectNote } from "./project-note-service";
import { addProjectCustomer, createProject, deleteProject, getProject, removeProjectCustomer, updateProject } from "./project-service";

export type ProjectActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export type QuickCreateProjectResult = {
  error?: string;
  fieldErrors?: Record<string, string[]>;
  project?: {
    id: string;
    code: string;
    name: string;
    customerId: string | null;
  };
};

export async function quickCreateProjectAction(
  businessId: string,
  input: { name: string; code?: string; customerId?: string },
): Promise<QuickCreateProjectResult> {
  const { user } = await requirePermission(businessId, "projects", "create");
  const parsed = projectInputSchema.safeParse({
    name: input.name,
    code: input.code ?? "",
    customerId: input.customerId ?? "",
    status: "active",
  });
  if (!parsed.success) {
    return {
      error: "Check the project fields.",
      fieldErrors: z.flattenError(parsed.error).fieldErrors,
    };
  }
  let projectId: string;
  try {
    projectId = createProject(businessId, user.id, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The project could not be created." };
  }
  const created = getProject(businessId, user.id, projectId);
  revalidatePath(`/b/${businessId}/projects`);
  return {
    project: {
      id: projectId,
      code: created?.code ?? parsed.data.code,
      name: parsed.data.name,
      customerId: parsed.data.customerId || null,
    },
  };
}

export async function createProjectAction(businessId: string, input: unknown): Promise<ProjectActionResult> {
  const { user } = await requirePermission(businessId, "projects", "create");
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the project fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let projectId: string;
  try { projectId = createProject(businessId, user.id, parsed.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The project could not be created. Your entries are still here." }; }
  revalidatePath(`/b/${businessId}/projects`);
  revalidatePath(`/b/${businessId}/projects/${projectId}`);
  redirect(`/b/${businessId}/projects/${projectId}?notice=${encodeURIComponent("Project created")}`);
}

export async function updateProjectAction(businessId: string, projectId: string, input: unknown): Promise<ProjectActionResult> {
  const { user } = await requirePermission(businessId, "projects", "edit");
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the project fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try { updateProject(businessId, user.id, projectId, parsed.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The project could not be updated. Your entries are still here." }; }
  revalidatePath(`/b/${businessId}/projects`);
  revalidatePath(`/b/${businessId}/projects/${projectId}`);
  redirect(`/b/${businessId}/projects/${projectId}?notice=${encodeURIComponent("Project updated")}`);
}

export async function deleteProjectAction(businessId: string, projectId: string) {
  const { user } = await requirePermission(businessId, "projects", "delete");
  try {
    deleteProject(businessId, user.id, projectId);
    revalidatePath(`/b/${businessId}/projects`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The project could not be deleted." };
  }
}

export async function addProjectNoteAction(businessId: string, projectId: string, input: unknown): Promise<ProjectActionResult> {
  const { user } = await requirePermission(businessId, "projects", "edit");
  const parsed = projectNoteInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Enter a note." };
  try {
    createProjectNote(businessId, user.id, projectId, parsed.data.body);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The note could not be added." };
  }
  revalidatePath(`/b/${businessId}/projects/${projectId}`);
  return {};
}

export async function deleteProjectNoteAction(businessId: string, projectId: string, noteId: string) {
  const { user } = await requirePermission(businessId, "projects", "delete");
  try {
    deleteProjectNote(businessId, user.id, projectId, noteId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The note could not be deleted." };
  }
  revalidatePath(`/b/${businessId}/projects/${projectId}`);
  return {};
}

export async function uploadProjectAttachmentAction(businessId: string, projectId: string, formData: FormData) {
  const { user } = await requirePermission(businessId, "projects", "create");
  const file = formData.get("file");
  if (!(file instanceof File)) return { error: "Choose a file to upload." };
  try {
    await uploadProjectAttachment(businessId, user.id, projectId, file);
    revalidatePath(`/b/${businessId}/projects/${projectId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The attachment could not be uploaded." };
  }
}

export async function deleteProjectAttachmentAction(businessId: string, projectId: string, attachmentId: string) {
  const { user } = await requirePermission(businessId, "projects", "delete");
  try {
    deleteProjectAttachment(businessId, user.id, projectId, attachmentId);
    revalidatePath(`/b/${businessId}/projects/${projectId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The attachment could not be deleted." };
  }
}

export async function addProjectCustomerAction(businessId: string, projectId: string, input: unknown): Promise<ProjectActionResult> {
  const { user } = await requirePermission(businessId, "projects", "edit");
  const parsed = projectCustomerInputSchema.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Check customer fields." };
  try {
    addProjectCustomer(businessId, user.id, projectId, parsed.data);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The client could not be added to the project." };
  }
  revalidatePath(`/b/${businessId}/projects/${projectId}`);
  return {};
}

export async function removeProjectCustomerAction(businessId: string, projectId: string, customerId: string) {
  const { user } = await requirePermission(businessId, "projects", "delete");
  try {
    removeProjectCustomer(businessId, user.id, projectId, customerId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The client could not be removed." };
  }
  revalidatePath(`/b/${businessId}/projects/${projectId}`);
  return {};
}
