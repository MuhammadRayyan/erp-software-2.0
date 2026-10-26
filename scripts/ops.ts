import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { migrateDatabases } from "../src/core/db/migrate";
import { checkDatabases } from "../src/core/db/check";
import { DATA_ROOT, SYSTEM_DB_PATH } from "../src/core/db/paths";
import { closeAllBusinessConnections } from "../src/core/db/business";
import { resolveBetterAuthSecret } from "../src/core/auth/auth-config";
import { getTrustedOrigins } from "../src/core/config/app-url";

function files(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(root, entry.name);
    if (entry.isSymbolicLink()) throw new Error("Backup symlinks are not supported.");
    return entry.isDirectory() ? files(file) : [file];
  });
}

async function main() {
  const command = process.argv[2];
  try {
    if (command === "validate-env") {
      resolveBetterAuthSecret();
      getTrustedOrigins();
      const setup = process.env.SETUP_KEY;
      if (setup && setup.length < 32) throw new Error("SETUP_KEY must have at least 32 random characters.");
      console.log("Runtime configuration validated.");
    } else if (command === "migrate") {
      process.env.ERP_MIGRATION_MODE = "auto";
      migrateDatabases();
      closeAllBusinessConnections();
      console.log(JSON.stringify(checkDatabases()));
    } else if (command === "check" || command === "compatible") {
      console.log(JSON.stringify(checkDatabases({ deep: command === "check" })));
    } else if (command === "schema-fingerprint") {
      const schemas = files(DATA_ROOT).filter(file => file.endsWith(".sqlite")).sort().map(file => {
        const sqlite = new Database(file, { readonly: true, fileMustExist: true });
        try { return [path.relative(DATA_ROOT, file), sqlite.prepare("SELECT version, name FROM schema_migrations ORDER BY version").all()]; }
        finally { sqlite.close(); }
      });
      console.log(createHash("sha256").update(JSON.stringify(schemas)).digest("hex"));
    } else if (command === "rehearse") {
      if (!process.argv[3]) throw new Error("A verified backup directory is required.");
      const temporary = mkdtempSync(path.join(tmpdir(), "erp-rehearsal-"));
      try {
        const destination = path.join(temporary, "data");
        cpSync(path.resolve(process.argv[3]), destination, { recursive: true });
        const result = spawnSync(process.execPath, [process.argv[1], "migrate"], {
          env: { ...process.env, ERP_DATA_DIR: destination }, stdio: "inherit", timeout: 110_000,
        });
        if (result.status !== 0) throw new Error("Backup restore/migration rehearsal failed.");
      } finally { rmSync(temporary, { recursive: true, force: true }); }
    } else if (command === "invalidate-sessions") {
      const sqlite = new Database(SYSTEM_DB_PATH, { fileMustExist: true });
      try {
        sqlite.transaction(() => {
          sqlite.prepare('DELETE FROM "session"').run();
          sqlite.prepare('DELETE FROM "verification"').run();
        }).immediate();
        console.log("Authentication sessions and pending verification tokens invalidated.");
      } finally { sqlite.close(); }
    } else if (command === "backup") {
      // The deployment stops the only app before this command: registry, databases and files are quiescent.
      if (process.env.ERP_BACKUP_QUIESCED !== "true") throw new Error("A coordinated write stop is required for a full application backup.");
      const destination = path.resolve(process.argv[3] ?? "");
      if (!process.argv[3] || destination.startsWith(DATA_ROOT + path.sep) || destination === DATA_ROOT || existsSync(destination)) throw new Error("Use a new backup directory outside the data root.");
      mkdirSync(destination, { recursive: true, mode: 0o700 });
      const entries: { file: string; bytes: number; sha256: string }[] = [];
      const sourceFiles = files(DATA_ROOT);
      // A read-only bind mount may contain a hot WAL. Recover/check a private writable copy,
      // never the original files; all writers remain stopped until the full snapshot completes.
      const staging = mkdtempSync(path.join(tmpdir(), "erp-snapshot-"));
      if (staging.startsWith(DATA_ROOT + path.sep)) throw new Error("Use a dedicated data directory outside the temporary directory root.");
      try {
        cpSync(DATA_ROOT, staging, { recursive: true });
        for (const source of sourceFiles.filter(file => !/\.sqlite-(wal|shm|journal)$/.test(file) && path.relative(DATA_ROOT, file) !== "manifest.json")) {
          const relative = path.relative(DATA_ROOT, source), target = path.join(destination, relative);
          mkdirSync(path.dirname(target), { recursive: true });
          if (source.endsWith(".sqlite")) {
            const sqlite = new Database(path.join(staging, relative), { fileMustExist: true });
            try {
              if (sqlite.pragma("integrity_check", { simple: true }) !== "ok" || (sqlite.pragma("foreign_key_check") as unknown[]).length) throw new Error("Source database integrity failed.");
              await sqlite.backup(target);
            } finally { sqlite.close(); }
            // A portable backup must not require WAL/SHM creation when mounted read-only.
            const snapshot = new Database(target, { fileMustExist: true });
            try {
              snapshot.pragma("journal_mode=DELETE");
              if (snapshot.pragma("integrity_check", { simple: true }) !== "ok") throw new Error("Backup database integrity failed.");
            } finally { snapshot.close(); }
          } else cpSync(source, target);
          const bytes = readFileSync(target);
          entries.push({ file: relative, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") });
        }
        writeFileSync(path.join(destination, "manifest.json"), JSON.stringify({ format: 1, createdAt: new Date().toISOString(), revision: process.env.APP_REVISION, entries }, null, 2), { mode: 0o600 });
        console.log(`Backup complete: ${entries.length} files.`);
      } finally { rmSync(staging, { recursive: true, force: true }); }
    } else if (command === "verify-backup") {
      const root = path.resolve(process.argv[3] ?? "");
      const manifest = JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")) as { entries: { file: string; bytes: number; sha256: string }[] };
      for (const entry of manifest.entries) {
        const target = path.resolve(root, entry.file);
        if (!target.startsWith(root + path.sep)) throw new Error("Invalid backup path.");
        const bytes = readFileSync(target);
        if (bytes.length !== entry.bytes || createHash("sha256").update(bytes).digest("hex") !== entry.sha256) throw new Error("Backup checksum mismatch.");
      }
      console.log(`Verified ${manifest.entries.length} backup files.`);
    } else throw new Error("Usage: ops.cjs migrate|check|compatible|invalidate-sessions|backup <directory>|verify-backup <directory>");
  } finally { closeAllBusinessConnections(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Operation failed."); process.exitCode = 1; });
