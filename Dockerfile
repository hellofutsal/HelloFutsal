FROM node:22-alpine AS builder

WORKDIR /app

# Copy only package files first for better layer caching
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

COPY tsconfig*.json ./
COPY src ./src

RUN npm run build

FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy only production dependencies
COPY package*.json ./
RUN npm ci --only=production --no-cache && npm cache clean --force

COPY --from=builder /app/dist ./dist

# Add non-root user for security
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nestjs -u 1001
USER nestjs

EXPOSE 3000

# Health check for Render
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (res) => { process.exit(res.statusCode === 200 ? 0 : 1) })"

CMD ["sh", "-c", "./scripts/conditional-migration.sh && npm run start:prod"]