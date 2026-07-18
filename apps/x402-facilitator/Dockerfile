# X402 Facilitator Dockerfile
FROM node:22-alpine

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

# Expose facilitator port
WORKDIR /app
EXPOSE 8403

# Expose resource server port
EXPOSE 8404

# Health check for facilitator
HEALTHCHECK --interval=10s --timeout=3s --retries=5 --start-period=20s \
  CMD wget --spider -q http://localhost:8403/health || exit 1

# Default: start facilitator (can be overridden with command)
CMD ["pnpm", "--filter", "@paybot/x402-facilitator", "run", "start"]
