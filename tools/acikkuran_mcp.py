#!/usr/bin/env python3
"""
Açık Kuran MCP — stdio MCP server over the Açık Kuran REST API.

Wraps the same endpoints as acikkuran_cli.py, but exposes them as MCP tools so
any MCP client can call them directly instead of shelling out.

Launch:
    ACIKKURAN_URL=http://localhost:3112 \
    /Users/rak/projects/acikkuran-api/tools/.venv/bin/python \
    /Users/rak/projects/acikkuran-api/tools/acikkuran_mcp.py

Design notes:
  * No network at import time — the process stays cheap until a tool is called.
  * HTTP calls run in a worker thread so the stdio event loop is never blocked.
  * Verse refs are always "SURAH:VERSE" (e.g. "2:255"), matching the CLI.
"""

import asyncio
import os
import re
import sys
from pathlib import Path
from typing import Any

from mcp.server.mcpserver import MCPServer
from mcp.server.mcpserver.exceptions import ToolError

sys.path.insert(0, str(Path(__file__).resolve().parent))
import acikkuran_cli as cli  # noqa: E402  (path must be set first)

API_BASE = os.environ.get("ACIKKURAN_URL", cli.API_BASE)
cli.API_BASE = API_BASE

DEFAULT_AUTHOR = cli.DEFAULT_AUTHOR_ID  # 105 — Erhan Aktaş, Kerim Kur'an (TR)

mcp = MCPServer(
    name="acikkuran",
    version="0.1.0",
    instructions=(
        "Açık Kuran API: Quranic text, translations, word-by-word morphology and "
        "root concordance. Verse references use 'SURAH:VERSE' (e.g. '2:255'). "
        "Author IDs select a translation — 105 Erhan Aktaş (TR), 11 Diyanet (TR), "
        "103 Edip-Layth Reformist (EN); call list_authors for the full list. "
        "root_concordance is the primary tool for tafsir al-Qur'an bi'l-Qur'an: it "
        "returns every verse sharing a triliteral root."
    ),
)


class AcikKuranError(ToolError):
    """Anticipated failure (API down, bad ref, no such root) — ToolError so the
    client sees the message instead of a generic "Error executing tool"."""


def _check(payload: Any, what: str) -> Any:
    """Turn the CLI's {'error': True, ...} convention into a real exception."""
    if isinstance(payload, dict) and payload.get("error"):
        msg = payload.get("message", "unknown error")
        status = payload.get("status")
        detail = f"HTTP {status}: {msg}" if status else msg
        raise AcikKuranError(
            f"Açık Kuran API request failed for {what} at {API_BASE} — {detail}. "
            f"Is the API running? (set ACIKKURAN_URL to point elsewhere)"
        )
    return payload


async def _get(path: str, params: dict | None = None, what: str = "") -> Any:
    """Run the blocking urllib call off the event loop."""
    payload = await asyncio.to_thread(cli.api_request, path, params)
    return _check(payload, what or path)


def _ref(ref: str) -> tuple[int, int]:
    try:
        return cli.parse_verse_ref(ref)
    except ValueError as exc:
        raise AcikKuranError(str(exc)) from exc


@mcp.tool(
    description=(
        "Fetch one verse: Arabic (vowelled, simplified, unvowelled), TR/EN "
        "transcription, translation with footnotes, juz and mushaf page."
    )
)
async def fetch_verse(ref: str, author: int = DEFAULT_AUTHOR) -> dict:
    surah, verse = _ref(ref)
    data = await _get(f"/surah/{surah}/verse/{verse}", {"author": author}, f"verse {ref}")
    d = data.get("data") or {}
    if not d:
        raise AcikKuranError(f"No verse found for {ref}")
    tr = d.get("translation") or {}
    return {
        "surah_id": (d.get("surah") or {}).get("id"),
        "surah_name": (d.get("surah") or {}).get("name"),
        "surah_name_en": (d.get("surah") or {}).get("name_en"),
        "verse_number": d.get("verse_number"),
        "verse_arabic": d.get("verse"),
        "verse_simplified": d.get("verse_simplified"),
        "verse_without_vowel": d.get("verse_without_vowel"),
        "transcription_tr": d.get("transcription"),
        "transcription_en": d.get("transcription_en"),
        "juz": d.get("juz_number"),
        "page": d.get("page"),
        "translation_text": tr.get("text"),
        "translation_author": (tr.get("author") or {}).get("name"),
        "footnotes": tr.get("footnotes"),
    }


