#!/usr/bin/env bash
set -Eeuo pipefail
umask 077

image="${1:?immutable image digest required}"
revision="${2:?Git revision required}"
root="${ERP_DEPLOY_ROOT:-/opt/modern-erp}"
[[ "$revision" =~ ^[a-f0-9]{40}$ ]] || { echo "Invalid revision" >&2; exit 1; }
[[ "$image" =~ ^ghcr\.io/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$ ]] || { echo "Deploy by registry digest only" >&2; exit 1; }
cd "$root"
exec 9>"$root/.deploy.lock"
flock -w 900 9 || { echo "Another deployment holds the host lock" >&2; exit 1; }
release="$root/releases/$revision"
test -f "$release/docker-compose.yml"
test -f "$release/Caddyfile"
test -r "$root/runtime.env"
[[ "$(df --output=avail -k "$root" | tail -1 | tr -d ' ')" -gt 5242880 ]] || { echo "At least 5 GiB free disk is required" >&2; exit 1; }
docker pull "$image"
ERP_IMAGE="$image" ERP_RUNTIME_ENV_FILE="$root/runtime.env" docker compose --env-file "$root/runtime.env" -f "$release/docker-compose.yml" config --quiet
caddy_image="$(ERP_IMAGE="$image" ERP_RUNTIME_ENV_FILE="$root/runtime.env" docker compose --env-file "$root/runtime.env" -f "$release/docker-compose.yml" config --images | awk '/^caddy:/{print; exit}')"
[[ "$caddy_image" =~ ^caddy:.*@sha256:[a-f0-9]{64}$ ]] || { echo "Caddy must be pinned by digest" >&2; exit 1; }
docker pull "$caddy_image"
docker run --rm --network none --env-file "$root/runtime.env" -v "$release/Caddyfile:/etc/caddy/Caddyfile:ro" "$caddy_image" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
[[ "$(docker image inspect "$image" --format '{{index .Config.Labels "org.opencontainers.image.revision"}}')" == "$revision" ]] || { echo "Image revision mismatch" >&2; exit 1; }
docker run --rm --network none --env-file "$root/runtime.env" --entrypoint node "$image" tools/ops.cjs validate-env
docker run --rm --network none --entrypoint sh "$image" -c 'test ! -f /app/.env && test ! -f /app/.env.local && test ! -f /app/manager_backup_file.manager'
mkdir -p "$root/static"
# Add immutable assets before switching traffic; previous browser tabs retain their hashed chunks.
docker run --rm --user 0:0 --network none -v "$root/static:/assets" --entrypoint sh "$image" -c 'cp -Rn /app/.next/static/. /assets/'

previous="$(docker inspect modern-erp --format '{{.Image}}' 2>/dev/null || true)"
if [[ -n "$previous" ]]; then
  docker run --rm --user 0:0 --network none -v "$root/static:/assets" --entrypoint sh "$previous" -c 'cp -Rn /app/.next/static/. /assets/'
fi
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$root/backups/$stamp-$revision"
mkdir -p "$root/backups"
cp "$root/docker-compose.yml" "$release/previous-compose.yml"
cp "$root/Caddyfile" "$release/previous-Caddyfile"
if [[ -f "$root/.release.env" ]]; then cp "$root/.release.env" "$release/previous-release.env"; fi
if [[ -n "$previous" ]]; then docker tag "$previous" "modern-erp:rollback-$stamp"; fi

