import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const HIGH_OR_CRITICAL = new Set(["high", "critical"]);

export type AuditAdvisory = {
  source?: number;
  name?: string;
  title?: string;
  url?: string;
  severity?: string;
};

export type AuditVulnerabilityNode = {
  severity?: string;
  via?: Array<string | AuditAdvisory>;
};

export type AuditReport = {
  error?: { summary?: string; code?: string };
  vulnerabilities?: Record<string, AuditVulnerabilityNode>;
};

/**
 * Temporary allowlist for unpatched build-time transitive advisories.
 * Remove each entry once upstream publishes a patched npm release.
 */
export const EXEMPT_PRODUCTION_ADVISORIES: Record<
  string,
  { packageName: string; allowedSeverity: "high"; reason: string }
> = {
  "GHSA-fc5q-39xc-vjpf": {
    packageName: "picomatch",
    allowedSeverity: "high",
    reason:
      "Transitive build-time bundler dependency via @sentry/nextjs (@rollup/plugin-commonjs -> picomatch <= 4.0.7); no patched picomatch (> 4.0.7) released yet and not exposed to runtime user glob input.",
  },
};

export function extractAdvisoryId(url?: string): string {
  if (typeof url !== "string") return "";
  return url.trim().split("/").pop() ?? "";
}

function isExemptAdvisory(advisory: AuditAdvisory, fallbackPkgName: string): boolean {
  const id = extractAdvisoryId(advisory.url);
  const entry = EXEMPT_PRODUCTION_ADVISORIES[id];
  if (!entry) return false;
  const pkg = typeof advisory.name === "string" ? advisory.name : fallbackPkgName;
  return pkg === entry.packageName && advisory.severity === entry.allowedSeverity;
}

/**
 * Fail-closed analyzer for `npm audit --omit=dev --audit-level=high --json`.
 * Rejects malformed output, audit errors, and any high/critical vulnerability
 * not backed strictly by an explicitly exempted advisory.
 */
export function evaluateAuditReport(report: AuditReport | null | undefined): {
  ok: boolean;
  exempted: Array<{ id: string; packageName: string; severity: string; title: string }>;
  unexempted: string[];
} {
  if (!report || typeof report !== "object" || report.error || !report.vulnerabilities) {
    const detail = report?.error?.summary || report?.error?.code || "missing vulnerabilities tree";
    return {
      ok: false,
      exempted: [],
      unexempted: [`Audit report could not be verified: ${detail}`],
    };
  }

  const vulns = report.vulnerabilities;
  const exempted: Array<{ id: string; packageName: string; severity: string; title: string }> = [];
  const unexemptedMap = new Map<string, string>();

  const resolveUnexempted = (pkgName: string, visited: Set<string>): boolean => {
    if (visited.has(pkgName)) return false;
    visited.add(pkgName);
    const node = vulns[pkgName];
    if (!node) return true;
    if (!node.severity || !HIGH_OR_CRITICAL.has(node.severity)) return false;

    const via = Array.isArray(node.via) ? node.via : [];
    if (via.length === 0) return true;

    let blocked = false;
    for (const item of via) {
      if (typeof item === "string") {
        if (resolveUnexempted(item, visited)) blocked = true;
      } else if (item && typeof item === "object") {
        if (item.severity && HIGH_OR_CRITICAL.has(item.severity)) {
          const id = extractAdvisoryId(item.url) || String(item.source ?? "unknown");
          const label = `${item.name ?? pkgName} (${item.severity}, ${id})`;
          if (isExemptAdvisory(item, pkgName)) {
            const pkg = item.name ?? pkgName;
            if (!exempted.some((e) => e.id === id && e.packageName === pkg)) {
              exempted.push({
                id,
                packageName: pkg,
                severity: item.severity,
                title: item.title ?? id,
              });
            }
          } else {
            unexemptedMap.set(label, `${label}: ${item.title ?? "unexempted advisory"}`);
            blocked = true;
          }
        }
      } else {
        blocked = true;
      }
    }
    return blocked;
  };

  for (const [pkgName, node] of Object.entries(vulns)) {
    if (!node?.severity || !HIGH_OR_CRITICAL.has(node.severity)) continue;
    if (resolveUnexempted(pkgName, new Set()) && !unexemptedMap.size) {
      unexemptedMap.set(pkgName, `${pkgName} (${node.severity}): unexempted vulnerability path`);
    }
  }

  return {
    ok: unexemptedMap.size === 0,
    exempted,
    unexempted: [...unexemptedMap.values()],
  };
}

function main(): void {
  const res = spawnSync("npm", ["audit", "--omit=dev", "--audit-level=high", "--json"], {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (res.error) {
    console.error(`Failed to execute npm audit: ${res.error.message}`);
    process.exit(1);
  }

  let report: AuditReport;
  try {
    report = JSON.parse(res.stdout || "{}") as AuditReport;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Failed to parse npm audit JSON output: ${message}`);
    if (res.stderr) console.error(res.stderr.trim());
    process.exit(1);
  }

  const evaluation = evaluateAuditReport(report);
  for (const entry of evaluation.exempted) {
    console.log(
      `[audit] Temporary exemption applied: ${entry.packageName} ${entry.id} (${entry.severity}) — ${EXEMPT_PRODUCTION_ADVISORIES[entry.id]?.reason ?? ""}`,
    );
  }

  if (!evaluation.ok) {
    console.error("Production dependency audit failed due to unexempted high/critical advisories:");
    for (const msg of evaluation.unexempted) {
      console.error(`  - ${msg}`);
    }
    process.exit(1);
  }

  console.log(
    `Production dependency security check passed (${evaluation.exempted.length} temporary exemption(s), 0 unexempted high/critical advisories).`,
  );
}

const isEntrypoint =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isEntrypoint) {
  main();
}