@mcp.tool(description="List all 114 surahs with names, verse counts and start pages.")
async def list_surahs() -> dict:
    data = await _get("/surahs", None, "surah list")
    return {
        "surahs": [
            {
                "id": s.get("id"),
                "name": s.get("name"),
                "name_en": s.get("name_en"),
                "name_original": s.get("name_original"),
                "verse_count": s.get("verse_count"),
                "page_number": s.get("page_number"),
            }
            for s in data.get("data", [])
        ]
    }


@mcp.tool(description="Fetch a whole surah with all its verses in one translation.")
async def get_surah(surah_id: int, author: int = DEFAULT_AUTHOR) -> dict:
    data = await _get(f"/surah/{surah_id}", {"author": author}, f"surah {surah_id}")
    d = data.get("data") or {}
    if not d:
        raise AcikKuranError(f"No surah found for id {surah_id}")
    return {
        "id": d.get("id"),
        "name": d.get("name"),
        "name_en": d.get("name_en"),
        "name_original": d.get("name_original"),
        "verse_count": d.get("verse_count"),
        "page_number": d.get("page_number"),
        "verses": [
            {
                "verse_number": v.get("verse_number"),
                "verse_arabic": v.get("verse"),
                "transcription_tr": v.get("transcription"),
                "translation_text": (v.get("translation") or {}).get("text"),
            }
            for v in d.get("verses", [])
        ],
    }


@mcp.tool(
    description=(
        "All available translations of one verse, across every author and "
        "language. Use to compare renderings before committing to one."
    )
)
async def verse_translations(ref: str) -> dict:
    surah, verse = _ref(ref)
    data = await _get(
        f"/surah/{surah}/verse/{verse}/translations", None, f"translations of {ref}"
    )
    return {
        "ref": ref,
        "translations": [
            {
                "author_id": (t.get("author") or {}).get("id"),
                "author_name": (t.get("author") or {}).get("name"),
                "language": (t.get("author") or {}).get("language"),
                "text": t.get("text"),
                "footnotes": t.get("footnotes"),
            }
            for t in data.get("data", [])
        ],
    }


@mcp.tool(
    description=(
        "Word-by-word breakdown of a verse: Arabic token, transcription, Turkish "
        "gloss and the triliteral root of each word. Feed roots to root_concordance."
    )
)
async def verse_words(ref: str) -> dict:
    surah, verse = _ref(ref)
    data = await _get(f"/surah/{surah}/verse/{verse}/words", None, f"words of {ref}")
    return {
        "ref": ref,
        "words": [
            {
                "sort_number": w.get("sort_number"),
                "arabic": w.get("arabic"),
                "transcription": w.get("transcription"),
                "turkish": w.get("turkish"),
                "root_latin": (w.get("root") or {}).get("latin"),
                "root_arabic": (w.get("root") or {}).get("arabic"),
            }
            for w in data.get("data", [])
        ],
    }


@mcp.tool(
    description=(
        "Verse parts (morphological segments) with TR and EN glosses plus roots — "
        "finer grained than verse_words."
    )
)
async def verse_parts(ref: str) -> dict:
    surah, verse = _ref(ref)
    data = await _get(
        f"/surah/{surah}/verse/{verse}/verseparts", None, f"verse parts of {ref}"
    )
    return {
        "ref": ref,
        "parts": [
            {
                "sort_number": p.get("sort_number"),
                "arabic": p.get("arabic"),
                "transcription_tr": p.get("transcription_tr"),
                "translation_tr": p.get("translation_tr"),
                "translation_en": p.get("translation_en"),
                "root_latin": (p.get("root") or {}).get("latin"),
                "root_arabic": (p.get("root") or {}).get("arabic"),
            }
            for p in data.get("data", [])
        ],
    }


@mcp.tool(
    description=(
        "Root detail by Latin key (e.g. 'Hmd') or numeric id: Arabic form, TR/EN "
        "meaning, and every derived form with its occurrence count."
    )
)
async def get_root(key: str) -> dict:
    path = f"/root/{key}" if re.fullmatch(r"\d+", key.strip()) else f"/root/latin/{key}"
    data = await _get(path, None, f"root {key}")
    d = data.get("data")
    if isinstance(d, list):
        d = d[0] if d else None
    if not d:
        raise AcikKuranError(f"Root not found: {key}")
    return {
        "latin": d.get("latin"),
        "arabic": d.get("arabic"),
        "transcription": d.get("transcription") or d.get("transcription_tr"),
        "mean_tr": d.get("mean"),
        "mean_en": d.get("mean_en"),
        "derivations": [
            {"form": x.get("diff"), "count": x.get("count")} for x in d.get("diffs", [])
        ],
    }


