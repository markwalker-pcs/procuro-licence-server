# Pro-curo Licence Server — Dockerfile
# Multi-stage build for production-ready image

# ─── Stage 1: Build ───
FROM node:20-alpine AS builder

# Prisma requires OpenSSL on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Install dependencies first (layer caching)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy Prisma schema and generate client
COPY prisma ./prisma
RUN npx prisma generate

# Copy source and build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ─── Stage 2: Production ───
FROM node:20-alpine AS production

# Prisma requires OpenSSL on Alpine
RUN apk add --no-cache openssl

WORKDIR /app

# Security: Run as non-root user
RUN addgroup -g 1001 -S procuro && \
    adduser -S procuro -u 1001 -G procuro

# Install all dependencies (including tsx for seeding in dev)
COPY package.json package-lock.json* ./
RUN npm ci

# Copy Prisma schema and generate client for production
COPY prisma ./prisma
RUN npx prisma generate

# Copy built application
COPY --from=builder /app/dist ./dist

# Create keys directory for dev keypair generation
RUN mkdir -p /app/keys

# Set ownership
RUN chown -R procuro:procuro /app

USER procuro

# Expose port (matches .env default)
EXPOSE 3100

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3100/health || exit 1

# Run Prisma migrations then start server
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/index.js"]
