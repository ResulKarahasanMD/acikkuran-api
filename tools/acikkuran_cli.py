#!/usr/bin/env python3
"""
Açık Kuran API — CLI wrapper for Quranic data retrieval.
Drop-in replacement for quran:* MCP tools in the quran-connections skill.

Usage:
  python acikkuran_cli.py fetch 1:7              # verse Arabic + default translation
  python acikkuran_cli.py fetch 1:7 -a 103       # verse with specific author
  python acikkuran_cli.py surahs                  # list all surahs
  python acikkuran_cli.py surah 6 -a 105          # surah detail with verses
  python acikkuran_cli.py translations 1:7        # all translations of a verse
  python acikkuran_cli.py words 1:7               # word-by-word breakdown
  python acikkuran_cli.py verseparts 1:7          # verse parts with roots
  python acikkuran_cli.py root Hmd                # root detail with diffs
  python acikkuran_cli.py root-parts Hmd -p 1     # root concordance (verseparts)
  python acikkuran_cli.py search bakara           # search Quran
  python acikkuran_cli.py page 1                  # page of mushaf
  python acikkuran_cli.py authors                 # list authors
  python acikkuran_cli.py roots-letter sin        # roots by letter

Options:
  -a, --author ID     Author ID for translation (default: 105, Erhan Aktaş)
  -p, --page NUM      Page number for paginated endpoints
  --url URL           API base URL (default: http://localhost:3112)
  --raw               Output raw JSON
  --tr                 use Turkish transcription/translation variant
"""

import argparse
import json
import sys
import urllib.request
import urllib.parse
import urllib.error
import re
import os
import textwrap


API_BASE = os.environ.get("ACIKKURAN_URL", "http://localhost:3112")
DEFAULT_AUTHOR_ID = 105       # Erhan Aktaş — Kerim Kur'an (Turkish)
DIYANET_AUTHOR_ID = 11        # Diyanet İşleri (Turkish)
EDI_AUTHOR_ID = 103            # Edip-Layth — Reformist Translation (English)
DEFAULT_AUTHOR_IDS = {
    "tr": 105,
    "diyanet": 11,
    "en": 103,
}

def api_request(path, params=None):
    """GET from Açık Kuran API, return parsed JSON dict."""
    url = f"{API_BASE}{path}"
    if params:
        filtered = {k: v for k, v in params.items() if v is not None}
        query = urllib.parse.urlencode(filtered)
        url = f"{url}?{query}"
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        return {"error": True, "status": e.code, "message": str(e)}
    except urllib.error.URLError as e:
        return {"error": True, "message": f"Connection failed: {e.reason}"}


def parse_verse_ref(ref):
    """Parse 1:7 or 2/255 into (surah_id, verse_number)."""
    m = re.match(r"^\s*(\d+)\s*[:/]\s*(\d+)\s*$", ref)
    if not m:
        raise ValueError(f"Invalid verse reference: {ref} (expected format: SURAH:VERSE)")
    return int(m.group(1)), int(m.group(2))


def cmd_fetch(args):
    surah, verse = parse_verse_ref(args.ref)
    author = args.author or DEFAULT_AUTHOR_ID
    data = api_request(f"/surah/{surah}/verse/{verse}", {"author": author})
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        d = data.get("data", {})
        if not d or data.get("error"):
            print(f"ERROR: {json.dumps(data, ensure_ascii=False)}")
            return
        author_name = d.get("translation", {}).get("author", {}).get("name", "unknown")
        print(f"\n╔══ Sūrah {d['surah']['id']}:{d['verse_number']} — {d['surah']['name_en']}")
        print(f"╠══ {d['surah']['name_original']}")
        print(f"╠══ Author: {author_name}")
        print(f"╠══ Juz: {d['juz_number']}  ·  Page: {d['page']}")
        print(f"╠══")
        print(f"╠══ Arabic (with diacritics):")
        print(f"╠══ {d['verse']}")
        if d.get("verse_simplified"):
            print(f"╠══ Arabic (simplified):")
            print(f"╠══ {d['verse_simplified']}")
        if d.get("verse_without_vowel"):
            print(f"╠══ Arabic (without vowel marks):")
            print(f"╠══ {d['verse_without_vowel']}")
        print(f"╠══")
        print(f"╠══ Transcription (TR): {d.get('transcription', 'N/A')}")
        print(f"╠══ Transcription (EN): {d.get('transcription_en', 'N/A')}")
        print(f"╠══")
        translation = d.get("translation", {})
        print(f"╠══ Translation: {translation.get('text', 'N/A')}")
        footnotes = translation.get("footnotes")
        if footnotes:
            for fn in footnotes:
                print(f"╠══   [{fn['number']}] {fn['text']}")
        print(f"╚═══════════════════════════════════════\n")


