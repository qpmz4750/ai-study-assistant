"""Compatibility entry point for ``uvicorn main:app``.

New backend code belongs in the :mod:`app` package.
"""

from app.main import app

__all__ = ["app"]

