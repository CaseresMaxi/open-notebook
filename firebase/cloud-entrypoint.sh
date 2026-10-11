#!/bin/sh
set -eu
case "${NEXTNOOTBOOK_SERVICE:-api}" in
  api) service_module=api.main:app ;;
  worker) service_module=api.cloud_worker:app ;;
  *) echo "Unknown NextNootbook service" >&2; exit 1 ;;
esac
exec uvicorn "$service_module" --host 0.0.0.0 --port "${PORT:-8080}" --workers 1
