"""Request models accepted by the API."""

from pydantic import BaseModel


class AuthRequest(BaseModel):
    email: str
    password: str


class TopicCreate(BaseModel):
    title: str
    description: str | None = None


class TopicUpdate(BaseModel):
    title: str
    description: str | None = None


class NoteCreate(BaseModel):
    content: str


class NoteUpdate(BaseModel):
    content: str


class ChatRequest(BaseModel):
    topic_id: int
    message: str


class SummarizeRequest(BaseModel):
    topic_id: int

