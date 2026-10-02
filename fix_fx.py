import re

path_er = r'src\modules\currency\exchange-rate.ts'
with open(path_er, 'r', encoding='utf-8') as f: c = f.read()

c = c.replace(
    'SELECT id, code, name FROM accounts\n        WHERE is_active = 1 AND type IN (\'other_income\', \'income\')\n        ORDER BY code',
    'SELECT id, name FROM accounts\n        WHERE is_active = 1 AND type IN (\'other_income\', \'income\')\n        ORDER BY name'
)
c = c.replace(
    'SELECT id, code, name FROM accounts\n        WHERE is_active = 1 AND type IN (\'other_expense\', \'expense\')\n        ORDER BY code',
    'SELECT id, name FROM accounts\n        WHERE is_active = 1 AND type IN (\'other_expense\', \'expense\')\n        ORDER BY name'
)
c = c.replace(
    '.all() as { id: string; code: string; name: string }[]',
    '.all() as { id: string; name: string }[]'
)

with open(path_er, 'w', encoding='utf-8') as f: f.write(c)

print("Fixed exchange-rate.ts")
