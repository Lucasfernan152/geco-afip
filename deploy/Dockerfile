# ============================================
# Multi-stage Dockerfile for GECO AFIP Service
# ============================================

# ====== Stage 1: Build ======
FROM node:18-alpine AS builder

WORKDIR /app

# Copiar package files
COPY package*.json ./
COPY tsconfig.json ./

# Instalar dependencias (incluyendo dev para compilar)
RUN npm ci

# Copiar código fuente
COPY src/ ./src/

# Compilar TypeScript
RUN npm run build

# ====== Stage 2: Production ======
FROM node:18-alpine

# Instalar curl para healthcheck
RUN apk add --no-cache curl

WORKDIR /app

# Copiar package files
COPY package*.json ./

# Instalar solo dependencias de producción
RUN npm ci --only=production && \
    npm cache clean --force

# Copiar código compilado desde builder
COPY --from=builder /app/dist ./dist

# Crear directorios para certs, cache y logs
RUN mkdir -p /app/certs /app/cache /app/logs && \
    chown -R node:node /app

# Usar usuario no-root
USER node

# Puerto por defecto (será configurado por docker-compose)
EXPOSE 4002

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:${PORT:-4002}/health || exit 1

# Comando de inicio
CMD ["node", "dist/server.js"]

