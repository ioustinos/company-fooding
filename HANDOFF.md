# Orexxis · Handoff — open items

The Task Manager keeps this current. Decisions for Ioustinos are NOT here: they live on
`../FOR-IOUSTINOS.md`. This file holds open work and known state. History: `PROJECT_LOG.md`.

Last update: 24 Nov 2026

## State
- `main` = production (company-fooding.netlify.app). `dev` = working branch, **no dev site**.
- `caterplan` = Caterplan production (caterplan.netlify.app), worked in `../company-fooding-caterplan`.
- ONE database (`jipkzmtkmpwsuuihghol`) for local and production.
- Team process installed 24 Nov 2026 (`docs/TEAM-PROCESS.md`). Reuse map not built yet (QA's first job).

## Open work (needs a ticket and his word before anyone starts)
- **Local dev routing:** `netlify dev` breaks on a fresh clone (`[dev] publish = "dist"` + the `/*`
  catch-all). QA needs it to test screens, because there is no dev site.
- **QA test company + users:** «QA Test Co» and `ioustinos+cf-qa-<role>@wecook.gr` (super admin,
  company admin, employee). Prod write → Data lane, on his yes.
- **Migration naming drift:** rename local `01_…22_` to the remote timestamp versions; add the missing
  `20b_revoke_from_public`. Git only.
- **Netlify:** functions region us-east-2 (DB in eu-central-1); 3 server secrets not flagged secret.
- **Data cleanups (approved or pending his yes):** remove `settings.billing` from the HarborLab
  agreement; delete 4 duplicate `employee.activated` rows; HarborLab preview account.
- **Tickets in flight before the team:** CF-112 · GO customer + voucher provisioning on employee
  create; CF-104 · n8n → CF refills cutover; CF-80 · CF_TOPUPS_DRY_RUN flip for one Queensway
  employee; CF-107 · Sentry (needs DSN). Close in Linear: CF-78 · dev/main divergence, CF-101 ·
  role-gate.
- **Product backlog (no tickets yet):** relink past orders on employee create; scheduled sync covers
  its full window; non-CLOSED orders; company calendar import; deal-rule propose/accept; employee
  portal badge; `getCaller` with several company rows.
- **Caterplan:** real survey questions; lead destination (Klaviyo); commit `caterplan-skill/SKILL.md`.
- **Wecook site:** company benefits explainer sent? (`docs/handoffs/GO-BENEFITS-EXPLAINER.md`).
