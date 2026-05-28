# Dockerfile para Panel Web de TulaBot
FROM node:20-alpine

# Crear directorio de trabajo
WORKDIR /app

# Copiar archivos de dependencias
COPY package*.json ./

# Instalar dependencias (primero todas para compilar dependencias nativas)
# Luego limpiar devDependencies para reducir tamaño de imagen
RUN npm install --no-audit --no-fund && \
    npm prune --production && \
    npm cache clean --force

# Copiar código fuente
COPY public/ ./public/
COPY server.js ./

# Exponer puerto
EXPOSE 3000

# Variables de entorno por defecto
ENV NODE_ENV=production

# Comando por defecto
CMD ["node", "server.js"]