@mcp.tool(
    description=(
        "Root concordance: every verse containing a given triliteral root, "
        "paginated, each with its translation. The core tool for explaining a "
        "verse with other verses (tafsir al-Qur'an bi'l-Qur'an). Check meta.last_page "
        "and walk pages to cover the whole concordance."
    )
)
async def root_concordance(
    root_latin: str, page: int = 1, author: int = DEFAULT_AUTHOR
) -> dict:
    data = await _get(
        f"/root/latin/{root_latin}/verseparts",
        {"page": page, "author": author},
        f"concordance for root {root_latin}",
    )
    meta = data.get("meta") or {}
    entries = []
    for e in data.get("data", []):
        surah = e.get("surah") or {}
        verse = e.get("verse") or {}
        entries.append(
            {
                "arabic": e.get("arabic"),
                "transcription_tr": e.get("transcription_tr") or e.get("transcription"),
                "ref": f"{surah.get('id')}:{verse.get('verse_number')}",
                "surah_name": surah.get("name"),
                "verse_arabic": verse.get("verse"),
                "translation_text": ((verse.get("translation") or {}).get("text")),
            }
        )
    return {
        "root": root_latin,
        "meta": {
            "total": meta.get("total"),
            "current_page": meta.get("current_page", page),
            "last_page": meta.get("last_page", 1),
        },
        "entries": entries,
    }


@mcp.tool(
    description=(
        "Full-text search across translations (Meilisearch-backed). Returns "
        "matching verses with surah:verse refs. Paginated."
    )
)
async def search_quran(query: str, page: int = 1) -> dict:
    data = await _get("/search", {"q": query, "page": page}, f"search '{query}'")
    d = data.get("data") or {}
    hits = []
    for h in d.get("hits", []):
        text = (h.get("text") or "").replace("<em>", "").replace("</em>", "")
        hits.append(
            {
                "ref": f"{h.get('surah_id')}:{h.get('verse_number')}",
                "author_name": (h.get("author") or {}).get("name"),
                "text": text,
            }
        )
    return {
        "query": query,
        "page": page,
        "estimated_total": d.get("estimatedTotalHits") or d.get("nbHits"),
        "hits": hits,
    }


@mcp.tool(description="All verses printed on one mushaf page (0-604), with translation.")
async def get_page(page: int, author: int = DEFAULT_AUTHOR) -> dict:
    data = await _get(f"/page/{page}", {"author": author}, f"mushaf page {page}")
    return {
        "page": page,
        "verses": [
            {
                "ref": f"{(v.get('surah') or {}).get('id')}:{v.get('verse_number')}",
                "verse_arabic": v.get("verse"),
                "transcription_tr": v.get("transcription"),
                "translation_text": (v.get("translation") or {}).get("text"),
            }
            for v in data.get("data", [])
        ],
    }


@mcp.tool(
    description=(
        "List every translation author with its id and language. Call this before "
        "passing an unfamiliar author id to the other tools."
    )
)
async def list_authors() -> dict:
    data = await _get("/authors", None, "author list")
    return {
        "authors": [
            {
                "id": a.get("id"),
                "name": a.get("name"),
                "language": a.get("language"),
                "description": a.get("description"),
            }
            for a in data.get("data", [])
        ]
    }


@mcp.tool(
    description=(
        "Check that the configured Açık Kuran API is reachable. Returns the base "
        "URL and the surah count it answered with. Use this first when other tools fail."
    )
)
async def health() -> dict:
    data = await _get("/surahs", None, "health check")
    surahs = data.get("data", [])
    return {
        "api_base": API_BASE,
        "reachable": True,
        "surah_count": len(surahs),
        "expected_surah_count": 114,
    }


def main() -> int:
    try:
        mcp.run(transport="stdio")
    except (KeyboardInterrupt, asyncio.CancelledError):
        return 0
    except BrokenPipeError:
        # Client closed stdio; exit quietly instead of dumping a traceback.
        return 0
    return 0


if __name__ == "__main__":
    sys.exit(main())
