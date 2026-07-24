import json
import os
from datetime import datetime, timezone
from pathlib import Path

DEBUG_DIR = Path(__file__).parent.parent / "data" / "debug"


def _ensure_dir() -> Path:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    return DEBUG_DIR


def append(session_id: str, entry: dict) -> None:
    path = _ensure_dir() / f"{session_id}.jsonl"
    entry["timestamp"] = datetime.now(timezone.utc).isoformat()
    with open(path, "a") as f:
        f.write(json.dumps(entry, default=str) + "\n")


def get_log(session_id: str) -> list[dict]:
    path = _ensure_dir() / f"{session_id}.jsonl"
    if not path.exists():
        return []
    entries = []
    for line in path.read_text().strip().split("\n"):
        if line.strip():
            try:
                entries.append(json.loads(line))
            except json.JSONDecodeError:
                pass
    return entries


def list_logs() -> list[dict]:
    logs = []
    for f in sorted(_ensure_dir().glob("*.jsonl"), key=os.path.getmtime, reverse=True):
        session_id = f.stem
        size = f.stat().st_size
        logs.append({"session_id": session_id, "size": size, "path": str(f)})
    return logs
