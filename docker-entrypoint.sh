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

# Tras un corte de luz el NAS/Docker suelen levantar el contenedor antes que el DNS del router.
# Esperamos a que discord.com resuelva para no dejar el bot "apagado" en Discord.
wait_for_dns() {
    host="${1:-discord.com}"
    max="${2:-90}"
    i=0
    echo "⏳ Esperando DNS ($host) tras arranque..."
    while [ "$i" -lt "$max" ]; do
        if getent hosts "$host" >/dev/null 2>&1; then
            echo "✅ DNS listo: $host"
            return 0
        fi
        i=$((i + 1))
        sleep 2
    done
    echo "⚠️ DNS aún no responde tras $((max * 2))s; Node reintentará el login."
    return 0
}

wait_for_dns discord.com 90

exec su-exec node "$@"
