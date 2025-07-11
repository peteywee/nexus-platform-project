# --- Builder Stage ---
# Use the full Python image which includes build tools like gcc
FROM python:3.10 AS builder

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .

# Use a cache mount for the pip cache to speed up subsequent builds
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --timeout=100 --retries=5 -r requirements.txt


# --- Final Stage ---
# Use the slim image for the final, smaller production image
FROM python:3.10-slim
WORKDIR /app

# **THE FIX:** Install the required *system-level* dependency in the final image.
# This must be done before we switch to a non-root user.
# - The 'libmagic1' package is the underlying C library that the 'python-magic' pip package needs to function.
# - We clean up the apt cache afterwards to keep the image size minimal.
RUN apt-get update && \
    apt-get install -y libmagic1 && \
    rm -rf /var/lib/apt/lists/*

# Copy the virtual environment from the builder stage
COPY --from=builder /opt/venv /opt/venv
# Copy the application source code
COPY main.py .

# Create and switch to a non-root user for security
RUN addgroup --system --gid 1001 python && \
    adduser --system --uid 1001 knowledge
USER knowledge

# Set the PATH to include the venv, so commands like 'uvicorn' are found
ENV PATH="/opt/venv/bin:$PATH"

# The command to run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4000"]
