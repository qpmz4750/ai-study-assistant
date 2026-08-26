import json
import logging
import os
import secrets
import sqlite3
import time
from collections import defaultdict, deque
from threading import Lock
from app.services.rag import (
    add_document,
    search_topic,
    delete_file_chunks,
    build_grounded_prompt,
)
from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from google import genai
from pypdf import PdfReader

from app.core.database import get_db_connection
from app.core.security import (
    create_access_token,
    get_current_user_id,
    hash_password,
    verify_password,
)
from app.models.schemas import (
    AuthRequest,
    ChatRequest,
    NoteCreate,
    NoteUpdate,
    SummarizeRequest,
    TopicCreate,
    TopicUpdate,
)

logger = logging.getLogger(__name__)

RATE_LIMIT_WINDOW_SECONDS = 60
DEFAULT_RATE_LIMIT_PER_MINUTE = 10


MAX_UPLOAD_BYTES = 10 * 1024 * 1024


def _extract_text_from_upload(filename: str, file_bytes: bytes) -> str:
    extension = os.path.splitext(filename.lower())[1]

    if extension == ".txt":
        for encoding in ("utf-8", "utf-8-sig", "cp1256", "latin-1"):
            try:
                return file_bytes.decode(encoding).strip()
            except UnicodeDecodeError:
                continue
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Could not read the TXT file.",
        )

    if extension == ".pdf":
        try:
            import io

            reader = PdfReader(io.BytesIO(file_bytes))
            pages = []

            for page in reader.pages:
                text = page.extract_text() or ""
                if text.strip():
                    pages.append(text.strip())

            extracted = "\n\n".join(pages).strip()

            if not extracted:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        "No readable text was found in this PDF. "
                        "Scanned/image-only PDFs are not supported yet."
                    ),
                )

            return extracted

        except HTTPException:
            raise
        except Exception:
            logger.exception("Failed to read uploaded PDF")
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Could not read the PDF file.",
            )

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Only PDF and TXT files are supported.",
    )


def _get_topic_context(
    connection: sqlite3.Connection,
    topic_id: int,
    user_id: int,
):
    topic = connection.execute(
        """
        SELECT id, title, description
        FROM topics
        WHERE id = ? AND user_id = ?
        """,
        (topic_id, user_id),
    ).fetchone()

    if topic is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Topic not found.",
        )

    notes = connection.execute(
        """
        SELECT content
        FROM notes
        WHERE topic_id = ?
        ORDER BY created_at
        """,
        (topic_id,),
    ).fetchall()

    files = connection.execute(
        """
        SELECT filename, extracted_text
        FROM topic_files
        WHERE topic_id = ?
        ORDER BY created_at
        """,
        (topic_id,),
    ).fetchall()

    notes_context = "\n".join(
        note["content"] for note in notes if note["content"]
    ).strip()

    files_context_parts = []
    for item in files:
        files_context_parts.append(
            f"ملف: {item['filename']}\n{item['extracted_text']}"
        )

    files_context = "\n\n".join(files_context_parts).strip()

    return topic, notes_context, files_context


def _get_rate_limit() -> int:
    raw_value = os.getenv(
        "RATE_LIMIT_REQUESTS_PER_MINUTE",
        str(DEFAULT_RATE_LIMIT_PER_MINUTE),
    )
    try:
        value = int(raw_value)
        if value < 1:
            raise ValueError
        return value
    except ValueError:
        logger.warning(
            "Invalid RATE_LIMIT_REQUESTS_PER_MINUTE; using the default value %s",
            DEFAULT_RATE_LIMIT_PER_MINUTE,
        )
        return DEFAULT_RATE_LIMIT_PER_MINUTE


RATE_LIMIT_PER_MINUTE = _get_rate_limit()
request_times: dict[str, deque[float]] = defaultdict(deque)
rate_limit_lock = Lock()

router = APIRouter()


