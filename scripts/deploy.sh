#!/usr/bin/env bash
#
# One-command deploy for the Dockge-managed stack on the home server.
#
#   npm run deploy
#
# What it does:
#   1. rsyncs the working tree to a staging dir in your own home on the server
#      (no sudo needed there), excluding build junk. Your local .env / music
#      are never sent.
#   2. Over a single interactive SSH session, sudo-syncs staging into the real
#      Dockge stack dir — while *preserving the server's .env and music/* — then
#      rebuilds the container with `docker compose up -d --build`.
#
# Prereqs (one-time):
#   - SSH key auth to the server, so it stops asking for a password:
#       ssh-copy-id "$DEPLOY_SERVER"
#   - Your user can sudo on the server (it will prompt once per deploy).
#
# Required: set DEPLOY_SERVER (user@host) for your own server. Override the
# other env vars too if your stack path differs.
set -euo pipefail

if [[ -z "${DEPLOY_SERVER:-}" ]]; then
  echo "DEPLOY_SERVER is not set. Example: DEPLOY_SERVER=user@your-server npm run deploy" >&2
  exit 1
fi

SERVER="${DEPLOY_SERVER}"
STACK_DIR="${DEPLOY_STACK_DIR:-/opt/stacks/immich-baby-slideshow}"
STAGE_DIR="${DEPLOY_STAGE_DIR:-\$HOME/.deploy/immich-baby-slideshow}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

EXCLUDES=(
  --exclude='.git/'
  --exclude='.env'
  --exclude='music/'
  --exclude='node_modules/'
  --exclude='dist/'
  --exclude='test-results/'
  --exclude='playwright-report/'
)

echo "→ [1/2] Syncing working tree to ${SERVER}:${STAGE_DIR}"
# Stage into the user's own home (writable without sudo). --delete keeps the
# staging dir an exact mirror of the repo.
ssh "${SERVER}" "mkdir -p \"${STAGE_DIR}\""
rsync -az --delete "${EXCLUDES[@]}" "${REPO_ROOT}/" "${SERVER}:${STAGE_DIR}/"

echo "→ [2/2] Promoting to ${STACK_DIR} and rebuilding (sudo — you'll be prompted once)"
# -t: give sudo a TTY to prompt on. The stack-dir sync keeps the server's own
# .env and music/ (they're excluded, so --delete won't remove them either).
ssh -t "${SERVER}" "
  set -e
  sudo rsync -a --delete --exclude='.env' --exclude='music/' \"${STAGE_DIR}/\" \"${STACK_DIR}/\"
  cd \"${STACK_DIR}\"
  sudo docker compose up -d --build
  sudo docker compose ps
"

echo "✓ Deploy complete. Watch it settle:  ssh ${SERVER} 'sudo docker compose -f ${STACK_DIR}/compose.yaml logs -f --tail=50'"
