import json

filepath = r"C:\Users\Rayyan\.gemini\config\mcp_config.json"
with open(filepath, "r", encoding="utf-8") as f:
    config = json.load(f)

config["mcpServers"]["sentry"] = {
    "serverUrl": "https://mcp.sentry.dev/mcp"
}

with open(filepath, "w", encoding="utf-8") as f:
    json.dump(config, f, indent=2)

print("done")
