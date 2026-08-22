#!/usr/bin/env bash
#
# One command that gets you from nothing to a scan.
#
#   ./setup.sh https://www.example.co.il
#
# Written for someone who has not set up a Node project before. Every step is checked, and
# every failure says what went wrong and what to do about it — in Hebrew, because a stack
# trace in English is where most people give up. It is safe to run more than once.

set -euo pipefail

TARGET="${1:-}"

# ---------------------------------------------------------------------------- output ---
BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; RESET=$'\033[0m'

step()  { printf '\n%s▸ %s%s\n' "$BOLD" "$1" "$RESET"; }
ok()    { printf '  %s✓%s %s\n' "$GREEN" "$RESET" "$1"; }
info()  { printf '  %s%s%s\n' "$DIM" "$1" "$RESET"; }
die()   { printf '\n%s✗ %s%s\n\n%s\n\n' "$RED" "$1" "$RESET" "$2" >&2; exit 1; }

printf '\n%sהתקנה והרצה של סריקת AI%s\n' "$BOLD" "$RESET"

# ------------------------------------------------------------------------------ node ---
step 'בודק ש-Node מותקן'

if ! command -v node >/dev/null 2>&1; then
  die 'Node.js לא מותקן' \
'הדרך הכי פשוטה למק:

  1. פתחו https://nodejs.org
  2. הורידו את הגרסה שמסומנת LTS
  3. פתחו את הקובץ שהורדתם ולחצו Next עד הסוף
  4. סגרו את חלון הטרמינל, פתחו חדש, והריצו את הסקריפט הזה שוב

(אם מותקן אצלכם Homebrew אפשר גם: brew install node)'
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  die "גרסת Node ישנה מדי (מותקן $(node --version), צריך 22 ומעלה)" \
'הורידו את גרסת ה-LTS מ-https://nodejs.org והתקינו מעליה.
אחר כך סגרו את הטרמינל, פתחו חדש, והריצו את הסקריפט שוב.'
fi
ok "Node $(node --version)"

# ------------------------------------------------------------------------------ pnpm ---
step 'בודק ש-pnpm זמין'

if ! command -v pnpm >/dev/null 2>&1; then
  info 'pnpm לא נמצא — מפעיל אותו דרך corepack (מגיע עם Node)'
  # corepack ships with Node, so this is normally instant. It can fail on a system where
  # Node was installed system-wide without write access, which is worth naming rather than
  # letting the user meet a bare EACCES.
  if ! corepack enable >/dev/null 2>&1; then
    die 'לא הצלחתי להפעיל את pnpm' \
'נסו להריץ ידנית:

  sudo corepack enable

ואם גם זה נכשל:

  npm install -g pnpm

ואז הריצו את הסקריפט הזה שוב.'
  fi
fi
ok "pnpm $(pnpm --version 2>/dev/null || echo 'מוכן')"

# --------------------------------------------------------------------------- install ---
step 'מתקין את התלויות של הפרויקט'
info 'בפעם הראשונה זה לוקח דקה או שתיים'

cd "$(dirname "$0")"

if ! pnpm install --silent; then
  die 'ההתקנה נכשלה' \
'בדרך כלל זו בעיית רשת. בדקו חיבור לאינטרנט ונסו שוב.
אם אתם מאחורי רשת של מקום עבודה, ייתכן שהיא חוסמת את registry.npmjs.org.'
fi
ok 'התלויות מותקנות'

# ------------------------------------------------------------------------------- key ---
step 'בודק מפתח לחצי ה-AI'

if [ -f .env ] && grep -qE '^(OPENAI|ANTHROPIC|GEMINI)_API_KEY=.+' .env; then
  ok 'נמצא מפתח בקובץ .env — הסריקה תמדוד גם מול מנוע AI אמיתי'
else
  info 'אין מפתח. הסריקה תרוץ במלואה על האתר, וחצי ה-AI ידווח "לא נמדד".'
  info 'להוספה מאוחר יותר:  echo '"'"'OPENAI_API_KEY=sk-...'"'"' >> .env'
fi

# ------------------------------------------------------------------------------ scan ---
if [ -z "$TARGET" ]; then
  printf '\n%s✓ הכל מוכן.%s\n\n' "$GREEN" "$RESET"
  printf 'להרצת סריקה:\n\n  pnpm scan https://www.example.co.il\n\n'
  printf 'או להרצת האתר בדפדפן:\n\n  pnpm web\n\nואז לפתוח http://localhost:3100\n\n'
  printf '%sאם הטרמינל מדפיס פורט אחר, תשתמשו במה שהוא מדפיס — הוא תמיד צודק.%s\n\n' "$DIM" "$RESET"
  exit 0
fi

step "סורק את $TARGET"
printf '\n'
pnpm scan "$TARGET"
