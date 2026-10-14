# Campus Customs Agent Desk

This submission contains the Campus Customs MCP server, a Pydantic AI agent team, a FastAPI backend, and a React dashboard. The real `.env` file is not included. Create one from `.env.example` and add your own Portkey API key.

## Set up Python and credentials

From the submission folder:

```sh
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

Edit `.env` and replace the placeholder with your `PORTKEY_API_KEY`. The `.gitignore` excludes `.env` and `.venv/` from Git.

## Restore a clean working database

The original database is `data/campus_customs.db`; agent runs use `data/campus_customs_new.db`. To copy the original values into the working database manually, run:

```sh
cp data/campus_customs.db data/campus_customs_new.db
```

On Windows PowerShell, use `Copy-Item data/campus_customs.db data/campus_customs_new.db -Force`.

## Start the MCP server and backend

The MCP server uses stdio. The backend starts it as a child process from `.mcp.json` when the agents load their tools, so it does not run as a separate HTTP service or require a separate terminal.

In a terminal, activate the virtual environment if it is not already active, then start the API:

```sh
cd backend
uvicorn main:app --reload --port 8000
```

## Start the React board

In a second terminal from the submission folder:

```sh
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the terminal, usually `http://localhost:5173`.

## Before a full three-ticket run

Reset the working database before running tickets 101, 102, and 103 together. With the backend running, send the explicit reset request:

```sh
curl -X POST http://localhost:8000/database/reset \
  -H 'Content-Type: application/json' \
  -d '{"confirm_reset":true}'
```

The reset restores `campus_customs_new.db` from the supplied original database. The append-only audit trail is retained.
