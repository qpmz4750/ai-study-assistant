# Backend

The backend is a FastAPI application. Run it from this directory with:

```powershell
python -m uvicorn main:app --reload
```

## Structure

```text
backend/
|-- app/
|   |-- api/
|   |   `-- router.py # Existing HTTP endpoints
|   |-- core/
|   |   |-- config.py   # Environment-backed settings
|   |   |-- database.py # SQLite connection and schema
|   |   `-- security.py # Passwords, JWT, and authentication
|   |-- models/       # Pydantic request and response schemas
|   |-- services/     # Business logic and external integrations
|   `-- main.py       # Application factory and middleware
|-- tests/            # Automated tests
|-- main.py           # Compatibility entry point
|-- requirements.txt
|-- requirements-dev.txt
`-- .env.example
```

The compatibility entry point keeps `uvicorn main:app` working. New application
setup belongs in `app/main.py`; endpoints belong in `app/api/`; reusable AI and
file-processing logic belongs in `app/services/`.

Install development dependencies and run the tests with:

```powershell
pip install -r requirements-dev.txt
python -m pytest
```
