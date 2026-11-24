#!/bin/bash
# PreToolUse hook (matcher: Bash). Blocks every push to a PRODUCTION branch, except ONE push of ONE
# approved commit. Production branches here: main (company-fooding.netlify.app) and caterplan
# (caterplan.netlify.app — the Caterplan site deploys that branch straight to production).
# Approval: the Task Manager writes the full commit sha to .claude/main-push-approved
# after Ioustinos says yes in the TM session to a tabled release report.
# The push must name that commit explicitly: git push origin <sha>:main  (or <sha>:caterplan)
# The approval is used up on the first allowed push.
# The approval file is found next to this hook (../main-push-approved), not via CLAUDE_PROJECT_DIR:
# that variable points at the folder the session opened, which may be the repo's parent.
# Side effect to know: ANY Bash command whose text contains a git push naming a production branch is
# checked, including a test script typed inline. Test the hook from a file (see test-hook.sh).
# Source: skill dev-team-process (Matchio, Nov 2026); caterplan added for Orexxis 2026-11-24.
PROD='(main|caterplan)'
cmd=$(python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("command",""))')
if printf '%s' "$cmd" | grep -Eq 'git([[:space:]]+-[^[:space:]]+([[:space:]]+[^-[:space:]][^[:space:]]*)?)*[[:space:]]+push\b' && \
   printf '%s' "$cmd" | grep -Eq "(^|[[:space:]:+])(refs/heads/)?${PROD}([[:space:]]|\$|;|&|\\|)"; then
  approval="$(cd "$(dirname "$0")/.." && pwd)/main-push-approved"
  if [ -f "$approval" ]; then
    sha=$(tr -d '[:space:]' < "$approval")
    pushed=$(printf '%s' "$cmd" | grep -Eo "(^|[[:space:]])[0-9a-f]{7,40}:(refs/heads/)?${PROD}([[:space:]]|\$|;|&|\\|)" | grep -Eo '[0-9a-f]{7,40}' | head -1)
    if [ -n "$sha" ] && [ -n "$pushed" ] && [ "${sha#"$pushed"}" != "$sha" ] && \
       ! printf '%s' "$cmd" | grep -Eq '(-f|--force|[[:space:]]\+)'; then
      rm -f "$approval"
      exit 0
    fi
    echo "Blocked: the approved commit is ${sha:0:7}. Push exactly: git push origin ${sha:0:7}:<main|caterplan> (no force)." >&2
    exit 2
  fi
  echo "Blocked: no approval for a push to a production branch (main / caterplan). Ask the Task Manager; Ioustinos approves releases there." >&2
  exit 2
fi
exit 0
