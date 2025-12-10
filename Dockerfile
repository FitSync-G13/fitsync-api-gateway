# ---------------------------------------
# Stage 1: Builder
# ---------------------------------------
FROM node:18-alpine AS builder

WORKDIR /app

# Copy manifests first to cache dependencies
COPY package*.json ./

RUN npm ci

# Copy source code
COPY . .

# ---------------------------------------
# Stage 2: Runtime
# ---------------------------------------
FROM node:18-alpine

WORKDIR /app

# Set production environment
ENV NODE_ENV=production

# Use the built-in "node" user (UID 1000)
USER node

# Copy dependencies and code from builder
COPY --from=builder --chown=node:node /app .

# Expose the port the API Gateway listens on
EXPOSE 4000

# Use "npm start" for production.
CMD ["npm", "start"]