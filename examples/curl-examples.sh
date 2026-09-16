#!/usr/bin/env bash
# =============================================================================
# Açık Kuran API - curl Usage Examples
# Server must be running on localhost:3112
# =============================================================================
set -e

BASE_URL="${ACIKKURAN_URL:-http://localhost:3112}"
AUTHOR_ID="${AUTHOR:-105}"  # Default: Erhan Aktaş (Kerim Kur'an)
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$1"; }
red()   { printf "\033[31m%s\033[0m\n" "$1"; }
bold()  { printf "\n\033[1m%s\033[0m\n" "$1"; }

check() {
  local desc="$1" url="$2" expected_field="$3"
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" "$url")
  if [ "$resp" = "200" ]; then
    green "  PASS: $desc (HTTP $resp)"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $desc (HTTP $resp)"
    FAIL=$((FAIL + 1))
  fi
}

echo "================================================================="
echo "  Açık Kuran API - Usage Examples"
echo "  Base URL: $BASE_URL"
echo "  Default Author ID: $AUTHOR_ID"
echo "================================================================="

# 1. Root / Info
bold "1. API Info (GET /)"
curl -s "$BASE_URL/" | python3 -m json.tool
check "API Info" "$BASE_URL/" ""

# 2. Authors
bold "2. List Authors (GET /authors)"
curl -s "$BASE_URL/authors" | python3 -m json.tool | head -30
check "List Authors" "$BASE_URL/authors" ""

# 3. Surahs
bold "3. List Surahs (GET /surahs)"
curl -s "$BASE_URL/surahs" | python3 -m json.tool | head -40
check "List Surahs" "$BASE_URL/surahs" ""

# 4. Single Surah with verses
bold "4. Surah Detail - Al-Fatiha (GET /surah/1)"
curl -s "$BASE_URL/surah/1" | python3 -m json.tool | head -60
check "Surah 1" "$BASE_URL/surah/1" ""

# 5. Surah with specific author
bold "5. Surah with Author 103 - Edip Yüksel (GET /surah/1?author=103)"
curl -s "$BASE_URL/surah/1?author=103" | python3 -m json.tool | head -40
check "Surah 1 (author 103)" "$BASE_URL/surah/1?author=103" ""

# 6. Single Verse
bold "6. Single Verse - 6:1 (GET /surah/6/verse/1)"
curl -s "$BASE_URL/surah/6/verse/1" | python3 -m json.tool
check "Verse 6:1" "$BASE_URL/surah/6/verse/1" ""

# 7. Verse Translations
bold "7. Verse Translations (GET /surah/1/verse/1/translations)"
curl -s "$BASE_URL/surah/1/verse/1/translations" | python3 -m json.tool | head -60
check "Translations 1:1" "$BASE_URL/surah/1/verse/1/translations" ""

# 8. Verse Parts
bold "8. Verse Parts (GET /surah/1/verse/1/verseparts)"
curl -s "$BASE_URL/surah/1/verse/1/verseparts" | python3 -m json.tool
check "VerseParts 1:1" "$BASE_URL/surah/1/verse/1/verseparts" ""

# 9. Verse Words
bold "9. Verse Words (GET /surah/1/verse/1/words)"
curl -s "$BASE_URL/surah/1/verse/1/words" | python3 -m json.tool
check "Words 1:1" "$BASE_URL/surah/1/verse/1/words" ""

# 10. Root by Latin chars
bold "10. Root Detail - Hmd (GET /root/latin/Hmd)"
curl -s "$BASE_URL/root/latin/Hmd" | python3 -m json.tool
check "Root Hmd" "$BASE_URL/root/latin/Hmd" ""

# 11. Root Verse Parts (paginated)
bold "11. Root Verse Parts - Hmd (GET /root/latin/Hmd/verseparts)"
curl -s "$BASE_URL/root/latin/Hmd/verseparts?page=1&author=$AUTHOR_ID" | python3 -m json.tool | head -50
check "Root Hmd Verseparts" "$BASE_URL/root/latin/Hmd/verseparts" ""

# 12. Root by ID
bold "12. Root by ID (GET /root/3)"
curl -s "$BASE_URL/root/3" | python3 -m json.tool
check "Root ID 3" "$BASE_URL/root/3" ""

# 13. Root Chars
bold "13. List Arabic Letters (GET /rootchars)"
curl -s "$BASE_URL/rootchars" | python3 -m json.tool | head -30
check "RootChars" "$BASE_URL/rootchars" ""

# 14. Roots by Letter
bold "14. Roots starting with س - Sin (GET /rootchar/1)"
curl -s "$BASE_URL/rootchar/1" | python3 -m json.tool | head -40
check "RootChar 1" "$BASE_URL/rootchar/1" ""

# 15. Page
bold "15. Page 1 of the Qur'an (GET /page/1)"
curl -s "$BASE_URL/page/1" | python3 -m json.tool | head -60
check "Page 1" "$BASE_URL/page/1" ""

# 16. The live public API (cross-check)
bold "16. Live Public API Test (https://api.acikkuran.com/surahs)"
curl -s "https://api.acikkuran.com/surahs" | python3 -m json.tool | head -30
check "Public API" "https://api.acikkuran.com/surahs" ""

# Summary
echo ""
echo "================================================================="
echo "  Results: $(green "$PASS passed") / $(red "$FAIL failed")"
echo "================================================================="
