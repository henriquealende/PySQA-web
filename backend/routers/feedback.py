"""Bug reports sent from the app (the "Report a bug" button in the left column).

Every report is appended to a JSON-lines file and, when configured, forwarded so it reaches the maintainer even
though the server disk is temporary (Render wipes it on every deploy):

    PYSQA_FEEDBACK_WEBHOOK   URL of a Slack / Discord / Teams-style incoming webhook
    PYSQA_FEEDBACK_EMAIL_TO  e-mail address that receives each report; needs PYSQA_SMTP_HOST (and usually
                             PYSQA_SMTP_PORT, PYSQA_SMTP_USER, PYSQA_SMTP_PASSWORD, PYSQA_SMTP_FROM)
    PYSQA_FEEDBACK_TOKEN     secret that opens GET /api/feedback (the reports stored on this server)
    PYSQA_FEEDBACK_DIR       where the file lives (default: backend/feedback)
"""
from __future__ import annotations

import hmac
import json
import os
import smtplib
import threading
import time
import urllib.request
from collections import defaultdict, deque
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path
from typing import Deque, Dict, Optional

from fastapi import APIRouter, Header, HTTPException, Request
from pydantic import BaseModel, Field

from utils.lang import msg

router = APIRouter()

FEEDBACK_DIR = Path(os.environ.get("PYSQA_FEEDBACK_DIR") or Path(__file__).parent.parent / "feedback")
_FILE = FEEDBACK_DIR / "reports.jsonl"
_LOCK = threading.Lock()

_MAX_PER_WINDOW = 5          # reports per sender ...
_WINDOW_S = 600              # ... in ten minutes
_SENDS: Dict[str, Deque[float]] = defaultdict(deque)


class Report(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    contact: Optional[str] = Field(default=None, max_length=200)     # optional: e-mail or name, to answer back
    page: Optional[str] = Field(default=None, max_length=100)        # which part of the app (route)
    context: Optional[str] = Field(default=None, max_length=1500)    # what was open: file, view, metric ...
    lang: Optional[str] = Field(default=None, max_length=5)
    user_agent: Optional[str] = Field(default=None, max_length=300)
    viewport: Optional[str] = Field(default=None, max_length=30)
    session_id: Optional[str] = Field(default=None, max_length=64)


def _sender(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for", "")
    return (fwd.split(",")[0].strip() or (request.client.host if request.client else "?"))


def _rate_ok(who: str) -> bool:
    now = time.monotonic()
    q = _SENDS[who]
    while q and now - q[0] > _WINDOW_S:
        q.popleft()
    if len(q) >= _MAX_PER_WINDOW:
        return False
    q.append(now)
    return True


def _text(r: dict) -> str:
    lines = [f"Bug report PySQA — {r['received_at']}", "", r["message"], ""]
    for k in ("contact", "page", "context", "lang", "viewport", "session_id", "user_agent"):
        if r.get(k):
            lines.append(f"{k}: {r[k]}")
    return "\n".join(lines)


def _forward(r: dict) -> None:
    """Best effort, in a thread: a failing webhook or mail server must never lose or delay a report."""
    text = _text(r)
    hook = os.environ.get("PYSQA_FEEDBACK_WEBHOOK", "").strip()
    if hook:
        try:
            body = json.dumps({"text": text[:1900], "content": text[:1900]}).encode()
            req = urllib.request.Request(hook, data=body, headers={"Content-Type": "application/json"})
            urllib.request.urlopen(req, timeout=10).close()
        except Exception as e:                                           # noqa: BLE001
            print(f"[feedback] webhook failed: {e}")
    to, host = os.environ.get("PYSQA_FEEDBACK_EMAIL_TO", "").strip(), os.environ.get("PYSQA_SMTP_HOST", "").strip()
    if to and host:
        try:
            m = EmailMessage()
            m["Subject"] = "PySQA bug: " + r["message"].strip().splitlines()[0][:70]
            m["From"] = os.environ.get("PYSQA_SMTP_FROM") or os.environ.get("PYSQA_SMTP_USER") or to
            m["To"] = to
            if r.get("contact") and "@" in r["contact"]:
                m["Reply-To"] = r["contact"]
            m.set_content(text)
            port = int(os.environ.get("PYSQA_SMTP_PORT", "587"))
            user, pw = os.environ.get("PYSQA_SMTP_USER"), os.environ.get("PYSQA_SMTP_PASSWORD")
            with smtplib.SMTP(host, port, timeout=15) as s:
                s.starttls()
                if user and pw:
                    s.login(user, pw)
                s.send_message(m)
        except Exception as e:                                           # noqa: BLE001
            print(f"[feedback] e-mail failed: {e}")


@router.post("")
def send_report(report: Report, request: Request):
    if not report.message.strip():
        raise HTTPException(400, msg("Descreva o problema antes de enviar.", "Describe the problem before sending."))
    if not _rate_ok(_sender(request)):
        raise HTTPException(429, msg("Muitos relatos em pouco tempo. Tente de novo em alguns minutos.",
                                     "Too many reports in a short time. Try again in a few minutes."))
    record = {"received_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), **report.model_dump()}
    record["message"] = record["message"].strip()
    try:
        FEEDBACK_DIR.mkdir(parents=True, exist_ok=True)
        with _LOCK, open(_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(record, ensure_ascii=False) + "\n")
    except OSError as e:
        print(f"[feedback] could not write the file: {e}")
    threading.Thread(target=_forward, args=(record,), daemon=True).start()
    return {"ok": True}


@router.get("")
def list_reports(x_feedback_token: str = Header(default="")):
    """The reports kept on this server, newest first. Needs the PYSQA_FEEDBACK_TOKEN secret in the X-Feedback-Token header."""
    token = os.environ.get("PYSQA_FEEDBACK_TOKEN", "")
    if not token or not hmac.compare_digest(x_feedback_token, token):
        raise HTTPException(403, "Forbidden")
    if not _FILE.exists():
        return []
    with _LOCK, open(_FILE, encoding="utf-8") as f:
        rows = [json.loads(line) for line in f if line.strip()]
    return rows[::-1]
