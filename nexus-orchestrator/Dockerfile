# Use the official Node.js 20 slim image as the base
FROM node:20-slim

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker layer caching.
COPY package*.json ./

# Install all dependencies. This is the most reliable way to ensure all packages,
# including compiled ones like bcrypt, are correctly installed.
RUN npm install

# Copy the rest of your application's source code into the container.
COPY . .

# Create and switch to a non-root user for better security.
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nexus
USER nexus

# Expose the port the app runs on
EXPOSE 3000

# The command to run when the container starts using the "dev" script for nodemon.
CMD [ "npm", "run", "dev" ]