def _enforce_rate_limit(request: Request) -> None:
    # Use the connected client's IP. Forwarded headers should only be trusted when
    # the application is deployed behind a correctly configured trusted proxy.
    user_id = request.client.host if request.client else "unknown"
    now = time.monotonic()
    window_start = now - RATE_LIMIT_WINDOW_SECONDS

    with rate_limit_lock:
        timestamps = request_times[user_id]
        while timestamps and timestamps[0] <= window_start:
            timestamps.popleft()

        if len(timestamps) >= RATE_LIMIT_PER_MINUTE:
            retry_after = max(
                1,
                int(RATE_LIMIT_WINDOW_SECONDS - (now - timestamps[0])) + 1,
            )
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests. Please try again later.",
                headers={"Retry-After": str(retry_after)},
            )

        timestamps.append(now)


@router.get(
    "/",
    summary="Check API health",
    description="Confirm that the AI Study Assistant API is running.",
    response_description="A service availability message.",
    tags=["general"],
)
def home():
    """Return a basic service health message.

    Authentication is not required. The endpoint accepts no body or parameters.
    Responses: 200 when the service is running.
    """
    return {"message": "AI Study Assistant is running"}


@router.post(
    "/auth/register",
    summary="Register a user",
    description="Create a user account and return a bearer access token.",
    response_description="A bearer access token for the new user.",
    tags=["auth"],
)
def register(auth: AuthRequest):
    """Create a user account from an email and password.

    Authentication is not required. The JSON body must match ``AuthRequest``.
    Responses: 200 on success; 400 if the email is already registered; 422 if
    the request body is invalid.
    """
    with get_db_connection() as connection:
        existing_user = connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (auth.email,),
        ).fetchone()
        if existing_user:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already registered.",
            )

        try:
            cursor = connection.execute(
                "INSERT INTO users (email, password_hash) VALUES (?, ?)",
                (auth.email, hash_password(auth.password)),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email is already registered.",
            )

    return {
        "access_token": create_access_token(cursor.lastrowid),
        "token_type": "bearer",
    }


