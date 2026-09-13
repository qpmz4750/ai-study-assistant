"""FastAPI application factory and middleware configuration."""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import router
from app.core.config import settings
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
        allow_origins=list(settings.cors_allowed_origins),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    application.include_router(router)

    return application


app = create_app()
