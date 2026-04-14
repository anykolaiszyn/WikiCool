# ============================================================
# Stage 1 — build
# VITE_* env vars must be baked in at build time because Vite
# replaces import.meta.env.* statically during bundling.
# Pass them as --build-arg VITE_FOO=bar when running docker build.
# ============================================================
FROM node:20-alpine AS build

WORKDIR /app

# Install deps first for better layer caching.
COPY package*.json ./
RUN npm ci --ignore-scripts

# Accept all VITE_* build args.
ARG VITE_GITHUB_OWNER
ARG VITE_GITHUB_REPO
ARG VITE_GITHUB_BRANCH=main
ARG VITE_CONTENT_PATH=content
ARG VITE_GITHUB_TOKEN

# Expose them as env vars so Vite picks them up during the build.
ENV VITE_GITHUB_OWNER=$VITE_GITHUB_OWNER \
    VITE_GITHUB_REPO=$VITE_GITHUB_REPO \
    VITE_GITHUB_BRANCH=$VITE_GITHUB_BRANCH \
    VITE_CONTENT_PATH=$VITE_CONTENT_PATH \
    VITE_GITHUB_TOKEN=$VITE_GITHUB_TOKEN

COPY . .
RUN npm run build

# ============================================================
# Stage 2 — serve
# Caddy serves the static SPA and handles client-side routing.
# ============================================================
FROM caddy:2-alpine AS serve

COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile

EXPOSE 8080
