# --- Builder Stage ---
# Use the full Python image which includes build tools like gcc
FROM python:3.10 AS builder

WORKDIR /app
RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

COPY requirements.txt .
# Upgrade pip and install all dependencies into the virtual environment
RUN pip install --no-cache-dir -r requirements.txt


# --- Final Stage ---
# Use the slim image for the final, smaller production image
FROM python:3.10-slim

WORKDIR /app

# Copy the virtual environment from the builder stage
COPY --from=builder /opt/venv /opt/venv
# Copy the source code
COPY main.py .

# Create a non-root user for security
RUN addgroup --system --gid 1001 python
RUN adduser --system --uid 1001 financial
USER financial

# Set the PATH to include the venv, so the 'uvicorn' command is found
ENV PATH="/opt/venv/bin:$PATH"

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "5000"]