@router.post(
    "/auth/login",
    summary="Log in a user",
    description="Validate user credentials and return a bearer access token.",
    response_description="A bearer access token for the authenticated user.",
    tags=["auth"],
)
def login(auth: AuthRequest):
    """Authenticate a user with an email and password.

    Authentication is not required. The JSON body must match ``AuthRequest``.
    Responses: 200 on success; 401 for invalid credentials; 422 if the request
    body is invalid.
    """
    with get_db_connection() as connection:
        user = connection.execute(
            "SELECT id, password_hash FROM users WHERE email = ?",
            (auth.email,),
        ).fetchone()

    if not user or not verify_password(auth.password, user["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return {
        "access_token": create_access_token(user["id"]),
        "token_type": "bearer",
    }


@router.post(
    "/topics",
    summary="Create a topic",
    description="Create a study topic owned by the authenticated user.",
    response_description="The newly created topic.",
    tags=["topics"],
)
def create_topic(
    topic: TopicCreate,
    user_id: int = Depends(get_current_user_id),
):
    """Create a study topic for the current user.

    Bearer authentication is required. The JSON body must match
    ``TopicCreate``. Responses: 200 on success; 401 if authentication fails;
    422 if the request body is invalid.
    """
    with get_db_connection() as connection:
        cursor = connection.execute(
            "INSERT INTO topics (user_id, title, description) VALUES (?, ?, ?)",
            (user_id, topic.title, topic.description),
        )
        created_topic = connection.execute(
            """
            SELECT id, title, description, created_at
            FROM topics
            WHERE id = ? AND user_id = ?
            """,
            (cursor.lastrowid, user_id),
        ).fetchone()

    return dict(created_topic)


@router.get(
    "/topics",
    summary="List topics",
    description="List all study topics owned by the authenticated user.",
    response_description="The authenticated user's topics, newest first.",
    tags=["topics"],
)
def list_topics(user_id: int = Depends(get_current_user_id)):
    """Return all topics belonging to the current user.

    Bearer authentication is required. No body or parameters are accepted.
    Responses: 200 with a topic list; 401 if authentication fails.
    """
    with get_db_connection() as connection:
        topics = connection.execute(
            """
            SELECT id, title, description, created_at
            FROM topics
            WHERE user_id = ?
            ORDER BY created_at DESC
            """,
            (user_id,),
        ).fetchall()

    return [dict(topic) for topic in topics]


@router.get(
    "/topics/{topic_id}",
    summary="Get a topic",
    description="Retrieve one study topic owned by the authenticated user.",
    response_description="The requested topic.",
    tags=["topics"],
)
def get_topic(
    topic_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Return a topic identified by the integer ``topic_id`` path parameter.

    Bearer authentication is required. Responses: 200 with the topic; 401 if
    authentication fails; 404 if the topic is absent or not owned by the user;
    422 if ``topic_id`` is invalid.
    """
    with get_db_connection() as connection:
        topic = connection.execute(
            """
            SELECT id, title, description, created_at
            FROM topics
            WHERE id = ? AND user_id = ?
            """,
            (topic_id, user_id),
        ).fetchone()

    if topic is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return dict(topic)


@router.put(
    "/topics/{topic_id}",
    summary="Update a topic",
    description="Replace the title and description of an owned study topic.",
    response_description="The updated topic.",
    tags=["topics"],
)
def update_topic(
    topic_id: int,
    topic: TopicUpdate,
    user_id: int = Depends(get_current_user_id),
):
    """Update the topic selected by the integer ``topic_id`` path parameter.

    Bearer authentication is required. The JSON body must match
    ``TopicUpdate``. Responses: 200 with the updated topic; 401 if
    authentication fails; 404 if the topic is absent or not owned by the user;
    422 if the path parameter or body is invalid.
    """
    with get_db_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE topics
            SET title = ?, description = ?
            WHERE id = ? AND user_id = ?
            """,
            (topic.title, topic.description, topic_id, user_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        updated_topic = connection.execute(
            """
            SELECT id, title, description, created_at
            FROM topics
            WHERE id = ? AND user_id = ?
            """,
            (topic_id, user_id),
        ).fetchone()

    return dict(updated_topic)


@router.delete(
    "/topics/{topic_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a topic",
    description="Delete an owned study topic and its associated notes.",
    response_description="No content after successful deletion.",
    tags=["topics"],
)
def delete_topic(
    topic_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Delete the topic selected by the integer ``topic_id`` path parameter.

    Bearer authentication is required. Responses: 204 when deleted; 401 if
    authentication fails; 404 if the topic is absent or not owned by the user;
    422 if ``topic_id`` is invalid.
    """
    with get_db_connection() as connection:
        cursor = connection.execute(
            "DELETE FROM topics WHERE id = ? AND user_id = ?",
            (topic_id, user_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/topics/{topic_id}/notes",
    summary="Create a note",
    description="Add a note to an owned study topic.",
    response_description="The newly created note.",
    tags=["notes"],
)
def create_note(
    topic_id: int,
    note: NoteCreate,
    user_id: int = Depends(get_current_user_id),
):
    """Create a note under the integer ``topic_id`` path parameter.

    Bearer authentication is required. The JSON body must match ``NoteCreate``.
    Responses: 200 with the new note; 401 if authentication fails; 404 if the
    topic is absent or not owned by the user; 422 if the path or body is invalid.
    """
    with get_db_connection() as connection:
        topic = connection.execute(
            "SELECT id FROM topics WHERE id = ? AND user_id = ?",
            (topic_id, user_id),
        ).fetchone()
        if topic is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

        cursor = connection.execute(
            "INSERT INTO notes (topic_id, content) VALUES (?, ?)",
            (topic_id, note.content),
        )
        created_note = connection.execute(
            """
            SELECT n.id, n.topic_id, n.content, n.created_at, n.updated_at
            FROM notes AS n
            JOIN topics AS t ON t.id = n.topic_id
            WHERE n.id = ? AND t.user_id = ?
            """,
            (cursor.lastrowid, user_id),
        ).fetchone()

    return dict(created_note)


@router.get(
    "/topics/{topic_id}/notes",
    summary="List topic notes",
    description="List notes belonging to an owned study topic.",
    response_description="The topic's notes, newest first.",
    tags=["notes"],
)
def list_notes(
    topic_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """List notes under the integer ``topic_id`` path parameter.

    Bearer authentication is required. Responses: 200 with a note list; 401 if
    authentication fails; 404 if the topic is absent or not owned by the user;
    422 if ``topic_id`` is invalid.
    """
    with get_db_connection() as connection:
        topic = connection.execute(
            "SELECT id FROM topics WHERE id = ? AND user_id = ?",
            (topic_id, user_id),
        ).fetchone()
        if topic is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

        notes = connection.execute(
            """
            SELECT n.id, n.topic_id, n.content, n.created_at, n.updated_at
            FROM notes AS n
            JOIN topics AS t ON t.id = n.topic_id
            WHERE n.topic_id = ? AND t.user_id = ?
            ORDER BY n.created_at DESC
            """,
            (topic_id, user_id),
        ).fetchall()

    return [dict(note) for note in notes]


@router.put(
    "/notes/{note_id}",
    summary="Update a note",
    description="Replace the content of a note owned by the authenticated user.",
    response_description="The updated note.",
    tags=["notes"],
)
def update_note(
    note_id: int,
    note: NoteUpdate,
    user_id: int = Depends(get_current_user_id),
):
    """Update the note selected by the integer ``note_id`` path parameter.

    Bearer authentication is required. The JSON body must match ``NoteUpdate``.
    Responses: 200 with the updated note; 401 if authentication fails; 404 if
    the note is absent or not owned by the user; 422 if the path or body is invalid.
    """
    with get_db_connection() as connection:
        cursor = connection.execute(
            """
            UPDATE notes
            SET content = ?, updated_at = CURRENT_TIMESTAMP
            WHERE id = ? AND topic_id IN (
                SELECT id FROM topics WHERE user_id = ?
            )
            """,
            (note.content, note_id, user_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
        updated_note = connection.execute(
            """
            SELECT n.id, n.topic_id, n.content, n.created_at, n.updated_at
            FROM notes AS n
            JOIN topics AS t ON t.id = n.topic_id
            WHERE n.id = ? AND t.user_id = ?
            """,
            (note_id, user_id),
        ).fetchone()

    return dict(updated_note)


@router.delete(
    "/notes/{note_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a note",
    description="Delete a note owned by the authenticated user.",
    response_description="No content after successful deletion.",
    tags=["notes"],
)
def delete_note(
    note_id: int,
    user_id: int = Depends(get_current_user_id),
):
    """Delete the note selected by the integer ``note_id`` path parameter.

    Bearer authentication is required. Responses: 204 when deleted; 401 if
    authentication fails; 404 if the note is absent or not owned by the user;
    422 if ``note_id`` is invalid.
    """
    with get_db_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM notes
            WHERE id = ? AND topic_id IN (
                SELECT id FROM topics WHERE user_id = ?
            )
            """,
            (note_id, user_id),
        )
        if cursor.rowcount == 0:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/topics/{topic_id}/files",
    summary="Upload a topic file",
    description="Upload a PDF or TXT file and store its extracted text as topic context.",
    tags=["files"],
)
async def upload_topic_file(
    topic_id: int,
    file: UploadFile = File(...),
    user_id: int = Depends(get_current_user_id),
):
    filename = (file.filename or "").strip()

    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="File name is missing.",
        )

    extension = os.path.splitext(filename.lower())[1]
    if extension not in {".pdf", ".txt"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF and TXT files are supported.",
        )

    file_bytes = await file.read()

    if not file_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The uploaded file is empty.",
        )

    if len(file_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File is too large. Maximum size is 10 MB.",
        )

    extracted_text = _extract_text_from_upload(filename, file_bytes)

    with get_db_connection() as connection:
        topic = connection.execute(
            "SELECT id FROM topics WHERE id = ? AND user_id = ?",
            (topic_id, user_id),
        ).fetchone()

        if topic is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Topic not found.",
            )

        cursor = connection.execute(
            """
            INSERT INTO topic_files (
                topic_id,
                filename,
                content_type,
                extracted_text
            )
            VALUES (?, ?, ?, ?)
            """,
            (
                topic_id,
                filename,
                file.content_type,
                extracted_text,
            ),
        )

        created = connection.execute(
            """
            SELECT id, topic_id, filename, content_type, created_at
            FROM topic_files
            WHERE id = ?
            """,
            (cursor.lastrowid,),
        ).fetchone()

    add_document(
        topic_id=topic_id,
        file_id=created["id"],
        filename=filename,
        text=extracted_text,
    )

    return {
        **dict(created),
        "characters": len(extracted_text),
    }


