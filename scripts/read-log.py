import os

with open("error.log", "r", encoding="utf-8", errors="ignore") as f:
    lines = f.readlines()
    print("".join(lines[-200:]))
