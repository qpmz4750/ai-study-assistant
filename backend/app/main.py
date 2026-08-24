"""FastAPI application factory and middleware configuration."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router
from app.core.database import initialize_database


def create_app() -> FastAPI:
    """Build and configure the API application."""
    initialize_database()
    application = FastAPI(
        title="AI Study Assistant API",
        version="1.0.0",
        description="API for study topics, notes, files, quizzes, and AI help.",
    )
    application.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://172.20.10.2:3000",
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    application.include_router(router)
    return application


app = create_app()
