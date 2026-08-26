import os

filepath = "C:/Users/Rayyan/.gemini/antigravity/brain/128c0dfa-d217-418d-b02f-b5d1446b0a5b/task.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    "- [ ] Dashboard Remodeling: Add summary grid for Manager.io-inspired module visibility",
    "- [x] Dashboard Remodeling: Add summary grid for Manager.io-inspired module visibility"
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
