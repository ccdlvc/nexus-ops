FROM node:20-alpine AS builder
WORKDIR /workspace

# Copy shared types first — placed at /workspace/shared/
# so that `../shared` path alias resolves correctly from /workspace/backend/
COPY shared/ ./shared/

# Copy backend manifests and install dependencies
COPY backend/package*.json backend/tsconfig.json backend/tsconfig.test.json ./backend/
WORKDIR /workspace/backend
RUN npm install

# Copy backend source
COPY backend/src ./src
RUN npm run build

# ─── Runner stage ─────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache dumb-init
WORKDIR /app
ENV NODE_ENV=production

COPY --from=builder /workspace/backend/dist ./dist
COPY --from=builder /workspace/backend/node_modules ./node_modules
COPY backend/package.json ./

RUN mkdir -p data logs && chown -R node:node data logs
EXPOSE 4000
USER node
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/backend/src/index.js"]