@router.get(
    "/topics/{topic_id}/files",
    summary="List topic files",
    tags=["files"],
)
def list_topic_files(
    topic_id: int,
    user_id: int = Depends(get_current_user_id),
):
    with get_db_connection() as connection:
        topic = connection.execute(
            "SELECT id FROM topics WHERE id = ? AND user_id = ?",
            (topic_id, user_id),
        ).fetchone()

        if topic is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Topic not found.",
            )

        files = connection.execute(
            """
            SELECT id, topic_id, filename, content_type, created_at
            FROM topic_files
            WHERE topic_id = ?
            ORDER BY created_at DESC
            """,
            (topic_id,),
        ).fetchall()

    return [dict(item) for item in files]


@router.delete(
    "/topic-files/{file_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete a topic file",
    tags=["files"],
)
def delete_topic_file(
    file_id: int,
    user_id: int = Depends(get_current_user_id),
):
    with get_db_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM topic_files
            WHERE id = ?
              AND topic_id IN (
                  SELECT id FROM topics WHERE user_id = ?
              )
            """,
            (file_id, user_id),
        )

        if cursor.rowcount == 0:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="File not found.",
            )

    delete_file_chunks(file_id)

    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/ai/summarize",
    summary="Summarize topic",
    description="Generate an AI summary using the topic title, description, notes, and uploaded files.",
    response_description="An AI-generated summary associated with the topic.",
    tags=["ai"],
)
def summarize_topic(
    summarize_request: SummarizeRequest,
    request: Request,
    user_id: int = Depends(get_current_user_id),
):
    _enforce_rate_limit(request)

    with get_db_connection() as connection:
        topic, notes_context, files_context = _get_topic_context(
            connection,
            summarize_request.topic_id,
            user_id,
        )

    prompt = build_grounded_prompt(
        question=(
            "لخص محتوى هذا الموضوع باللغة العربية بشكل واضح ومنظم. "
            "إذا كانت هناك ملفات مرفوعة، فالتزم بمحتواها كما هو ولا تصححه "
            "ولا تعارضه بمعرفة خارجية."
        ),
        file_context=files_context,
        notes_context=notes_context,
        topic_title=topic["title"],
        topic_description=topic["description"] or "",
    )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is not configured.",
        )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt,
        )
        summary = response.text
        if not summary:
            raise ValueError("Gemini returned an empty response")
    except Exception:
        logger.exception("Gemini request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI service could not answer the request.",
        )

    return {
        "topic_id": summarize_request.topic_id,
        "summary": summary,
    }


@router.post(
    "/ai/explain/{topic_id}",
    summary="Explain topic",
    description="Generate a beginner-friendly AI explanation using topic context.",
    response_description="An AI-generated explanation associated with the topic.",
    tags=["ai"],
)
def explain_topic(
    topic_id: int,
    request: Request,
    user_id: int = Depends(get_current_user_id),
):
    _enforce_rate_limit(request)

    with get_db_connection() as connection:
        topic, notes_context, files_context = _get_topic_context(
            connection,
            topic_id,
            user_id,
        )

    prompt = build_grounded_prompt(
        question=(
            "اشرح لي هذا الموضوع باللغة العربية البسيطة لطالب مبتدئ. "
            "اعتمد على الملفات المرفوعة أولًا، ثم الملاحظات. "
            "اشرح المحتوى كما ورد في المصدر ولا تصححه ولا تقل إن فيه خطأ، "
            "إلا إذا طلب الطالب صراحة التحقق من صحة المعلومات."
        ),
        file_context=files_context,
        notes_context=notes_context,
        topic_title=topic["title"],
        topic_description=topic["description"] or "",
    )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is not configured.",
        )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt,
        )
        explanation = response.text
        if not explanation:
            raise ValueError("Gemini returned an empty response")
    except Exception:
        logger.exception("Gemini request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI service could not answer the request.",
        )

    return {
        "topic_id": topic_id,
        "explanation": explanation,
    }


@router.post(
    "/ai/quiz/{topic_id}",
    summary="Generate a topic quiz",
    description="Generate a five-question AI quiz from a study topic and its optional notes/files.",
    response_description="Five AI-generated quiz questions for the topic.",
    tags=["ai"],
)
def generate_quiz(
    topic_id: int,
    request: Request,
    user_id: int = Depends(get_current_user_id),
):
    _enforce_rate_limit(request)

    with get_db_connection() as connection:
        topic, notes_context, files_context = _get_topic_context(
            connection,
            topic_id,
            user_id,
        )

    # Priority:
    # 1) uploaded files
    # 2) notes
    # 3) topic title/description
    if files_context:
        source_name = "الملفات المرفوعة"
        source_context = files_context
        source_rule = (
            "الملفات المرفوعة هي المصدر الأساسي والملزم للأسئلة. "
            "أنشئ الأسئلة والإجابات من المعلومات الموجودة فعليًا في الملفات كما هي، "
            "ولا تصحح محتوى الملف ولا تعارضه بمعرفة خارجية، "
            "ولا تخترع معلومات غير موجودة فيه."
        )
    elif notes_context:
        source_name = "ملاحظات الطالب"
        source_context = notes_context
        source_rule = (
            "ملاحظات الطالب هي المصدر الأساسي للأسئلة. "
            "اختبر فهم محتواها ولا تعتمد على حفظ صياغتها حرفيًا."
        )
    else:
        source_name = "اسم الموضوع"
        source_context = f"اسم الموضوع: {topic['title']}"
        if topic["description"]:
            source_context += f"\nوصف الموضوع: {topic['description']}"
        source_rule = (
            "لا توجد ملفات أو ملاحظات. أنشئ الاختبار اعتمادًا على اسم الموضوع "
            "ووصفه إن وجد، ولا توقف إنشاء الاختبار."
        )

    quiz_attempt_id = secrets.token_hex(8)

    prompt = f"""
