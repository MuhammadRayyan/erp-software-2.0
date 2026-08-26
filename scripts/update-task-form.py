import os

filepath = "C:/Users/Rayyan/.gemini/antigravity/brain/128c0dfa-d217-418d-b02f-b5d1446b0a5b/task.md"
with open(filepath, "r", encoding="utf-8") as f:
    c = f.read()

c = c.replace(
    "- [ ] Settings Remodeling: Add 'Form Defaults' page to customize default behaviors",
    "- [x] Settings Remodeling: Add 'Form Defaults' page to customize default behaviors"
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(c)

print("done")
