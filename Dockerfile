# Dockerfile para TulaBot
FROM node:20-alpine

# Instalar dependencias del sistema para discord-player y ffmpeg
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    ffmpeg \
    opus \
    opus-dev

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
COPY verificar-*.js ./

# Crear directorios necesarios y ejecutar como usuario no-root
RUN mkdir -p logs data backups && chown -R node:node /app

# Variables de entorno por defecto
ENV NODE_ENV=production

USER node

# Comando por defecto
CMD ["node", "src/index.js"]

