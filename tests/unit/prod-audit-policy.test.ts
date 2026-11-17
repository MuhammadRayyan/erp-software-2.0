import assert from "node:assert/strict";
import test from "node:test";
import { evaluateAuditReport } from "../../scripts/check-prod-audit";

test("evaluateAuditReport allows only the scoped build-time picomatch exemption", () => {
  const report = {
    vulnerabilities: {
      picomatch: {
        severity: "high",
        via: [
          {
            source: 1247710,
            name: "picomatch",
            title: "picomatch ReDoS",
            url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
            severity: "high",
          },
        ],
      },
      "@rollup/pluginutils": { severity: "high", via: ["picomatch"] },
      "@rollup/plugin-commonjs": { severity: "high", via: ["@rollup/pluginutils", "picomatch"] },
      "@sentry/nextjs": { severity: "high", via: ["@rollup/plugin-commonjs"] },
      next: {
        severity: "moderate",
        via: [
          {
            source: 1247486,
            name: "next",
            url: "https://github.com/advisories/GHSA-mfr8-8qww-v76h",
            severity: "moderate",
          },
        ],
      },
    },
  };

  const result = evaluateAuditReport(report);
  assert.equal(result.ok, true);
  assert.equal(result.exempted.length, 1);
  assert.equal(result.exempted[0]?.id, "GHSA-fc5q-39xc-vjpf");
});

test("evaluateAuditReport rejects any unexempted high or critical advisory or malformed report", () => {
  assert.equal(evaluateAuditReport({ error: { summary: "audit failed" } }).ok, false);
  assert.equal(
    evaluateAuditReport({
      vulnerabilities: {
        picomatch: {
          severity: "high",
          via: [
            {
              name: "picomatch",
              url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
              severity: "high",
            },
          ],
        },
        next: {
          severity: "high",
          via: [
            {
              name: "next",
              url: "https://github.com/advisories/GHSA-9999-9999-9999",
              severity: "high",
              title: "New Next high vulnerability",
            },
          ],
        },
      },
    }).ok,
    false,
  );
  assert.equal(
    evaluateAuditReport({
      vulnerabilities: {
        otherpkg: {
          severity: "critical",
          via: [
            {
              name: "otherpkg",
              url: "https://github.com/advisories/GHSA-fc5q-39xc-vjpf",
              severity: "critical",
              title: "Spoofed URL on wrong package",
            },
          ],
        },
      },
    }).ok,
    false,
  );
});
