# GCSC PostgreSQL Restore Drill

Date created: 2026-05-29

Purpose: prove that GCSC production PostgreSQL backups can be restored before any real-money pilot.

This document intentionally does not include real database URLs, passwords, Railway tokens, or private credentials.

## Required Tools

- PostgreSQL client tools installed locally:
  - `pg_dump`
  - `pg_restore`
  - `psql`
- Access to a non-production PostgreSQL database.
- A local backup file created by:

```powershell
npm --prefix v3 run db:backup
```

## Backup Creation

Set `DATABASE_URL` only in the local terminal session. Do not commit it.

PowerShell example:

```powershell
$env:DATABASE_URL="<production-postgres-connection-string>"
npm --prefix v3 run db:backup
Remove-Item Env:\DATABASE_URL
```

Expected output:

```text
Backup created: C:\gcsc-smart-contractor\backups\gcsc-backup-YYYY-MM-DDTHH-MM-SS-msZ.dump
Backup size: <non-zero> bytes
```

Verify the backup file is ignored by git:

```powershell
git check-ignore backups\gcsc-backup-YYYY-MM-DDTHH-MM-SS-msZ.dump
```

Expected: the backup path is printed.

## Restore Drill Target

Use a separate non-production database. Do not restore into production.

Set the restore target only in the local terminal session:

```powershell
$env:RESTORE_DATABASE_URL="<non-production-postgres-connection-string>"
```

## Restore Command

Replace the backup filename with the local file produced by `db:backup`.

```powershell
pg_restore `
  --dbname "$env:RESTORE_DATABASE_URL" `
  --clean `
  --if-exists `
  --no-owner `
  --no-privileges `
  --verbose `
  "backups\gcsc-backup-YYYY-MM-DDTHH-MM-SS-msZ.dump"
```

Remove the restore target from the shell after the drill:

```powershell
Remove-Item Env:\RESTORE_DATABASE_URL
```

## Post-Restore Verification

Run these against the non-production restore target:

```powershell
psql "$env:RESTORE_DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$env:RESTORE_DATABASE_URL" -c "SELECT COUNT(*) FROM projects;"
psql "$env:RESTORE_DATABASE_URL" -c "SELECT COUNT(*) FROM bids;"
psql "$env:RESTORE_DATABASE_URL" -c "SELECT COUNT(*) FROM user_documents;"
psql "$env:RESTORE_DATABASE_URL" -c "SELECT COUNT(*) FROM audit_events;"
```

Expected:

- Commands complete without connection or schema errors.
- Tables exist.
- Counts are plausible for the backup date.
- No production credentials are printed into committed files.

## Evidence To Record

Create or update `ADMIN-OPERATIONS-EVIDENCE.md` after a successful restore drill.

Record only:

- Date/time.
- Backup filename without credentials.
- Backup size.
- Restore target name, not full connection string.
- Table count summary.
- Any restore errors.
- Confirmation that production was not modified.

Do not record:

- `DATABASE_URL`.
- `RESTORE_DATABASE_URL`.
- Passwords.
- Railway tokens.
- User private data beyond aggregate counts.

## Pass Criteria

- Backup file exists and has non-zero size.
- Backup file is ignored by git.
- Restore completes into non-production PostgreSQL.
- Core tables can be queried.
- Evidence file is committed without secrets.

## Fail Criteria

- `pg_dump` cannot run.
- Backup file is empty.
- Restore fails.
- Restored schema is missing core tables.
- Any secret is written to a tracked file.

