import os

filepath = "docs/CHANGELOG.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

new_changelog = """### Observability & Infrastructure
* **Sentry SDK Integration**: Successfully instrumented @sentry/nextjs across the application boundaries (Edge, Node server, and Client). Added global-error.tsx boundary and withSentryConfig to track unhandled server and client exceptions to the cloud dashboard.
"""
c = c.replace("## v2.1.1", "## v2.1.1\n\n" + new_changelog)
with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
