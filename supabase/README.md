# Supabase — Company Fooding

## Migration order

Applied top-down in filename order. Each file is idempotent — safe to re-run.

| # | File                                      | Linear    | Contents                                      |
|---|-------------------------------------------|-----------|-----------------------------------------------|
| 1 | `01_enums_and_identity.sql`               | CF E2.1   | Enums + `cf_admins`, `companies`, `company_offices`, `company_users`, `employees`, `vendors` |
| 2 | `02_matchmaking.sql`                      | CF E2.2   | `matchmaking_agreements`, `agreement_offices`, `agreement_shops` |
| 3 | `03_benefits.sql`                         | CF E2.3   | topup enums + `benefits`, `benefit_rules`, `benefit_assignments`, `benefit_ledger`, `benefit_topups` |
| 4 | `04_orders.sql`                           | CF E2.4   | `orders`, `order_items`, `order_benefit_uses` |
| 5 | `05_invoices.sql`                         | CF E2.5   | `invoices`, `invoice_line_items`             |
| 6 | `06_system.sql`                           | CF E2.6   | `settings` (+ seeds), `audit_log`            |
| 7 | `07_rls.sql`                              | CF E2.7   | Helper functions + SELECT policies + `my_benefits` view |
| 8 | `08_triggers_and_handle_new_user.sql`     | CF E2.8   | `updated_at` triggers + `handle_new_user()` on `auth.users` |

## Key contracts

- **Money in cents** (int) on every `_amount`, `_price`, `total*`, `subtotal` column.
- **Bilingual** `_el` / `_en` columns for user-facing strings.
- **Idempotent top-ups**: `benefit_topups` is `unique (assignment_id, scheduled_for)`.
  The scheduler retries three times per day (05:00 / 08:00 / 12:00) into the **same** row.
- **Webhook dedup**: `orders` is `unique (source, external_order_id)`.
- **Service-role pattern**: RLS has SELECT policies only. Writes run through
  Netlify Functions that use the service-role key.

## RLS model (reads only)

| Role (helper)                    | Sees                                                |
|----------------------------------|-----------------------------------------------------|
| `is_cf_admin()`                  | Everything.                                         |
| `current_company_id()`           | Own company's rows across every tenant table.       |
| `current_employee_id()`          | Own employee record + own ledger/assignments/orders; benefits via `my_benefits` view. |
| Anon                             | Nothing except what future public endpoints expose. |

## Applying (once the Supabase project exists)

```bash
# From the repo root, with supabase CLI linked to the project:
supabase db push   # applies anything under supabase/migrations/
```

Or via the Supabase MCP, one file at a time, in the numbered order above.
