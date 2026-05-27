#!/bin/sh
set -e

# Los volúmenes montados desde el host pueden ser propiedad de root; el bot corre como `node`.
for dir in \
    /app/data \
    /app/backups \
    /app/logs \
    /app/web/public/uploads/welcome \
    /app/web/public/uploads/verify \
    /app/web/public/uploads/gacha-catalog
do
    mkdir -p "$dir"
done

chown -R node:node /app/data /app/backups /app/logs /app/web/public/uploads 2>/dev/null || true

exec su-exec node "$@"
