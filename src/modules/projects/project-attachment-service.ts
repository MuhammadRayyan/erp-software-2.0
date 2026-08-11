import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getBusinessDb } from "@/core/db/business";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function attachmentPath(root: string, storagePath: string) {
  const fullPath = path.resolve(root, storagePath);
  const resolvedRoot = path.resolve(root);
  if (!fullPath.startsWith(`${resolvedRoot}${path.sep}`)) throw new Error("Attachment path is invalid.");
  return fullPath;
}

export async function uploadProjectAttachment(
  businessId: string,
  userId: string,
  projectId: string,
  file: File,
) {
  const context = getBusinessDb(businessId, userId);
  if (!context.sqlite.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) throw new Error("Project not found.");
  if (!file.name.trim()) throw new Error("Choose a file to upload.");
  if (file.size <= 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_ATTACHMENT_BYTES) throw new Error("Attachments must be 10 MB or smaller.");
  const id = randomUUID();
  const storagePath = path.posix.join("projects", projectId, id);
  const fullPath = attachmentPath(context.paths.attachments, storagePath);
  mkdirSync(path.dirname(fullPath), { recursive: true });
  writeFileSync(fullPath, Buffer.from(await file.arrayBuffer()));
  try {
    context.sqlite.prepare(`
      INSERT INTO project_attachments
        (id, project_id, original_name, storage_path, mime_type, size_bytes, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, projectId, file.name.trim().slice(0, 240), storagePath, file.type || "application/octet-stream", file.size, userId, new Date().toISOString());
  } catch (error) {
    if (existsSync(fullPath)) unlinkSync(fullPath);
    throw error;
  }
}

export function getProjectAttachment(businessId: string, userId: string, attachmentId: string) {
  const context = getBusinessDb(businessId, userId);
  const row = context.sqlite.prepare(`SELECT id, project_id, original_name, storage_path, mime_type, size_bytes FROM project_attachments WHERE id = ?`).get(attachmentId) as {
    id: string; project_id: string; original_name: string; storage_path: string; mime_type: string; size_bytes: number;
  } | undefined;
  if (!row) return null;
  return { ...row, fullPath: attachmentPath(context.paths.attachments, row.storage_path) };
}

export function deleteProjectAttachment(businessId: string, userId: string, projectId: string, attachmentId: string) {
  const context = getBusinessDb(businessId, userId);
  const row = context.sqlite.prepare(`SELECT storage_path FROM project_attachments WHERE id = ? AND project_id = ?`).get(attachmentId, projectId) as { storage_path: string } | undefined;
  if (!row) throw new Error("Attachment not found.");
  context.sqlite.prepare("DELETE FROM project_attachments WHERE id = ?").run(attachmentId);
  const fullPath = attachmentPath(context.paths.attachments, row.storage_path);
  if (existsSync(fullPath)) unlinkSync(fullPath);
}
