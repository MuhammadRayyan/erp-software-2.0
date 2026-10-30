#!/usr/bin/env bash
set -Eeuo pipefail
image="${1:?image required}"
revision="${2:?revision required}"
volume="erp-smoke-${GITHUB_RUN_ID:-local}-${RANDOM}"
container="erp-smoke-${RANDOM}"
backup_volume="$volume-backup"
operation="$container-operation"
runtime="$(mktemp)"
cleanup() { docker rm -f "$container" "$operation" >/dev/null 2>&1 || true; docker volume rm "$volume" "$backup_volume" >/dev/null 2>&1 || true; rm -f -- "$runtime"; }
trap cleanup EXIT
chmod 600 "$runtime"
printf 'BETTER_AUTH_SECRET=%s\nSETUP_KEY=%s\nAPP_DOMAIN=localhost:3300\nBETTER_AUTH_URL=http://localhost:3300\n' "$(openssl rand -hex 48)" "$(openssl rand -hex 48)" > "$runtime"
ERP_IMAGE="$image" ERP_RUNTIME_ENV_FILE="$runtime" docker compose -f docker-compose.yml config --quiet
caddy_image="$(ERP_IMAGE="$image" ERP_RUNTIME_ENV_FILE="$runtime" docker compose -f docker-compose.yml config --images | awk '/^caddy:/{print; exit}')"
[[ "$caddy_image" =~ ^caddy:.*@sha256:[a-f0-9]{64}$ ]]
docker run --rm --network none -v "$PWD/Caddyfile:/etc/caddy/Caddyfile:ro" "$caddy_image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
[[ "$(docker image inspect "$image" --format '{{.Architecture}}')" == arm64 ]]
[[ "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$revision" ]]
[[ "$(docker run --rm --entrypoint cat "$image" .next/BUILD_ID)" == "$revision" ]]
[[ "$(docker image inspect "$image" --format '{{.Config.User}}')" == 10001:10001 ]]
docker run --rm --network none --entrypoint node "$image" -e 'const fs=require("fs"),r=JSON.parse(fs.readFileSync("tools/release.json")),s=JSON.parse(fs.readFileSync("tools/production-dependencies.cdx.json")); if(r.revision!==process.env.APP_REVISION||!r.version||r.systemSchema<1||r.businessSchema<1||s.bomFormat!=="CycloneDX"||!s.components.length) process.exit(1);'
timeout --foreground --kill-after=5s 45s docker run --rm --name "$operation" --init --read-only \
  --tmpfs /tmp:rw,size=512m,mode=1777 --memory 1g --pids-limit 256 --cap-drop ALL --security-opt no-new-privileges \
  --network none --entrypoint node "$image" tools/verify-html-pdf.cjs
docker run --rm --entrypoint sh "$image" -c 'test ! -f /app/.env && test ! -f /app/.env.local && test ! -f /app/manager_backup_file.manager'
if docker run --rm --network none -e NODE_ENV=production -e BETTER_AUTH_SECRET=uae-manager-secret-change-in-production --entrypoint node "$image" tools/ops.cjs validate-env; then
  echo "Placeholder secret unexpectedly accepted" >&2; exit 1
fi
if docker run --rm --network none -e NODE_ENV=production -e BETTER_AUTH_SECRET=ledgerly-secret-change-in-production --entrypoint node "$image" tools/ops.cjs validate-env; then
  echo "Placeholder secret unexpectedly accepted" >&2; exit 1
fi
docker volume create "$volume" >/dev/null
docker run --rm --env-file "$runtime" -v "$volume:/app/data" --entrypoint node "$image" tools/ops.cjs migrate
docker run --rm --init --env-file "$runtime" -e ERP_CI_FIXTURE=1 -v "$volume:/app/data" \
  -v "$PWD/scripts/ci-create-tenant.cjs:/app/ci-fixture.cjs:ro" --entrypoint node "$image" ci-fixture.cjs
docker run --rm --env-file "$runtime" -v "$volume:/app/data" --entrypoint node "$image" tools/ops.cjs migrate
status=0
docker run --rm --init --env-file "$runtime" -e ERP_CI_FIXTURE=1 -v "$volume:/app/data" \
  -v "$PWD/scripts/ci-create-tenant.cjs:/app/ci-fixture.cjs:ro" --entrypoint node "$image" ci-fixture.cjs hot-wal || status=$?
[[ "$status" == 137 ]] || { echo 'Synthetic WAL crash did not occur' >&2; exit 1; }
docker run --rm -v "$volume:/app/data:ro" --entrypoint sh "$image" -c 'test -s /app/data/system/system.sqlite-wal'
docker volume create "$backup_volume" >/dev/null
verify_snapshot() {
  local snapshot="/backups/$1"
  timeout --foreground --kill-after=5s 60s docker run --rm --name "$operation" --user 0:0 --network none \
    --env-file "$runtime" -e ERP_BACKUP_QUIESCED=true -v "$volume:/app/data:ro" -v "$backup_volume:/backups" \
    --entrypoint node "$image" tools/ops.cjs backup "$snapshot"
  docker run --rm --user 0:0 --network none -v "$backup_volume:/backups:ro" --entrypoint node "$image" tools/ops.cjs verify-backup "$snapshot"
  docker run --rm --user 0:0 --network none -e ERP_CI_FIXTURE=1 -e ERP_DATA_DIR="$snapshot" \
    -v "$backup_volume:/backups:ro" -v "$PWD/scripts/ci-create-tenant.cjs:/app/ci-fixture.cjs:ro" --entrypoint node "$image" ci-fixture.cjs verify
  timeout --foreground --kill-after=5s 120s docker run --rm --name "$operation" --user 0:0 --network none \
    --env-file "$runtime" -v "$backup_volume:/backups:ro" --entrypoint node "$image" tools/ops.cjs rehearse "$snapshot"
}
# Both committed hot WAL and a clean WAL database without sidecars must back up from a read-only mount.
verify_snapshot hot-snapshot
docker run --rm -v "$volume:/app/data:ro" --entrypoint sh "$image" -c 'test -s /app/data/system/system.sqlite-wal'
docker run --rm --init --env-file "$runtime" -e ERP_CI_FIXTURE=1 -v "$volume:/app/data" \
  -v "$PWD/scripts/ci-create-tenant.cjs:/app/ci-fixture.cjs:ro" --entrypoint node "$image" ci-fixture.cjs clean-wal
docker run --rm -v "$volume:/app/data:ro" --entrypoint sh "$image" -c 'test ! -f /app/data/system/system.sqlite-wal && test ! -f /app/data/system/system.sqlite-shm'
verify_snapshot clean-snapshot
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
echo "ARM64 image, real HTML PDF render, committed-WAL backup/restore, tenant migrations, readiness and login verified."
