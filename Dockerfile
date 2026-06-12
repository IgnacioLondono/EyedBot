# Dockerfile para TulaBot
FROM node:20-alpine

# Instalar dependencias del sistema para discord-player y ffmpeg
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    opus \
    opus-dev \
    su-exec

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias de forma reproducible
RUN npm ci --no-audit --no-fund && \
    npm prune --production && \
    npm cache clean --force

# Copiar código fuente (el catálogo va en src/bundled; data/ se monta en runtime)
COPY src/ ./src/
COPY web/ ./web/
RUN cd web && npm ci --no-audit --no-fund && \
    cd panel && npm ci --no-audit --no-fund && npm run build && cd .. && \
    npm run build:assets && npm prune --production && \
    cd panel && npm prune --production && cd .. && \
    npm cache clean --force
COPY verificar-*.js ./
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh

# Crear directorios necesarios; el entrypoint ajusta permisos de volúmenes montados
RUN chmod +x /usr/local/bin/docker-entrypoint.sh && \
    mkdir -p logs data backups && \
    chown -R node:node /app

# Variables de entorno por defecto
ENV NODE_ENV=production

ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "src/index.js"]