أنت مدرس محترف تقوم بإنشاء اختبار تعليمي لطالب.

اسم الموضوع:
{topic['title']}

مصدر الاختبار الحالي:
{source_name}

محتوى المصدر:
{source_context}

تعليمات المصدر:
{source_rule}

رقم محاولة جديد:
{quiz_attempt_id}

أنشئ اختبارًا جديدًا باللغة العربية.

قواعد مهمة جدًا:
1. أنشئ EXACTLY 5 أسئلة فقط.
2. يجب أن تكون هذه المحاولة مختلفة عن المحاولات السابقة قدر الإمكان.
3. غيّر الأفكار المختبرة أو صياغة الأسئلة أو ترتيب الخيارات في كل محاولة جديدة.
4. اختبر فهم الطالب للمفاهيم، وليس تذكر كلمات أو صياغة الملف/الملاحظات حرفيًا.
5. إذا كان مصدر الاختبار هو الملفات المرفوعة، فكل سؤال يجب أن يكون مدعومًا بمحتوى الملف.
6. ممنوع أسئلة مثل: ما هي الكلمة المذكورة؟ أي كلمة ظهرت؟ ماذا كتب الطالب؟
7. اجعل الاختبار: 3 multiple_choice و 2 true_false.
8. multiple_choice يجب أن يحتوي 4 خيارات بالضبط، وإجابة صحيحة واحدة فقط.
9. correct_answer في multiple_choice يجب أن يطابق أحد الخيارات حرفيًا.
10. true_false يجب أن تكون correct_answer فيها true أو false فقط.
11. لا تكرر نفس الفكرة داخل الاختبار.
12. لا تضع الإجابة داخل نص السؤال.
13. لا تصحح أي معلومة في المصدر أثناء إنشاء الأسئلة أو تحديد الإجابات الصحيحة.\n14. أعد ONLY raw JSON بدون markdown أو مقدمة.

