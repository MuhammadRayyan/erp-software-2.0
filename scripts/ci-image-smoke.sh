#!/usr/bin/env bash
set -Eeuo pipefail
image="${1:?image required}"
revision="${2:?revision required}"
volume="erp-smoke-${GITHUB_RUN_ID:-local}-${RANDOM}"
container="erp-smoke-${RANDOM}"
runtime="$(mktemp)"
cleanup() { docker rm -f "$container" >/dev/null 2>&1 || true; docker volume rm "$volume" >/dev/null 2>&1 || true; rm -f -- "$runtime"; }
trap cleanup EXIT
chmod 600 "$runtime"
printf 'BETTER_AUTH_SECRET=%s\nSETUP_KEY=%s\nAPP_DOMAIN=localhost:3300\nBETTER_AUTH_URL=http://localhost:3300\n' "$(openssl rand -hex 48)" "$(openssl rand -hex 48)" > "$runtime"
ERP_IMAGE="$image" ERP_RUNTIME_ENV_FILE="$runtime" docker compose -f docker-compose.yml config --quiet
caddy_image="$(ERP_IMAGE="$image" ERP_RUNTIME_ENV_FILE="$runtime" docker compose -f docker-compose.yml config --images | awk '/^caddy:/{print; exit}')"
[[ "$caddy_image" =~ ^caddy:.*@sha256:[a-f0-9]{64}$ ]]
docker run --rm --network none -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" "$caddy_image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
[[ "$(docker image inspect "$image" --format '{{.Architecture}}')" == arm64 ]]
[[ "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$revision" ]]
[[ "$(docker image inspect "$image" --format '{{.Config.User}}')" == 10001:10001 ]]
docker run --rm --entrypoint sh "$image" -c 'test ! -f /app/.env && test ! -f /app/.env.local && test ! -f /app/manager_backup_file.manager'
if docker run --rm --network none -e NODE_ENV=production -e BETTER_AUTH_SECRET=ledgerly-secret-change-in-production --entrypoint node "$image" tools/ops.cjs validate-env; then
  echo "Placeholder secret unexpectedly accepted" >&2; exit 1
fi
docker volume create "$volume" >/dev/null
docker run --rm --env-file "$runtime" -v "$volume:/app/data" --entrypoint node "$image" tools/ops.cjs migrate
docker run --rm --env-file "$runtime" -v "$volume:/app/data" --entrypoint node "$image" tools/ops.cjs check
docker run -d --name "$container" --init --read-only --tmpfs /tmp:rw,size=512m \
  --tmpfs /app/.next/cache:rw,uid=10001,gid=10001 --cap-drop ALL --security-opt no-new-privileges \
  --env-file "$runtime" -v "$volume:/app/data" -p 127.0.0.1:3300:3000 "$image" >/dev/null
for attempt in $(seq 1 45); do
  if curl --fail --silent http://localhost:3300/api/health > /tmp/erp-smoke-health.json; then break; fi
  sleep 2
done
python3 -c 'import json,sys; j=json.load(open("/tmp/erp-smoke-health.json")); assert j["status"]=="ok" and j["revision"]==sys.argv[1]' "$revision"
curl --fail --silent http://localhost:3300/login > /dev/null
curl --fail --silent http://localhost:3300/api/live > /dev/null
echo "ARM64 production image, startup configuration, migrations, readiness and login route verified."
