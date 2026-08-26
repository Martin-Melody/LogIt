#!/usr/bin/env bash
# deploy.sh — build and push a service image to ECR for the AWS hosted deployment
#
# App Runner has auto_deployments_enabled, so pushing :latest is the entire deploy —
# no terraform apply needed unless the infrastructure itself changed.
#
# Usage:
#   ./scripts/deploy.sh api      # services/api only
#   ./scripts/deploy.sh web      # apps/clients/logit-web only
#   ./scripts/deploy.sh all      # both

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
REGION="${AWS_REGION:-eu-west-1}"
TARGET="${1:-}"

if [[ -z "$TARGET" ]]; then
  echo "Usage: $0 [api|web|all]"
  exit 1
fi

for cmd in aws docker; do
  if ! command -v "$cmd" &>/dev/null; then
    echo "✗  $cmd not found." >&2
    exit 1
  fi
done

ACCOUNT_ID="$(aws sts get-caller-identity --query Account --output text)"
REGISTRY="$ACCOUNT_ID.dkr.ecr.$REGION.amazonaws.com"

echo "▶  Logging in to $REGISTRY"
aws ecr get-login-password --region "$REGION" | docker login --username AWS --password-stdin "$REGISTRY"

deploy_api() {
  echo "▶  Building logit-api"
  docker build -f "$REPO_ROOT/services/api/Dockerfile" -t "$REGISTRY/logit-api:latest" "$REPO_ROOT/services/api"
  echo "▶  Pushing logit-api"
  docker push "$REGISTRY/logit-api:latest"
}

deploy_web() {
  # Build context is the repo root, not logit-web's own directory — it needs
  # packages/core alongside it for the npm workspace. See the Dockerfile's top comment.
  echo "▶  Building logit-web"
  docker build -f "$REPO_ROOT/apps/clients/logit-web/Dockerfile" -t "$REGISTRY/logit-web:latest" "$REPO_ROOT"
  echo "▶  Pushing logit-web"
  docker push "$REGISTRY/logit-web:latest"
}

case "$TARGET" in
  api)
    deploy_api
    ;;
  web)
    deploy_web
    ;;
  all)
    deploy_api
    deploy_web
    ;;
  *)
    echo "Unknown target: $TARGET"
    echo "Usage: $0 [api|web|all]"
    exit 1
    ;;
esac

echo "✓  Pushed — App Runner will pick up the new image automatically."