def cmd_surahs(args):
    data = api_request("/surahs")
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        for s in data.get("data", []):
            print(f"  {s['id']:>3}. {s['name_original']}  {s['name']} ({s['name_en']}) — {s['verse_count']} verses, page {s['page_number']}")


def cmd_surah(args):
    author = args.author or DEFAULT_AUTHOR_ID
    data = api_request(f"/surah/{args.id}", {"author": author})
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        d = data.get("data", {})
        if not d or data.get("error"):
            print(f"ERROR: {json.dumps(data, ensure_ascii=False)}")
            return
        print(f"\n╔══ Sūrah {d['id']} — {d['name']} ({d['name_en']})")
        print(f"╠══ {d['name_original']}")
        print(f"╠══ {d['name_translation_tr']} / {d['name_translation_en']}")
        print(f"╠══ {d['verse_count']} verses · Page {d['page_number']}")
        print(f"╠══ Audio (TR): {d.get('audio', {}).get('mp3', 'N/A')}")
        print(f"╚══")
        for v in d.get("verses", []):
            text = v.get("translation", {}).get("text", "---")
            text_short = textwrap.shorten(text, width=120, placeholder="...")
            print(f"  {v['verse_number']:>3}. [{v['transcription'][:50]}...]")
            print(f"      {text_short}")
        print()


def cmd_translations(args):
    surah, verse = parse_verse_ref(args.ref)
    data = api_request(f"/surah/{surah}/verse/{verse}/translations")
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        for t in data.get("data", []):
            text_short = textwrap.shorten(t["text"], width=100, placeholder="...")
            author = t.get("author", {})
            print(f"  [{author.get('id', '?')}] {author.get('name', 'unknown')} ({author.get('language', '?')})")
            print(f"      {text_short}")
            print()


def cmd_words(args):
    surah, verse = parse_verse_ref(args.ref)
    data = api_request(f"/surah/{surah}/verse/{verse}/words")
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        for w in data.get("data", []):
            root = w.get("root", {})
            root_info = f"  root: {root['latin']} ({root['arabic']})" if root else "  [no root data]"
            print(f"  {w['sort_number']:>2}. {w['arabic']}  →  {w['transcription']}  ({w['turkish']}){root_info}")


def cmd_verseparts(args):
    surah, verse = parse_verse_ref(args.ref)
    data = api_request(f"/surah/{surah}/verse/{verse}/verseparts")
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        for p in data.get("data", []):
            root = p.get("root", {})
            root_info = f"  root: {root['latin']} ({root['arabic']})" if root else ""
            print(f"  {p['sort_number']:>2}. {p['arabic']}  →  {p['transcription_tr']}  ({p['translation_tr']})  EN: {p['translation_en']}{root_info}")


def cmd_root(args):
    key = args.key
    if re.match(r"^\d+$", key):
        data = api_request(f"/root/{key}")
    else:
        data = api_request(f"/root/latin/{key}")
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        d = data.get("data") if "data" in data else data.get("data", [data])[0] if isinstance(data.get("data", []), list) else data.get("data", {})
        if not d:
            print(f"ERROR: root not found")
            return
        print(f"\n╔══ Root: {d['latin']}  →  {d['arabic']}")
        print(f"╠══ Transcription: {d.get('transcription', d.get('transcription_tr', 'N/A'))}")
        print(f"╠══ Meaning (TR): {d.get('mean', 'N/A')}")
        print(f"╠══ Meaning (EN): {d.get('mean_en', 'N/A')}")
        print(f"╠══")
        print(f"╠══ Derivations ({len(d.get('diffs', []))}):")
        for diff in d.get("diffs", []):
            print(f"╠══   {diff['diff']}  —  occurs {diff['count']}×")
        print(f"╚══\n")


def cmd_root_parts(args):
    key = args.key
    if re.match(r"^\d+$", key):
        lookup = api_request(f"/root/{key}")
        d = lookup.get("data")
        if isinstance(d, list):
            d = d[0] if d else {}
        key = d.get("latin", key) if d else key
    data = api_request(
        f"/root/latin/{key}/verseparts",
        {"page": args.page or 1, "author": args.author or DEFAULT_AUTHOR_ID},
    )
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        meta = data.get("meta", {})
        print(f"\nRoot concordance: '{key}' — page {meta.get('current_page', '?')}/{meta.get('last_page', '?')} (total: {meta.get('total', '?')})")
        print(f"Links: first={meta.get('first', '?')}, next={meta.get('next', '?')}, last={meta.get('last', '?')}")
        for i, entry in enumerate(data.get("data", []), 1):
            surah = entry.get("surah", {})
            verse = entry.get("verse", {})
            translation = verse.get("translation", {})
            text = translation.get("text", "---")
            text_short = textwrap.shorten(text, width=80, placeholder="...")
            print(f"  {i:>3}. {entry['arabic']}  ({entry.get('transcription_tr', entry.get('transcription', ''))})")
            print(f"       {surah['id']}:{verse['verse_number']} — {surah['name']} — {text_short}")
        print()