compose() { ERP_RUNTIME_ENV_FILE="$root/runtime.env" docker compose --project-name modern-erp --env-file "$root/runtime.env" --env-file "$root/.release.env" -f "$root/docker-compose.yml" "$@"; }
ops() { docker run --rm --user 0:0 --network none --env-file "$root/runtime.env" -v "$root/data:/app/data" --entrypoint node "$image" tools/ops.cjs "$@"; }
before_schema=""
stopped=false
success=false
migration_started=false
on_exit() {
  status=$?
  if [[ "$success" != true && "$stopped" == true && -n "$previous" ]]; then
    set +e
    echo "Deployment failed; checking whether the previous image can safely restart." >&2
    after_schema="$(ops schema-fingerprint)"
    compatible=false
    if [[ "$migration_started" == false ]]; then compatible=true; fi
    if [[ -n "$before_schema" && "$before_schema" == "$after_schema" ]]; then compatible=true; fi
    if [[ "$compatible" != true ]]; then
      if docker run --rm --user 0:0 --network none --env-file "$root/runtime.env" -v "$root/data:/app/data:ro" --entrypoint node "$previous" tools/ops.cjs compatible; then compatible=true; fi
    fi
    if [[ "$compatible" == true ]]; then
      cp "$release/previous-compose.yml" "$root/docker-compose.yml"
      cp "$release/previous-Caddyfile" "$root/Caddyfile"
      if [[ -f "$release/previous-release.env" ]]; then cp "$release/previous-release.env" "$root/.release.env"; else printf 'ERP_IMAGE=%s\n' "$previous" > "$root/.release.env"; fi
      compose up -d --no-build --pull never modern-erp
      if curl --fail --silent --retry 10 --retry-delay 2 --retry-all-errors http://localhost/api/health >/dev/null; then
        echo "Previous release restored; the deployment is still marked FAILED." >&2
      else echo "CRITICAL: previous release did not recover. Backup: $backup" >&2; fi
    else
      compose stop modern-erp
      echo "CRITICAL: schema is incompatible with the previous release. Forward repair or an explicit coordinated restore is required. Backup: $backup" >&2
    fi
    status=1
  fi
  exit "$status"
}
trap on_exit EXIT

# SIGTERM drains in-flight work; no new app process can write during the snapshot/migration window.
if [[ -n "$previous" ]]; then docker stop --time 30 modern-erp >/dev/null; fi
stopped=true
before_schema="$(ops schema-fingerprint)"
docker run --rm --user 0:0 --network none --env-file "$root/runtime.env" -e ERP_BACKUP_QUIESCED=true \
  -v "$root/data:/app/data:ro" -v "$root/backups:/backups" --entrypoint node "$image" \
  tools/ops.cjs backup "/backups/$(basename "$backup")"
docker run --rm --user 0:0 --network none -v "$backup:/backup:ro" --entrypoint node "$image" tools/ops.cjs verify-backup /backup
docker run --rm --user 0:0 --network none --env-file "$root/runtime.env" -v "$backup:/backup:ro" --entrypoint node "$image" tools/ops.cjs rehearse /backup
migration_started=true
ops migrate
ops check
if [[ -f "$root/.invalidate-sessions" ]]; then ops invalidate-sessions; fi
sudo -n chown -R 10001:10001 "$root/data"
sudo -n chmod -R go-rwx "$root/data"
cp "$release/docker-compose.yml" "$root/docker-compose.yml"
cp "$release/Caddyfile" "$root/Caddyfile"
printf 'ERP_IMAGE=%s\n' "$image" > "$root/.release.env"
compose config --quiet
compose up -d --no-build --pull never modern-erp caddy
docker exec erp-caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
docker exec erp-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
for attempt in $(seq 1 30); do
  if docker exec modern-erp node -e 'fetch("http://127.0.0.1:3000/api/health").then(async r=>{const j=await r.json();if(!r.ok||j.status!=="ok"||j.revision!==process.env.APP_REVISION)process.exit(1)}).catch(()=>process.exit(1))'; then break; fi
  sleep 2
done
docker exec modern-erp node tools/ops.cjs check
expected="$revision" curl --fail --silent --show-error --retry 8 --retry-delay 2 --retry-all-errors "https://$(sed -n 's/^APP_DOMAIN=//p' "$root/runtime.env")/api/health" \
  | python3 -c 'import json,sys; j=json.load(sys.stdin); assert j["status"]=="ok" and j["revision"]==sys.argv[1]' "$revision"
printf '%s\n' "$image" > "$release/deployed-image.txt"
if [[ -f "$root/.invalidate-sessions" ]]; then rm -- "$root/.invalidate-sessions"; fi
success=true
echo "Verified release $revision deployed from $image. Previous image retained: $previous. Backup: $backup"
