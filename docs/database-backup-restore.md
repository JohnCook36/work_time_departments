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


## Pilot production baseline

For the limited MVP pilot, use these operational targets unless the hosting provider gives a stronger guarantee:

- logical encrypted backup at least once every 24 hours;
- target RPO: 24 hours or better;
- target RTO: 4 hours or better;
- default logical-backup rotation: 14 days;
- one named backup owner and one named restore owner;
- failed scheduled backups must produce an operator-visible alert;
- run an isolated restore rehearsal before Gate A is marked complete.

These are internal pilot targets, not statutory retention claims.

### Encrypted backup runner

`server/scripts/production-backup.sh` provides the repository-side production backup primitive. It requires:

- `DATABASE_URL`;
- `BACKUP_DIR`;
- `BACKUP_AGE_RECIPIENT`;
- `BACKUP_RETENTION_DAYS`.

The host must provide compatible `pg_dump`, `age` and `sha256sum`.

Example:

```bash
export DATABASE_URL='postgresql://...'
export BACKUP_DIR='/srv/work-time-departments/backups'
export BACKUP_AGE_RECIPIENT='age1...'
export BACKUP_RETENTION_DAYS='14'
bash server/scripts/production-backup.sh
```

The script creates a custom PostgreSQL dump, encrypts it with age, stores a SHA-256 checksum, removes the raw temporary dump and deletes encrypted backup/checksum files older than the configured rotation.

Scheduling is intentionally an infrastructure responsibility. Use systemd timer, cron or the hosting provider scheduler with least-privilege credentials. The Gate A evidence must contain at least one successful scheduled backup and one isolated restore rehearsal; a repository CI smoke does not substitute for those.
