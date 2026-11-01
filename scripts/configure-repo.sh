#!/usr/bin/env bash
# Applies the repository settings that cannot live in files: branch protection, release-tag rules, security features
# and the protected `release` environment. Idempotent; needs `gh` authenticated as a repository admin, and a PUBLIC
# repository on the GitHub Free plan (protection rules and environments are paid features for private repos).
#
#   scripts/configure-repo.sh [--dry-run] [--signing-secrets]
#
# --signing-secrets also stores SOLITON_SIGNING_P12 / SOLITON_SIGNING_P12_PASSWORD from ~/.config/soliton-signing
# in the `release` environment (see docs/SIGNING.md).
set -euo pipefail
REPO="${REPO:-solitonhq/soliton-term}"
DRY=0; SECRETS=0
for a in "$@"; do case "$a" in --dry-run) DRY=1;; --signing-secrets) SECRETS=1;; *) echo "unknown option $a" >&2; exit 1;; esac; done

api() { if [ "$DRY" = 1 ]; then echo "gh api $*"; else gh api "$@" >/dev/null; fi; }
step() { echo "==> $*"; }

step "Branch protection on main (PRs, linear history, required checks, no force-push/delete)"
api -X PUT "repos/$REPO/branches/main/protection" --input - <<JSON
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["Frontend", "Rust (macOS)", "Tauri build (macOS)", "Signed-off-by",
                 "Analyze (javascript-typescript)", "Analyze (rust)"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": true,
    "require_code_owner_reviews": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": true,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "required_conversation_resolution": true
}
JSON

step "Ruleset: release tags (v*) can only be created by admins and never moved or deleted"
if [ "$DRY" = 0 ] && gh api "repos/$REPO/rulesets" --jq '.[].name' | grep -qx "Protect release tags"; then
  echo "    already present"
else
  api -X POST "repos/$REPO/rulesets" --input - <<'JSON'
{
  "name": "Protect release tags",
  "target": "tag",
  "enforcement": "active",
  "conditions": { "ref_name": { "include": ["refs/tags/v*"], "exclude": [] } },
  "rules": [ { "type": "creation" }, { "type": "update" }, { "type": "deletion" }, { "type": "non_fast_forward" } ],
  "bypass_actors": [ { "actor_id": 5, "actor_type": "RepositoryRole", "bypass_mode": "always" } ]
}
JSON
fi

step "Secret scanning, push protection, private vulnerability reporting"
api -X PATCH "repos/$REPO" --input - <<'JSON'
{ "security_and_analysis": {
    "secret_scanning": { "status": "enabled" },
    "secret_scanning_push_protection": { "status": "enabled" } } }
JSON
api -X PUT "repos/$REPO/private-vulnerability-reporting"

step "Protected 'release' environment (only v* tags may deploy to it)"
api -X PUT "repos/$REPO/environments/release" --input - <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
if [ "$DRY" = 1 ] || ! gh api "repos/$REPO/environments/release/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx 'v\*'; then
  api -X POST "repos/$REPO/environments/release/deployment-branch-policies" -f name='v*' -f type=tag
fi

if [ "$SECRETS" = 1 ]; then
  step "Signing secrets into the release environment"
  DIR="$HOME/.config/soliton-signing"
  if [ "$DRY" = 1 ]; then
    echo "gh secret set SOLITON_SIGNING_P12 -e release -R $REPO < (base64 of $DIR/signing.p12)"
    echo "gh secret set SOLITON_SIGNING_P12_PASSWORD -e release -R $REPO < $DIR/pass"
  else
    base64 -i "$DIR/signing.p12" | tr -d '\n' | gh secret set SOLITON_SIGNING_P12 -e release -R "$REPO"
    gh secret set SOLITON_SIGNING_P12_PASSWORD -e release -R "$REPO" < "$DIR/pass"
  fi
fi
echo "Done. Verify under Settings → Branches / Rules / Environments."
