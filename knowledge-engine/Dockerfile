FROM python:3.10-slim

# Install the system library required by the 'python-magic' package
RUN apt-get update && apt-get install -y libmagic1 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .

# Upgrade pip and install requirements with a longer timeout and retries
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --timeout=100 --retries=5 -r requirements.txt

COPY main.py .

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4000"]
