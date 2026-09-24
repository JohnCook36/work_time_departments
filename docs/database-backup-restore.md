# PostgreSQL backup and restore

This runbook covers logical backups for Work time departments. Production hosting may also provide snapshots/PITR; logical dumps are a separate recovery layer, not a replacement for provider backups.

## Security rules

- Treat every dump as sensitive: schedules, employee data and account records may contain PII.
- Store backups only in encrypted access-controlled storage with least-privilege access.
- Never commit dumps to Git. Repository ignores `*.dump` and `*.backup`.
- Do not restore directly over production. Restore into an isolated database first, verify, then plan cutover.
- Do not embed passwords in scripts, shell history, docs or CI logs. Use environment/secret storage.
- Record who created/restored production backups and when, without logging backup contents.

## Backup

Use a PostgreSQL client version compatible with the server.

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner --no-privileges --file=wtd-YYYYMMDD-HHMM.dump
```

After creation:

1. confirm the file is non-empty;
2. calculate a checksum and store it separately;
3. move the dump to encrypted restricted storage;
4. remove local temporary copies.

## Restore verification

Restore into a new empty database, never the live production database:

```bash
createdb "$RESTORE_DATABASE_NAME"
pg_restore --dbname="$RESTORE_DATABASE_URL" --no-owner --no-privileges --exit-on-error wtd-YYYYMMDD-HHMM.dump
```

Then verify:

- Prisma migration history exists;
- core tables are readable;
- expected row counts / synthetic verification data are present;
- application migrations are compatible with the application version being deployed;
- authentication and scoped planner smoke checks pass before any cutover.

## CI recovery smoke

`server/scripts/ci-backup-restore-smoke.sh` runs against the isolated CI PostgreSQL service. It inserts only a synthetic probe row, creates a custom-format dump, restores to a second temporary database, verifies migration history and the probe row, and deletes the restored database/dump.

The CI smoke proves the repository schema can be dumped and restored with PostgreSQL tooling. It does not prove production snapshot retention, cloud-provider permissions, encryption-at-rest or disaster-recovery RTO/RPO; those must be configured and tested in the actual production environment.
