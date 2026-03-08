FROM node:20-alpine AS builder
WORKDIR /workspace

# Copy shared types — placed at /workspace/shared/
# so that `../shared` path alias resolves correctly from /workspace/dashboard/
COPY shared/ ./shared/

# Copy dashboard manifests and install dependencies
COPY dashboard/package*.json dashboard/tsconfig.json dashboard/vite.config.ts ./dashboard/
WORKDIR /workspace/dashboard
RUN npm install

# Copy dashboard source and public assets
COPY dashboard/src ./src
COPY dashboard/index.html ./
RUN npm run build

# ─── Runner stage ─────────────────────────────────────────────────────────────
FROM nginx:alpine AS runner
COPY --from=builder /workspace/dashboard/dist /usr/share/nginx/html
COPY dashboard/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
