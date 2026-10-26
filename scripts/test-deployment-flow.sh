#!/usr/bin/env bash
# Exercise failure recovery with isolated command doubles; never contacts production.
set -Eeuo pipefail
workspace="$(pwd)"
temporary="$(mktemp -d)"
mkdir -p "$temporary/bin"
cat > "$temporary/bin/docker" <<'MOCK'
#!/usr/bin/env bash
set -eu
printf '%s\n' "$*" >> "$TEST_ROOT/docker-calls.log"
if [[ "$1" == pull && "$TEST_CASE" == pull-failure ]]; then exit 31; fi
if [[ "$1 $2" == 'inspect modern-erp' ]]; then echo previous-image; exit 0; fi
if [[ "$1 $2" == 'image inspect' ]]; then echo "$TEST_REVISION"; exit 0; fi
if [[ "$1" == compose && "$*" == *'config --images'* ]]; then printf 'caddy:2-alpine@sha256:%064d\n' 0; exit 0; fi
if [[ "$*" == *'tools/ops.cjs schema-fingerprint'* ]]; then
  if [[ "$TEST_CASE" == incompatible-schema && -f "$TEST_ROOT/migrated" ]]; then echo new-schema; else echo old-schema; fi
elif [[ "$*" == *'tools/ops.cjs backup '* && "$TEST_CASE" == backup-failure ]]; then exit 32
elif [[ "$*" == *'tools/ops.cjs backup '* && "$TEST_CASE" == backup-timeout ]]; then sleep 3
elif [[ "$*" == *'tools/ops.cjs rehearse '* && "$TEST_CASE" == rehearsal-failure ]]; then exit 33
elif [[ "$*" == *'tools/ops.cjs migrate'* ]]; then
  touch "$TEST_ROOT/migrated"
  if [[ "$TEST_CASE" == migration-failure ]]; then exit 34; fi
elif [[ "$*" == *'previous-image tools/ops.cjs compatible'* && "$TEST_CASE" == incompatible-schema ]]; then exit 35
fi
exit 0
MOCK
cat > "$temporary/bin/curl" <<'MOCK'
#!/usr/bin/env bash
if [[ "$*" == *https://* && ( "$TEST_CASE" == health-failure || "$TEST_CASE" == incompatible-schema ) ]]; then exit 22; fi
printf '{"status":"ok","revision":"%s"}\n' "$TEST_REVISION"
MOCK
cat > "$temporary/bin/sudo" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
if ! command -v flock >/dev/null; then printf '#!/usr/bin/env bash\nexit 0\n' > "$temporary/bin/flock"; fi
cat > "$temporary/bin/python3" <<'MOCK'
#!/usr/bin/env bash
node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));if(j.status!=="ok"||j.revision!==process.argv[1])process.exit(1)' "$TEST_REVISION"
MOCK
chmod +x "$temporary/bin/"*
export PATH="$temporary/bin:$PATH"
export TEST_REVISION=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
image="ghcr.io/example/erp@sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"

for scenario in success pull-failure backup-failure backup-timeout rehearsal-failure migration-failure health-failure incompatible-schema; do
  export TEST_CASE="$scenario" TEST_ROOT="$temporary/$scenario" ERP_DEPLOY_ROOT="$temporary/$scenario"
  export ERP_BACKUP_TIMEOUT=1s
  mkdir -p "$TEST_ROOT/releases/$TEST_REVISION" "$TEST_ROOT/data"
  printf 'previous configuration\n' > "$TEST_ROOT/docker-compose.yml"
  printf 'previous caddy\n' > "$TEST_ROOT/Caddyfile"
  printf 'new configuration\n' > "$TEST_ROOT/releases/$TEST_REVISION/docker-compose.yml"
  printf 'new caddy\n' > "$TEST_ROOT/releases/$TEST_REVISION/Caddyfile"
  printf 'APP_DOMAIN=erp.example.invalid\n' > "$TEST_ROOT/runtime.env"
  status=0
  bash "$workspace/scripts/deploy.sh" "$image" "$TEST_REVISION" > "$TEST_ROOT/output.log" 2>&1 || status=$?
  if [[ "$scenario" == success ]]; then
    [[ "$status" == 0 && -f "$TEST_ROOT/releases/$TEST_REVISION/deployed-image.txt" ]]
  else
    [[ "$status" != 0 && ! -f "$TEST_ROOT/releases/$TEST_REVISION/deployed-image.txt" ]]
    if [[ "$scenario" == pull-failure ]]; then ! grep -q '^stop ' "$TEST_ROOT/docker-calls.log"; fi
    if [[ "$scenario" != pull-failure && "$scenario" != incompatible-schema ]]; then
      grep -q 'previous configuration' "$TEST_ROOT/docker-compose.yml"
      grep -q 'Previous release restored' "$TEST_ROOT/output.log"
      if [[ "$scenario" == backup-timeout ]]; then grep -q '^rm -f erp-operation-' "$TEST_ROOT/docker-calls.log"; fi
    fi
    if [[ "$scenario" == incompatible-schema ]]; then
      grep -q 'schema is incompatible' "$TEST_ROOT/output.log"
      ! grep -q 'Previous release restored' "$TEST_ROOT/output.log"
    fi
  fi
  echo "Deployment scenario passed: $scenario"
done
