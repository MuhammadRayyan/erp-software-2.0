"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireModule } from "@/core/permissions/require-module";
import { deleteProjectAttachment, uploadProjectAttachment } from "./project-attachment-service";
import { projectInputSchema, projectNoteInputSchema } from "./project-input";
import { createProjectNote, deleteProjectNote } from "./project-note-service";
import { createProject, deleteProject, updateProject } from "./project-service";

export type ProjectActionResult = { error?: string; fieldErrors?: Record<string, string[]> };

export async function createProjectAction(businessId: string, input: unknown): Promise<ProjectActionResult> {
  const { user } = await requireModule(businessId, "projects");
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the project fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  let projectId: string;
  try { projectId = createProject(businessId, user.id, parsed.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The project could not be created. Your entries are still here." }; }
  redirect(`/b/${businessId}/projects/${projectId}?notice=${encodeURIComponent("Project created")}`);
}

export async function updateProjectAction(businessId: string, projectId: string, input: unknown): Promise<ProjectActionResult> {
  const { user } = await requireModule(businessId, "projects");
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) return { error: "Check the project fields.", fieldErrors: z.flattenError(parsed.error).fieldErrors };
  try { updateProject(businessId, user.id, projectId, parsed.data); }
  catch (error) { return { error: error instanceof Error ? error.message : "The project could not be updated. Your entries are still here." }; }
  redirect(`/b/${businessId}/projects/${projectId}?notice=${encodeURIComponent("Project updated")}`);
}

export async function deleteProjectAction(businessId: string, projectId: string) {
  const { user } = await requireModule(businessId, "projects");
  try {
    deleteProject(businessId, user.id, projectId);
    revalidatePath(`/b/${businessId}/projects`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The project could not be deleted." };
  }
}

export async function addProjectNoteAction(businessId: string, projectId: string, input: unknown): Promise<ProjectActionResult> {
  const { user } = await requireModule(businessId, "projects");
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
  const { user } = await requireModule(businessId, "projects");
  try {
    deleteProjectNote(businessId, user.id, projectId, noteId);
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The note could not be deleted." };
  }
  revalidatePath(`/b/${businessId}/projects/${projectId}`);
  return {};
}

export async function uploadProjectAttachmentAction(businessId: string, projectId: string, formData: FormData) {
  const { user } = await requireModule(businessId, "projects");
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
  const { user } = await requireModule(businessId, "projects");
  try {
    deleteProjectAttachment(businessId, user.id, projectId, attachmentId);
    revalidatePath(`/b/${businessId}/projects/${projectId}`);
    return {};
  } catch (error) {
    return { error: error instanceof Error ? error.message : "The attachment could not be deleted." };
  }
}
