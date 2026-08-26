import os
import json

filepath = "package.json"
with open(filepath, "r", encoding="utf-8") as f:
    pkg = json.load(f)

test_script = pkg["scripts"]["test"]
if "tests/phase-10-new-features.test.ts" not in test_script:
    pkg["scripts"]["test"] = test_script + " tests/phase-10-new-features.test.ts"
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(pkg, f, indent=2)

print("done")
