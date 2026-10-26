#!/usr/bin/env bash
# Receives the job-scoped registry token on stdin; never includes it in argv or persistent host configuration.
set -Eeuo pipefail
umask 077
revision="${1:?revision required}"
image="${2:?image digest required}"
actor="${3:?registry actor required}"
export DOCKER_CONFIG
DOCKER_CONFIG="$(mktemp -d /tmp/erp-registry.XXXXXX)"
cleanup() {
  status=$?
  trap - EXIT
  rm -f -- "$DOCKER_CONFIG/config.json"
  rmdir -- "$DOCKER_CONFIG" || true
  exit "$status"
}
trap cleanup EXIT
docker login ghcr.io -u "$actor" --password-stdin
bash "$(dirname -- "${BASH_SOURCE[0]}")/deploy.sh" "$image" "$revision"