def cmd_search(args):
    data = api_request("/search", {"q": args.query, "page": args.page or 1})
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        d = data.get("data", {})
        hits = d.get("hits", [])
        for hit in hits:
            text_short = textwrap.shorten(hit.get("text", "").replace("<em>", "").replace("</em>", ""), width=80)
            author = hit.get("author", {})
            print(f"  {hit.get('surah_id', '?')}:{hit.get('verse_number', '?')} [{author.get('name', '?')}]")
            print(f"  {text_short}")
            print()


def cmd_page(args):
    data = api_request(f"/page/{args.page}", {"author": args.author or DEFAULT_AUTHOR_ID})
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        for v in data.get("data", []):
            surah = v.get("surah", {})
            translation = v.get("translation", {})
            print(f"  {surah['id']}:{v['verse_number']}  {v['verse_simplified'][:40]}...")
            print(f"  {v['transcription'][:60]}")
            text = textwrap.shorten(translation.get("text", ""), width=80)
            print(f"  {text}")
            print()


def cmd_authors(args):
    data = api_request("/authors")
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        for a in data.get("data", []):
            print(f"  {a['id']:>4}. {a['name']}  ({a['language']}) — {a.get('description', '')}")


def cmd_roots_letter(args):
    data = api_request(f"/rootchar/{args.letter_id}" if str(args.letter_id).isdigit() else f"/rootchars")
    if args.raw:
        print(json.dumps(data, ensure_ascii=False, indent=2))
    else:
        for r in data.get("data", []):
            if "latin" in r:
                print(f"  {r.get('id', '?'):>4}. {r['latin']}  →  {r.get('arabic', '')}")


def cmd_json_fetch(surah, verse, author=DEFAULT_AUTHOR_ID):
    """Return structured dict — for agent consumption."""
    data = api_request(f"/surah/{surah}/verse/{verse}", {"author": author})
    d = data.get("data", {})
    if not d:
        return {}
    return {
        "surah_id": d.get("surah", {}).get("id"),
        "surah_name": d.get("surah", {}).get("name"),
        "surah_name_en": d.get("surah", {}).get("name_en"),
        "verse_number": d["verse_number"],
        "verse_arabic": d["verse"],
        "verse_arabic_without_vowel": d.get("verse_without_vowel", ""),
        "transcription_tr": d.get("transcription", ""),
        "transcription_en": d.get("transcription_en", ""),
        "juz": d["juz_number"],
        "page": d["page"],
        "translation_text": d.get("translation", {}).get("text", ""),
        "translation_author": d.get("translation", {}).get("author", {}).get("name", ""),
        "footnotes": d.get("translation", {}).get("footnotes"),
    }


def cmd_json_words(surah, verse):
    data = api_request(f"/surah/{surah}/verse/{verse}/words")
    return {
        "words": [
            {
                "arabic": w["arabic"],
                "transcription": w["transcription"],
                "turkish": w["turkish"],
                "root_latin": w.get("root", {}).get("latin") if w.get("root") else None,
                "root_arabic": w.get("root", {}).get("arabic") if w.get("root") else None,
            }
            for w in data.get("data", [])
        ]
    }


def cmd_json_root_parts(root_latin, page=1, author=DEFAULT_AUTHOR_ID):
    data = api_request(
        f"/root/latin/{root_latin}/verseparts",
        {"page": page, "author": author},
    )
    results = []
    for entry in data.get("data", []):
        results.append({
            "arabic": entry["arabic"],
            "transcription_tr": entry.get("transcription_tr", ""),
            "surah_id": entry.get("surah", {}).get("id"),
            "surah_name": entry.get("surah", {}).get("name"),
            "verse_number": entry.get("verse", {}).get("verse_number"),
            "verse_arabic": entry.get("verse", {}).get("verse", ""),
            "translation_text": entry.get("verse", {}).get("translation", {}).get("text", ""),
        })
    return {
        "root": root_latin,
        "total": data.get("meta", {}).get("total", 0),
        "page": data.get("meta", {}).get("current_page", page),
        "last_page": data.get("meta", {}).get("last_page", 1),
        "entries": results,
    }


