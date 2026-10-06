# Production migration reconciliation

Reference source: main `de3437372858f1ac25359d29f8d39c1db2005169`.

The production ledger is retained as historical evidence. Do not replay old
migrations or mark consolidated files as applied without comparing their SQL.

Production applied billing/realtime changes as separate entries:

- `20261005205027_realtime_billing_admin_dashboard`
- `20261005205109_access_billing_payment_state`
- `20261005205956_fix_admin_billing_overview`

Git represents these changes in `20261005214000_live_billing_admin_finance_realtime.sql`.
The production CREATE TABLE for `private.platform_expenses` omitted RLS and the
creator FK. Direct client grants were already revoked. The additive reconciliation
enables RLS, preserves deny-by-grants access, adds/validates that FK and checks the
existing email baseline. No client policy is needed: guarded SECURITY DEFINER
RPCs owned by postgres implement Super Admin + aal2 access.

The existing email table, trigger, cron and functions had no matching ledger entry.
Their catalog presence was verified; the available ledger cannot identify who
created them outside recorded migrations. Do not invent historical entries.

Only these reviewed migrations were applied, in this order:

1. `20261006004520_reconcile_production_platform_expenses.sql`
2. `20261006004542_audit_admin_email_reliability.sql`

The email reliability file was originally generated during the local audit as
`20261006000627_audit_admin_email_reliability.sql`. Its filename now matches the
actual version recorded by the production migration tool. The reconciliation
file was similarly aligned to its recorded version. SQL content was preserved.

Both new entries were verified in production after application. The new email
function was deployed only after the columns and RPC changes were present.
Future deployments must continue to inspect the remote ledger and apply only
reviewed new migrations; an indiscriminate db push remains inappropriate for the
older consolidated history.
