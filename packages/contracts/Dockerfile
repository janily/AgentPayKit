# Hardhat Node Dockerfile
FROM node:22-alpine

WORKDIR /app

# Install wget for healthchecks
RUN apk add --no-cache wget && corepack enable

# Copy the workspace before installing from its shared lockfile.
COPY . ./
RUN pnpm install --frozen-lockfile

# Expose Hardhat node port
EXPOSE 8545

# Health check
HEALTHCHECK --interval=5s --timeout=3s --retries=10 --start-period=10s \
  CMD wget --spider -q http://localhost:8545 || exit 1

# Start Hardhat node
CMD ["pnpm", "--filter", "@paybot/contracts", "run", "node"]
