"""Production ASGI launcher that honours HOST and PORT environment variables."""

import uvicorn

from app.core.config import settings


if __name__ == "__main__":
    uvicorn.run("main:app", host=settings.host, port=settings.port)
