"""Language of the messages the server sends to the user (Portuguese by default, English on request).

The browser says which one it wants in the `X-Lang` header of every request (`pt` or `en`); the middleware in
main.py stores it for the duration of the request, and `msg(pt, en)` picks the matching text.

    raise FrfError(msg("Escolha ao menos um canal de resposta.", "Choose at least one response channel."))
"""
from __future__ import annotations

from contextvars import ContextVar

_LANG: ContextVar[str] = ContextVar("pysqa_lang", default="pt")


def set_lang(value: str | None) -> None:
    v = (value or "").strip().lower()
    _LANG.set("en" if v.startswith("en") else "pt")


def lang() -> str:
    return _LANG.get()


def msg(pt: str, en: str) -> str:
    return en if _LANG.get() == "en" else pt
