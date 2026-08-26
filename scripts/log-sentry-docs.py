import os

# 1. Update CURRENT_STATE.md
filepath = "docs/CURRENT_STATE.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace("- Node 24 runtime with bun as the package manager and script runner", "- Node 24 runtime with bun as the package manager and script runner, monitored with Sentry Next.js SDK")
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# 2. Update CHANGELOG.md
filepath = "docs/CHANGELOG.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_changelog = """### Observability & Infrastructure
* **Sentry SDK Integration**: Successfully instrumented @sentry/nextjs across the application boundaries (Edge, Node server, and Client). Added global-error.tsx boundary and withSentryConfig to track unhandled server and client exceptions to the cloud dashboard.
"""
c = c.replace("## History", "## History\n\n" + new_changelog)
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# 3. Update branch_changes.md
filepath = "docs/branch_changes.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

sentry_log = """
### Sentry SDK Integration
- **Next.js Observability**: Added @sentry/nextjs library, wrapping 
ext.config.ts, generating edge/server/client instrumentation hooks, and applying a global error catch boundary to intercept layout routing crashes.
- **Verification**: Verified using a local test route /sentry-example-page triggering dual captures successfully logged to the backend via the erp-20 project DSN.
"""
c += sentry_log
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

# 4. Update Walkthrough
filepath = r"C:\Users\Rayyan\.gemini\antigravity\brain\128c0dfa-d217-418d-b02f-b5d1446b0a5b\walkthrough.md"
if os.path.exists(filepath):
    with open(filepath, "a", encoding="utf-8") as f:
        f.write("\n## Sentry Next.js SDK Integration\n")
        f.write("- Connected the erp-20 Sentry project DSN via MCP Server.\n")
        f.write("- Created edge, node, and client instrumentation config boundaries.\n")
        f.write("- Verified that uncaught server and client exceptions securely reach the Sentry remote dashboard.\n")
        f.write("- Updated all documentation markdown assets to log observability stack upgrades.\n")

print("done")
