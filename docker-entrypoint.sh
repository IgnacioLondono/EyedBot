#!/bin/sh
set -e

# Los volúmenes montados desde el host pueden ser propiedad de root; el bot corre como `node`.
for dir in \
    /app/data \
    /app/backups \
    /app/logs \
    /app/web/uploads/welcome \
    /app/web/uploads/verify \
    /app/web/uploads/gacha-catalog
do
    mkdir -p "$dir"
done

chown -R node:node /app/data /app/backups /app/logs /app/web/uploads 2>/dev/null || true

exec su-exec node "$@"