الشكل المطلوب:
{{
  "questions": [
    {{
      "type": "multiple_choice",
      "question": "السؤال هنا",
      "options": ["الخيار الأول", "الخيار الثاني", "الخيار الثالث", "الخيار الرابع"],
      "correct_answer": "الإجابة الصحيحة"
    }},
    {{
      "type": "true_false",
      "question": "العبارة هنا",
      "correct_answer": true
    }}
  ]
}}
"""

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is not configured.",
        )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt,
        )
        quiz_text = response.text
        if not quiz_text:
            raise ValueError("Gemini returned an empty response")
    except Exception:
        logger.exception("Gemini request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI service could not answer the request.",
        )

    cleaned_quiz_text = quiz_text.strip()
    if cleaned_quiz_text.startswith("```"):
        lines = cleaned_quiz_text.splitlines()
        if lines and lines[0].strip().lower() in {"```", "```json"}:
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        cleaned_quiz_text = "\n".join(lines).strip()

    try:
        quiz_data = json.loads(cleaned_quiz_text)
        questions = quiz_data["questions"]

        if not isinstance(questions, list) or len(questions) != 5:
            raise ValueError("Gemini did not return exactly five questions")

        multiple_choice_count = 0
        true_false_count = 0

        for question in questions:
            if not isinstance(question, dict):
                raise ValueError("Each quiz question must be an object")

            question_text = question.get("question")
            if not isinstance(question_text, str) or not question_text.strip():
                raise ValueError("Each quiz question must contain text")

            question_type = question.get("type")

            if question_type == "multiple_choice":
                multiple_choice_count += 1
                options = question.get("options")
                correct_answer = question.get("correct_answer")

                if (
                    not isinstance(options, list)
                    or len(options) != 4
                    or not all(
                        isinstance(option, str) and option.strip()
                        for option in options
                    )
                ):
                    raise ValueError(
                        "Multiple choice question must have exactly four valid options"
                    )

                if len(set(options)) != 4:
                    raise ValueError("Multiple choice options must be unique")

                if correct_answer not in options:
                    raise ValueError("Correct answer must match one option")

            elif question_type == "true_false":
                true_false_count += 1
                correct_answer = question.get("correct_answer")

                if not isinstance(correct_answer, bool):
                    raise ValueError("True/false answer must be boolean")

                question.pop("options", None)

            else:
                raise ValueError("Unsupported question type")

        if multiple_choice_count != 3 or true_false_count != 2:
            raise ValueError(
                "Quiz must contain 3 multiple choice and 2 true/false questions"
            )

    except (json.JSONDecodeError, KeyError, TypeError, ValueError):
        logger.exception("Gemini returned an invalid quiz format")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Failed to generate valid quiz format",
        )

    return {
        "topic_id": topic_id,
        "quiz_attempt_id": quiz_attempt_id,
        "source": source_name,
        "questions": questions,
    }


@router.post(
    "/ai/chat",
    summary="Chat about a topic",
    description="Ask the AI a question using the topic, notes, and uploaded files as context.",
    response_description="The original question and the AI-generated answer.",
    tags=["ai"],
)
def chat(
    chat_request: ChatRequest,
    request: Request,
    user_id: int = Depends(get_current_user_id),
):
    _enforce_rate_limit(request)

    with get_db_connection() as connection:
        topic, notes_context, files_context = _get_topic_context(
            connection,
            chat_request.topic_id,
            user_id,
        )

    rag_chunks = search_topic(
        topic_id=chat_request.topic_id,
        question=chat_request.message,
        limit=4,
    )

    # Use the most relevant chunks from ChromaDB for normal chat questions.
    # If ChromaDB has no chunks yet, fall back to the full extracted file text.
    if rag_chunks:
        file_context = "\n\n".join(rag_chunks)
    else:
        file_context = files_context

    prompt = build_grounded_prompt(
        question=chat_request.message,
        file_context=file_context,
        notes_context=notes_context,
        topic_title=topic["title"],
        topic_description=topic["description"] or "",
    )

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        logger.error("GEMINI_API_KEY is not configured")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="The AI service is not configured.",
        )

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model="gemini-3.1-flash-lite",
            contents=prompt,
        )
        answer = response.text
        if not answer:
            raise ValueError("Gemini returned an empty response")
    except Exception:
        logger.exception("Gemini request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="The AI service could not answer the request.",
        )

    return {
        "topic_id": chat_request.topic_id,
        "message": chat_request.message,
        "answer": answer,
    }