# Patch for setup-tech-stack skill — section 2B.2

Replaces the existing `## 2B.2 — GitHub Personal Access Token (USER does manually)` section
in `references/manual-checkpoints.md` of the `ioustinos-tech-stack-setup:setup-tech-stack` skill.

Motivated by Ioustinos's 2026-05-16 feedback: fine-grained PATs should be the recommendation,
not classic. Classic PATs grant blanket read/write/admin on every repo on the account.

---

## 2B.2 — GitHub Personal Access Token (USER does manually)

**Use fine-grained PAT scoped to the one repo.** Classic PAT with `repo` scope grants blanket read/write/admin on every repository on the account — an unacceptable blast radius for a single project's deploy token. Fine-grained limits the damage if the token ever leaks.

**URL:** https://github.com/settings/personal-access-tokens/new

**Settings:**
- Token name: `<slug> – cowork PAT`
- Expiration: 1 year (or shorter — rotate manually)
- **Resource owner:** the user's account (or the relevant org)
- **Repository access:** "Only select repositories" → select the `<slug>` repo only
- **Repository permissions:**
  - **Contents** → Read and write (mandatory for `git push`)
  - **Metadata** → Read (auto-included once any repo permission is set)
  - **Pull requests** → Read and write (optional, enable if PR flow is planned)
  - All others → No access
- **Account permissions:** none

**Classic PAT** (https://github.com/settings/tokens/new with `repo` scope) is acceptable ONLY as a fallback — e.g. fine-grained UI is broken, or the user's GitHub plan doesn't expose fine-grained for their resource owner. Do not default to it.

**The user pastes the PAT once.** The skill writes a credentials file at `<workspace>/.auto-memory/github_credentials.sh` and never echoes the PAT back.
