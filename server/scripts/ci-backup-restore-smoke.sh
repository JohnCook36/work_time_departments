#!/usr/bin/env bash
set -euo pipefail

SOURCE_DB="${BACKUP_SMOKE_SOURCE_DB:-work_time_departments_test}"
RESTORE_DB="${BACKUP_SMOKE_RESTORE_DB:-work_time_departments_restore}"
DB_USER="${BACKUP_SMOKE_DB_USER:-ci}"
POSTGRES_PUBLISHED_PORT="${BACKUP_SMOKE_POSTGRES_PUBLISHED_PORT:-5432}"
PROBE_ID="backup-restore-probe"
DUMP_PATH="${RUNNER_TEMP:-/tmp}/work_time_departments-backup-smoke.dump"

container_id="$(
  docker ps \
    --filter ancestor=postgres:17-alpine \
    --filter "publish=${POSTGRES_PUBLISHED_PORT}" \
    --format '{{.ID}}' \
    | head -n 1
)"

if [[ -z "${container_id}" ]]; then
  echo "PostgreSQL service container published on port ${POSTGRES_PUBLISHED_PORT} was not found" >&2
  exit 1
fi

docker exec "${container_id}" \
  psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${SOURCE_DB}" \
  -c "INSERT INTO \"Department\" (\"id\", \"name\", \"kind\", \"position\", \"isActive\", \"createdAt\", \"updatedAt\")
      VALUES ('${PROBE_ID}', 'Backup restore probe', 'GENERAL', 9999, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (\"id\") DO UPDATE SET \"name\" = EXCLUDED.\"name\", \"updatedAt\" = CURRENT_TIMESTAMP;"

docker exec "${container_id}" \
  pg_dump \
  -U "${DB_USER}" \
  -d "${SOURCE_DB}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  > "${DUMP_PATH}"

if [[ ! -s "${DUMP_PATH}" ]]; then
  echo "Backup dump is empty" >&2
  exit 1
fi

docker exec "${container_id}" dropdb -U "${DB_USER}" --if-exists "${RESTORE_DB}"
docker exec "${container_id}" createdb -U "${DB_USER}" "${RESTORE_DB}"

cat "${DUMP_PATH}" | docker exec -i "${container_id}" \
  pg_restore \
  -U "${DB_USER}" \
  -d "${RESTORE_DB}" \
  --no-owner \
  --no-privileges \
  --exit-on-error

probe_name="$(
  docker exec "${container_id}" \
    psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${RESTORE_DB}" -Atc \
    "SELECT \"name\" FROM \"Department\" WHERE \"id\" = 'backup-restore-probe';"
)"

migration_count="$(
  docker exec "${container_id}" \
    psql -v ON_ERROR_STOP=1 -U "${DB_USER}" -d "${RESTORE_DB}" -Atc \
    'SELECT COUNT(*) FROM "_prisma_migrations";'
)"

if [[ "${probe_name}" != "Backup restore probe" ]]; then
  echo "Restored database is missing the synthetic probe row" >&2
  exit 1
fi

if [[ ! "${migration_count}" =~ ^[0-9]+$ ]] || (( migration_count < 1 )); then
  echo "Restored database is missing Prisma migration history" >&2
  exit 1
fi

docker exec "${container_id}" dropdb -U "${DB_USER}" --if-exists "${RESTORE_DB}"
rm -f "${DUMP_PATH}"

echo "Backup/restore smoke passed: schema history and synthetic data restored."
