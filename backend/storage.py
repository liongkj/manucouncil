import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

from backend.config import env

STORAGE_DIR = env.resolve_storage_dir()


def _ensure_dir() -> Path:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    return STORAGE_DIR


def create_session(title: str = "New Conversation") -> dict:
    session = {
        "id": str(uuid4()),
        "title": title,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "messages": [],
    }
    _write_session(session)
    return session


def get_session(session_id: str) -> dict | None:
    path = _ensure_dir() / f"{session_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def list_sessions() -> list[dict]:
    sessions = []
    for f in sorted(_ensure_dir().glob("*.json"), key=os.path.getmtime, reverse=True):
        data = json.loads(f.read_text())
        sessions.append({
            "id": data["id"],
            "title": data["title"],
            "created_at": data["created_at"],
            "updated_at": data["updated_at"],
            "message_count": len(data.get("messages", [])),
        })
    return sessions


def add_message(session_id: str, role: str, content: dict) -> dict | None:
    session = get_session(session_id)
    if session is None:
        return None
    session.setdefault("messages", []).append({
        "role": role,
        "content": content,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    session["updated_at"] = datetime.now(timezone.utc).isoformat()
    _write_session(session)
    return session


def delete_session(session_id: str) -> bool:
    path = _ensure_dir() / f"{session_id}.json"
    if not path.exists():
        return False
    path.unlink()
    return True


def _write_session(session: dict) -> None:
    path = _ensure_dir() / f"{session['id']}.json"
    fd, tmp = tempfile.mkstemp(dir=str(path.parent))
    try:
        with os.fdopen(fd, "w") as f:
            json.dump(session, f, indent=2)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.remove(tmp)
        except OSError:
            pass
        raise
