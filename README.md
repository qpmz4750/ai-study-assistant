# AI Study Assistant

A full-stack study assistant with a FastAPI API and a Next.js web client.

## Project layout

```text
first project/
|-- backend/             # FastAPI application
|   |-- main.py          # Current API entry point
|   |-- requirements.txt # Python dependencies
|   `-- .env.example     # Safe configuration template
|-- frontend/            # Next.js application
|   |-- app/             # Routes and route-level UI
|   |-- public/          # Static assets
|   `-- package.json     # Frontend commands and dependencies
|-- docs/                # Requirements and project documentation
|-- .gitignore           # Generated/private files excluded from Git
`-- README.md
```

Generated folders such as `node_modules`, `.next`, and `__pycache__`, plus local
databases, logs, and `.env` files, are intentionally not source code and should
not be committed.

## Run locally

### Backend

```powershell
cd backend
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
python -m uvicorn main:app --reload
```

The API is available at `http://127.0.0.1:8000`.

### Frontend

In another terminal:

```powershell
cd frontend
npm install
npm run dev
```

The web app is available at `http://localhost:3000`.

## Recommended next backend split

As the API grows, migrate `backend/main.py` into a package without changing its
public routes:

```text
backend/app/
|-- main.py              # App creation and middleware only
|-- core/config.py       # Environment-backed settings
|-- db/database.py       # SQLite connection and initialization
|-- models/schemas.py    # Pydantic request/response models
|-- routers/             # auth, topics, notes, files, ai
|-- services/            # AI and file-processing logic
`-- security/            # Passwords, JWT, and rate limiting
```

Add tests before that migration so behavior can be verified while code moves.

