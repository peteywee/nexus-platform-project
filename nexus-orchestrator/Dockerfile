# --- Build Stage ---
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
# Install ALL dependencies, including dev dependencies, to ensure build steps work if needed
# And then prune the dev dependencies to leave only what's needed for production.
RUN npm install -g npm@latest && \
    npm ci && \
    npm prune --omit=dev

# --- Production Stage ---
FROM node:20-slim AS final
WORKDIR /app

# Create a non-root user for security
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nexus
USER nexus

# Copy only the necessary files from the builder stage and local context
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY . .

EXPOSE 3000

# Use the 'start' script which calls node directly, not nodemon
CMD [ "npm", "start" ]
