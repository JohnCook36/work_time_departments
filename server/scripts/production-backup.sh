#!/usr/bin/env bash
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DIR:?BACKUP_DIR is required}"
: "${BACKUP_AGE_RECIPIENT:?BACKUP_AGE_RECIPIENT is required}"
: "${BACKUP_RETENTION_DAYS:?BACKUP_RETENTION_DAYS is required}"

if ! [[ "${BACKUP_RETENTION_DAYS}" =~ ^[0-9]+$ ]] || [ "${BACKUP_RETENTION_DAYS}" -lt 1 ]; then
  echo "BACKUP_RETENTION_DAYS must be a positive integer" >&2
  exit 1
fi

command -v pg_dump >/dev/null 2>&1 || {
  echo "pg_dump is required" >&2
  exit 1
}
command -v age >/dev/null 2>&1 || {
  echo "age is required for encrypted production backups" >&2
  exit 1
}
command -v sha256sum >/dev/null 2>&1 || {
  echo "sha256sum is required" >&2
  exit 1
}

umask 077
mkdir -p "${BACKUP_DIR}"

timestamp="$(date -u +%Y%m%d-%H%M%S)"
base="${BACKUP_DIR%/}/wtd-${timestamp}"
raw="${base}.dump"
encrypted="${base}.dump.age"
checksum="${encrypted}.sha256"

cleanup() {
  rm -f "${raw}"
}
trap cleanup EXIT

pg_dump "${DATABASE_URL}"   --format=custom   --no-owner   --no-privileges   --file="${raw}"

if [ ! -s "${raw}" ]; then
  echo "pg_dump produced an empty backup" >&2
  exit 1
fi

age -r "${BACKUP_AGE_RECIPIENT}" -o "${encrypted}" "${raw}"
sha256sum "${encrypted}" > "${checksum}"

find "${BACKUP_DIR}" -maxdepth 1 -type f   \( -name 'wtd-*.dump.age' -o -name 'wtd-*.dump.age.sha256' \)   -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "Encrypted backup created: ${encrypted}"
