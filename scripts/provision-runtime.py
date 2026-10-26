"""Run on the VM. Secrets are generated there, never printed or sent through chat/CI."""
import os
import pathlib
import secrets

root = pathlib.Path('/opt/modern-erp')
target = root / 'runtime.env'
if target.exists():
    raise SystemExit('runtime.env already exists; rotate through an explicit maintenance procedure.')
values = {}
legacy = root / '.env'
if legacy.exists():
    for line in legacy.read_text().splitlines():
        if line and not line.startswith('#') and '=' in line:
            key, value = line.split('=', 1)
            if key.startswith('SMTP_') or key.startswith('SENTRY_'):
                values[key] = value
values.update({
    'BETTER_AUTH_SECRET': secrets.token_urlsafe(48),
    'SETUP_KEY': secrets.token_urlsafe(48),
    'APP_DOMAIN': 'erp-portal.rapidtss.com',
    'BETTER_AUTH_URL': 'https://erp-portal.rapidtss.com',
    'BETTER_AUTH_TRUSTED_ORIGINS': 'https://erp-portal.rapidtss.com',
})
descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, 'w') as output:
    output.write(''.join(f'{key}={value}\n' for key, value in values.items()))
(root / '.invalidate-sessions').touch(mode=0o600)
if legacy.exists():
    legacy.chmod(0o600)
print('Runtime secrets generated locally with mode 0600. Session invalidation scheduled for deployment.')
