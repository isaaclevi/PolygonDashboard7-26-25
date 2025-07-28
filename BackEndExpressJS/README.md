# Express.js TypeScript Real-time Stock Data Server

This is a comprehensive Express.js server written in TypeScript that collects real-time stock data from Polygon.io, stores it in a PostgreSQL database, and provides access to the data through an FTP server for frontend communication.

## Features

- Real-time data collection from Polygon.io using WebSockets
- PostgreSQL database integration with consolidated trades table for all stock data
- FTP server for frontend data access via JSON files (PRIMARY communication channel)
- Real-time data ingestion, aggregation, and JSON file generation
- Polygon.io integration: Live trades, quotes, and minute aggregates via WebSocket
- Comprehensive logging using Winston
- Environment-based configuration using Dotenv
- Data validation using Zod

## Project Structure

```
src/
├── config/
│   ├── database.ts
│   ├── polygon.ts
│   └── ftp.ts
├── models/
│   └── Trades.ts
├── services/
│   ├── PolygonService.ts
│   ├── DatabaseService.ts
│   └── FTPService.ts
├── generators/
│   └── DataFileGenerator.ts
├── middleware/
│   └── errorHandler.ts
├── utils/
│   ├── logger.ts
│   └── validators.ts
├── types/
│   └── index.ts
└── server.ts
```

## Prerequisites

- Node.js (v14 or later)
- PostgreSQL
- PGAdmin (optional)

## Setup and Installation

1.  **Clone the repository:**

    ```bash
    git clone <repository-url>
    cd <repository-name>
    ```

2.  **Install dependencies:**

    ```bash
    npm install
    ```

3.  **Create a `.env` file:**

    Create a `.env` file in the root of the project and add the following environment variables:

    ```
    # Polygon.io
    POLYGON_API_KEY=YOUR_POLYGON_API_KEY

    # PostgreSQL
    DB_HOST=localhost
    DB_PORT=5432
    DB_USER=postgres
    DB_PASSWORD=password
         DB_NAME=stock_data

    # FTP Server
    FTP_PORT=20
    FTP_USER=admin
    FTP_PASS=admin

    # Server
    PORT=3001
    LOG_LEVEL=info
    ```

4.  **Set up the database:**

    - Make sure you have PostgreSQL installed and running.
    - Create a new database with the name specified in the `DB_NAME` environment variable.
    - Run the database initialization script to create the necessary tables and indexes:

    ```bash
    npm run db:init
    ```

## Usage

1.  **Start the server:**

    ```bash
    npm run dev
    ```

    The backend will start and initialize:
    - Database connection to PostgreSQL
    - FTP server for frontend communication (default port 20)
    - WebSocket connection to Polygon.io for real-time data
    - Periodic status file generation and cleanup

2.  **FTP Server (PRIMARY Frontend Interface):**

    - Connect to the FTP server using an FTP client (e.g., FileZilla or programmatic FTP client).
    - **Host:** `localhost`
    - **Port:** `20` (or the port specified in `FTP_PORT`)
    - **Username:** `admin` (or the username specified in `FTP_USER`)
    - **Password:** `admin` (or the password specified in `FTP_PASS`)
    - **LIST:** The `LIST` command will show available JSON data files.
    - **RETR:** Download data files in format: `SYMBOL-TIMEFRAME-STARTDATE-ENDDATE.json`
    - **Real-time Data:** Backend generates files with live Polygon.io data from WebSocket streams
    - **File Formats:** All data files are in JSON format (no CSV support)
    - **Status Monitoring:** Download `status.json` for system health and available symbols

## Docker Configuration

A `Dockerfile` and `docker-compose.yml` are provided for easy deployment.

1.  **Build the Docker image:**

    ```bash
    docker-compose build
    ```

2.  **Run the application:**

    ```bash
    docker-compose up
