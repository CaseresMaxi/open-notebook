#!/usr/bin/env bash
# Back up everything the home server keeps locally: every SurrealDB database in
# the namespace (original installation + one per account) and ./notebook_data
# (uploads, chat checkpoints, usage ledger, owner binding).
#
#   scripts/home-backup.sh [destination]   # default: ./backups
set -euo pipefail

cd "$(dirname "$0")/.."
dest="${1:-./backups}/$(date +%Y-%m-%d-%H%M%S)"
mkdir -p "$dest"

ns="${SURREAL_NAMESPACE:-open_notebook}"
user="${SURREAL_USER:-root}"
pass="${SURREAL_PASSWORD:-root}"
db_container="$(docker compose ps -q surrealdb)"
app_container="$(docker compose ps -q open_notebook)"

databases="$(printf 'INFO FOR NS;\n' | docker exec -i "$db_container" /surreal sql \
  --endpoint http://localhost:8000 -u "$user" -p "$pass" --ns "$ns" \
  --hide-welcome --json | grep -o '"[A-Za-z0-9_]*":"DEFINE DATABASE' | cut -d'"' -f2)"

for db in $databases; do
  docker exec "$db_container" /surreal export --endpoint http://localhost:8000 \
    -u "$user" -p "$pass" --ns "$ns" --db "$db" - > "$dest/$db.surql"
done

# The data volume belongs to root inside the container; archive it from there.
docker exec "$app_container" tar -C /app -czf - data > "$dest/notebook_data.tar.gz"

echo "Backup written to $dest"
ls -lh "$dest"
