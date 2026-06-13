#!/usr/bin/env bash
# Ship an ATLAS update from your machine: build + push both images, then
# (optionally) cut a GitHub release and tell Coolify to redeploy in place.
# Coolify keeps your env/domains/volumes — this just swaps in the new images.
#
#   ./scripts/ship.sh v1.0.1
#   RELEASE=1 ./scripts/ship.sh v1.0.1                 # also cut a GitHub release
#   COOLIFY_WEBHOOK=https://.../api/v1/deploy?uuid=... ./scripts/ship.sh v1.0.1
set -euo pipefail

VER="${1:?usage: ship.sh <version, e.g. v1.0.1>}"
REG="ghcr.io/itsramananshul"
HASH="$(git rev-parse --short HEAD)"

echo "==> building atlas-server ($VER)"
docker build -f lifecycle/container/Dockerfile \
  -t "$REG/atlas-server:$VER" -t "$REG/atlas-server:latest" \
  --build-arg VERSION="$VER" --build-arg GIT_BUILD_HASH="$HASH" .

echo "==> building atlas-mcp ($VER)"
docker build -t "$REG/atlas-mcp:$VER" -t "$REG/atlas-mcp:latest" ./mcp-server

echo "==> pushing images"
docker push "$REG/atlas-server:$VER"
docker push "$REG/atlas-server:latest"
docker push "$REG/atlas-mcp:$VER"
docker push "$REG/atlas-mcp:latest"

if [ "${RELEASE:-}" = "1" ] && command -v gh >/dev/null 2>&1; then
  echo "==> cutting GitHub release $VER"
  git tag -f "$VER" && git push origin "$VER"
  gh release create "$VER" --repo itsramananshul/ATLAS --verify-tag \
    --title "ATLAS $VER" --generate-notes || echo "(release may already exist)"
fi

if [ -n "${COOLIFY_WEBHOOK:-}" ]; then
  echo "==> triggering Coolify redeploy"
  curl --fail --silent --show-error -X GET "$COOLIFY_WEBHOOK" \
    ${COOLIFY_TOKEN:+-H "Authorization: Bearer $COOLIFY_TOKEN"}
  echo "   Coolify redeploy triggered."
else
  echo "==> COOLIFY_WEBHOOK not set — click Redeploy in Coolify to update."
fi

echo "==> shipped $VER"
