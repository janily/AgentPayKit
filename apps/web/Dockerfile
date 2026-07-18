# Web Frontend Dockerfile (Multi-stage)
FROM node:22-alpine AS base

WORKDIR /app

# Install wget for healthchecks
RUN apk add --no-cache wget && corepack enable

# Copy the workspace before installing from its shared lockfile.
COPY . ./
RUN pnpm install --frozen-lockfile

# Build x402 package
RUN pnpm --filter @paybot/x402 run build

# Build contracts package
RUN pnpm --filter @paybot/contracts run compile

# Development stage
WORKDIR /app
FROM base AS development

# Expose Vite dev server port
EXPOSE 5173

# Start Vite dev server
CMD ["pnpm", "--filter", "@paybot/web", "run", "dev", "--", "--host", "0.0.0.0"]

# Production build stage
FROM base AS builder

# Build the application
RUN pnpm --filter @paybot/web run build

# Production stage
FROM node:22-alpine AS production

WORKDIR /app

# Install wget for healthchecks and serve for static file serving
RUN apk add --no-cache wget && npm install --global serve

# Copy built files from builder
COPY --from=builder /app/apps/web/dist ./dist

EXPOSE 5173

# Serve static files
CMD ["serve", "-s", "dist", "-l", "5173"]
