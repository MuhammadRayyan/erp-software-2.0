import { randomUUID } from "node:crypto";
import { getBusinessDb } from "@/core/db/business";

export function createProjectNote(
  businessId: string,
  userId: string,
  projectId: string,
  body: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  if (!sqlite.prepare("SELECT 1 FROM projects WHERE id = ?").get(projectId)) {
    throw new Error("Project not found.");
  }
  sqlite.prepare(`
    INSERT INTO project_notes (id, project_id, body, created_by, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, NULL)
  `).run(randomUUID(), projectId, body, userId, new Date().toISOString());
}

export function deleteProjectNote(
  businessId: string,
  userId: string,
  projectId: string,
  noteId: string,
) {
  const { sqlite } = getBusinessDb(businessId, userId);
  const result = sqlite.prepare(
    "DELETE FROM project_notes WHERE id = ? AND project_id = ?",
  ).run(noteId, projectId);
  if (!result.changes) throw new Error("Project note not found.");
}
