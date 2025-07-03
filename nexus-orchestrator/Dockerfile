# --- Build Stage: For Development and Production Dependencies ---
# We use a build stage to compile any native add-ons (like bcrypt).
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
# Use 'npm install' here instead of 'npm ci' to ensure it can build from package.json if needed,
# which is more robust for creating a complete node_modules directory.
RUN npm install

# --- Production Stage: The Final, Lean Image ---
FROM node:20-slim AS final
WORKDIR /app

# Create a non-root user for enhanced security.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nexus

# Copy the fully built node_modules from the builder stage.
# This copies EVERYTHING, including the compiled bcrypt.
COPY --from=builder /app/node_modules ./node_modules

# Copy the package manifests. They are needed for npm to run the start script.
COPY package*.json ./

# Copy the rest of the application source code.
COPY . .

# Switch to the non-root user.
USER nexus

EXPOSE 3000

# Use the 'start' script from package.json, which runs 'node src/server.js' directly.
CMD [ "npm", "start" ]
