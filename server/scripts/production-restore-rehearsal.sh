#!/usr/bin/env bash
set -euo pipefail

: "${BACKUP_FILE:?BACKUP_FILE is required}"
: "${BACKUP_AGE_IDENTITY:?BACKUP_AGE_IDENTITY is required}"
: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL is required}"

BACKUP_SHA256_FILE="${BACKUP_SHA256_FILE:-${BACKUP_FILE}.sha256}"

command -v age >/dev/null 2>&1 || { echo "age is required" >&2; exit 1; }
command -v sha256sum >/dev/null 2>&1 || { echo "sha256sum is required" >&2; exit 1; }
command -v pg_restore >/dev/null 2>&1 || { echo "pg_restore is required" >&2; exit 1; }
command -v psql >/dev/null 2>&1 || { echo "psql is required" >&2; exit 1; }

[ -f "${BACKUP_FILE}" ] || { echo "Encrypted backup not found" >&2; exit 1; }
[ -f "${BACKUP_SHA256_FILE}" ] || { echo "Checksum file not found" >&2; exit 1; }
[ -f "${BACKUP_AGE_IDENTITY}" ] || { echo "age identity file not found" >&2; exit 1; }

if [ -n "${DATABASE_URL:-}" ] && [ "${DATABASE_URL}" = "${RESTORE_DATABASE_URL}" ]; then
  echo "RESTORE_DATABASE_URL must never equal DATABASE_URL" >&2
  exit 1
fi

existing_tables="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT count(*) FROM pg_tables WHERE schemaname = 'public';")"
if [ "${existing_tables}" != "0" ]; then
  echo "Restore target must be an isolated empty database" >&2
  exit 1
fi

(
  cd "$(dirname "${BACKUP_FILE}")"
  sha256sum -c "$(basename "${BACKUP_SHA256_FILE}")"
)

umask 077
raw_dump="$(mktemp "${TMPDIR:-/tmp}/wtd-restore-rehearsal.XXXXXX.dump")"
cleanup() {
  rm -f "${raw_dump}"
}
trap cleanup EXIT

started_epoch="$(date +%s)"
started_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

age -d -i "${BACKUP_AGE_IDENTITY}" -o "${raw_dump}" "${BACKUP_FILE}"

pg_restore \
  --dbname="${RESTORE_DATABASE_URL}" \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  "${raw_dump}"

migration_table="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT to_regclass('public._prisma_migrations') IS NOT NULL;")"
department_table="$(psql "${RESTORE_DATABASE_URL}" -Atqc "SELECT to_regclass('public.\"Department\"') IS NOT NULL;")"

if [ "${migration_table}" != "t" ] || [ "${department_table}" != "t" ]; then
  echo "Restore verification failed: required schema objects are missing" >&2
  exit 1
fi

psql "${RESTORE_DATABASE_URL}" -v ON_ERROR_STOP=1 -Atqc 'SELECT count(*) FROM "_prisma_migrations";' >/dev/null
psql "${RESTORE_DATABASE_URL}" -v ON_ERROR_STOP=1 -Atqc 'SELECT count(*) FROM "Department";' >/dev/null

finished_epoch="$(date +%s)"
finished_utc="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
duration="$((finished_epoch - started_epoch))"

echo "Gate A restore rehearsal: PASS"
echo "Started (UTC): ${started_utc}"
echo "Finished (UTC): ${finished_utc}"
echo "RESTORE_REHEARSAL_SECONDS=${duration}"
echo "Verified: checksum -> age decrypt -> isolated pg_restore -> Prisma migration/core-table readability"
echo "Restore target is intentionally left intact for operator inspection; delete it after evidence is recorded."
