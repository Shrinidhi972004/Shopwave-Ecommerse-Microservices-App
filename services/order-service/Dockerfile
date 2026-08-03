# STAGE 1 BUILD
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm prune --omit=dev

# STAGE 2 Production
FROM node:20-alpine AS production
ENV NODE_ENV=production
ENV NODE_OPTIONS="--max-old-space-size=256"
WORKDIR /app

RUN addgroup -g 10001 -S appuser \
    && adduser  -u 10001 -S appuser -G appuser

COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json
COPY --from=builder --chown=appuser:appuser /app/server.js    ./server.js
COPY --from=builder --chown=appuser:appuser /app/src          ./src

USER appuser

EXPOSE 4004

HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
    CMD node -e "require('http').get({host:'127.0.0.1',port:4004,path:'/health',timeout:2500},r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
