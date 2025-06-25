# Nexus Platform

The Nexus Platform is a multi-service application designed to demonstrate the orchestration of AI agents, knowledge management, and financial processing within a Dockerized environment. It features a central orchestrator, a knowledge engine, and a financial engine, all communicating to provide an integrated experience.

## Features

*   **Nexus Orchestrator (Node.js/Express/Socket.IO):** The brain of the platform, handling user commands, routing requests to specialized agents, and providing a real-time event stream UI.
*   **Knowledge Engine (Python/FastAPI):** Ingests and processes unstructured data (e.g., PDFs, text, images, spreadsheets) to build an intelligent knowledge base using Qdrant (vector database) and LangChain embeddings.
*   **Financial Engine (Python/FastAPI):** Processes structured financial data, capable of ingesting CSV transaction files and providing financial summaries.
*   **PostgreSQL Databases:** Dedicated databases for each service maintain data integrity.
*   **Qdrant:** A high-performance vector database for efficient semantic search in the knowledge base.
*   **Docker Compose:** Simplifies the deployment and management of all services.
*   **Generative AI (Google Gemini):** Utilized by the orchestrator for intelligent command interpretation.

## Getting Started

Follow the comprehensive [Developer's Manual](#developer-s-manual) to set up and run the Nexus Platform.

## Developer's Manual

This section outlines the steps to get the Nexus Platform up and running from a clean state.

### Prerequisites

*   Git
*   Docker and Docker Compose
*   Node.js (for `npm install` to generate `package-lock.json` locally before Docker build)

### Setup

1.  **Clone the Repository:**
    ```bash
    git clone https://github.com/<your-username>/nexus-platform-project.git
    cd nexus-platform-project
    ```
2.  **Configure Environment Variables:**
    Copy the example environment file and fill in your details, including strong passwords and a Google AI API Key.
    ```bash
    cp .env.example .env
    ```
    *Edit `.env` to replace placeholder values.*
3.  **Install Orchestrator Dependencies (local):**
    This generates `package-lock.json` required for Docker build.
    ```bash
    cd nexus-orchestrator
    npm install
    cd ..
    ```
4.  **Build and Launch with Docker Compose:**
    ```bash
    docker-compose up --build
    ```
    The initial build may take several minutes.
5.  **Access the UI:**
    Once all services are running, open your web browser to `http://localhost:3003`.

## Usage

*   **Dashboard:** View real-time event streams of platform activity.
*   **Upload Document:** Ingest PDF files into the Knowledge Engine or CSVs into the Financial Engine.
*   **Submit Task:** Interact with the AI agent using natural language commands (e.g., "What is the capital of France?", "Summarize my spending").

## Contributing

Contributions are welcome! Please follow the standard GitHub flow:
1.  Fork the repository.
2.  Create a new branch (`git checkout -b feature/your-feature-name`).
3.  Make your changes.
4.  Commit your changes (`git commit -m 'feat: Add new feature'`).
5.  Push to the branch (`git push origin feature/your-feature-name`).
6.  Open a Pull Request.

## License

This project is licensed under the [MIT License](LICENSE).

---