def cmd_json_translations(surah, verse):
    data = api_request(f"/surah/{surah}/verse/{verse}/translations")
    return {
        "translations": [
            {
                "author_id": t.get("author", {}).get("id"),
                "author_name": t.get("author", {}).get("name"),
                "language": t.get("author", {}).get("language"),
                "text": t["text"],
                "footnotes": t.get("footnotes"),
            }
            for t in data.get("data", [])
        ]
    }


def cmd_json(args):
    """Dispatch JSON subcommands for programmatic use."""
    action = args.json_action
    if action == "fetch":
        surah, verse = parse_verse_ref(args.ref)
        author = args.author or DEFAULT_AUTHOR_ID
        result = cmd_json_fetch(surah, verse, author)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif action == "words":
        surah, verse = parse_verse_ref(args.ref)
        result = cmd_json_words(surah, verse)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif action == "root-parts":
        result = cmd_json_root_parts(args.ref, args.page or 1, args.author or DEFAULT_AUTHOR_ID)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    elif action == "translations":
        surah, verse = parse_verse_ref(args.ref)
        result = cmd_json_translations(surah, verse)
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        print(json.dumps({"error": f"unknown json action: {action}"}, ensure_ascii=False))


def main():
    parser = argparse.ArgumentParser(
        description="Açık Kuran API CLI",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    parser.add_argument("--url", type=str, default=None, help=f"API base URL (default: {API_BASE})")
    parser.add_argument("--raw", action="store_true", help="Output raw JSON")

    sub = parser.add_subparsers(dest="command", help="Command")

    parent = argparse.ArgumentParser(add_help=False)
    parent.add_argument("-a", "--author", type=int, default=DEFAULT_AUTHOR_ID, help=f"Author ID (default: {DEFAULT_AUTHOR_ID})")
    parent.add_argument("-p", "--page", type=int, default=None, help="Page number")

    p_fetch = sub.add_parser("fetch", help="Fetch verse by reference (e.g., 1:7)", parents=[parent])
    p_fetch.add_argument("ref", help="Verse reference (SURAH:VERSE)")

    sub.add_parser("surahs", help="List all surahs")

    p_surah = sub.add_parser("surah", help="Surah detail with verses", parents=[parent])
    p_surah.add_argument("id", type=int, help="Surah ID (1-114)")

    p_trans = sub.add_parser("translations", help="All translations of a verse")
    p_trans.add_argument("ref", help="Verse reference (SURAH:VERSE)")

    p_words = sub.add_parser("words", help="Word-by-word breakdown")
    p_words.add_argument("ref", help="Verse reference (SURAH:VERSE)")

    p_vp = sub.add_parser("verseparts", help="Verse parts with root info")
    p_vp.add_argument("ref", help="Verse reference (SURAH:VERSE)")

    p_root = sub.add_parser("root", help="Root detail (by ID or Latin)")
    p_root.add_argument("key", help="Root ID or Latin chars (e.g., Hmd or 3)")

    p_rp = sub.add_parser("root-parts", help="Root concordance — all verses with this root", parents=[parent])
    p_rp.add_argument("key", help="Root Latin (e.g., Hmd)")

    p_search = sub.add_parser("search", help="Search Quran text")
    p_search.add_argument("query", help="Search query")

    p_page = sub.add_parser("page", help="Page of the mushaf", parents=[parent])
    p_page.add_argument("page", type=int, help="Page number (0-604)")

    sub.add_parser("authors", help="List all translation authors")

    p_rl = sub.add_parser("roots-letter", help="Roots by Arabic letter")
    p_rl.add_argument("letter_id", help="Root char ID (integer)")

    p_json = sub.add_parser("json", help="JSON output for programmatic/agent consumption", parents=[parent])
    p_json.add_argument("json_action", choices=["fetch", "words", "root-parts", "translations"],
                        help="Action for JSON output")
    p_json.add_argument("ref", help="Reference (verse ref or root latin)")

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        return

    commands = {
        "fetch": cmd_fetch,
        "surahs": cmd_surahs,
        "surah": cmd_surah,
        "translations": cmd_translations,
        "words": cmd_words,
        "verseparts": cmd_verseparts,
        "root": cmd_root,
        "root-parts": cmd_root_parts,
        "search": cmd_search,
        "page": cmd_page,
        "authors": cmd_authors,
        "roots-letter": cmd_roots_letter,
        "json": cmd_json,
    }

    handler = commands.get(args.command)
    if handler:
        handler(args)


if __name__ == "__main__":
    main()
