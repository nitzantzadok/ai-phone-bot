#!/usr/bin/env bash
#
# פריסה של המערכת כשרת משותף, בחינם, על Cloudflare Workers + D1.
#
# מה זה נותן: כתובת אחת שכל המאמנים נכנסים אליה, והנתונים יושבים במסד
# מנוהל אחד — לא בדפדפן של כל אחד. מי שמוסיף מתאמן במכשיר אחד, השני רואה
# אותו מיד.
#
# שימוש:
#   ./scripts/deploy-cloudflare.sh
#
# בפעם הראשונה ייפתח דפדפן להתחברות ל-Cloudflare (חשבון חינמי, בלי כרטיס
# אשראי), ייווצר מסד D1, והכתובת תודפס בסוף. בכל פעם הבאה זו אותה פקודה.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

WRANGLER="npx --yes wrangler@4"
DB_NAME="studio-training"

echo "→ בונה את מסך המאמן"
node build.mjs >/dev/null

echo "→ מריץ את הבדיקות"
if ! node --test tests/*.test.js >/dev/null 2>&1; then
  echo "   הבדיקות נכשלו — לא פורסים" >&2
  exit 1
fi
echo "   הבדיקות עברו"

if ! $WRANGLER whoami >/dev/null 2>&1; then
  echo "→ התחברות ל-Cloudflare (ייפתח דפדפן)"
  $WRANGLER login
fi

# מסד קיים אינו נוצר מחדש: יצירה חוזרת הייתה מוחקת את כל מה שנצבר
if grep -q 'PLACEHOLDER' wrangler.toml; then
  echo "→ יוצר מסד D1 בשם $DB_NAME"
  CREATE_OUTPUT="$($WRANGLER d1 create "$DB_NAME" 2>&1 || true)"
  DB_ID="$(printf '%s' "$CREATE_OUTPUT" | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)"

  if [ -z "$DB_ID" ]; then
    # המסד כבר קיים מפריסה קודמת — לוקחים את המזהה שלו מהרשימה
    DB_ID="$($WRANGLER d1 list --json 2>/dev/null \
      | tr ',' '\n' | grep -A1 "\"name\":\"$DB_NAME\"" \
      | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1 || true)"
  fi
  if [ -z "$DB_ID" ]; then
    echo "   לא הצלחנו ליצור או למצוא את המסד. הפלט היה:" >&2
    printf '%s\n' "$CREATE_OUTPUT" >&2
    exit 1
  fi

  # מחליפים את המציין המקומי במזהה האמיתי, ושומרים גיבוי של הקובץ
  cp wrangler.toml wrangler.toml.bak
  sed -i.tmp "s|database_id = \".*\"|database_id = \"$DB_ID\"|" wrangler.toml
  rm -f wrangler.toml.tmp
  echo "   נוצר: $DB_ID"
fi

echo "→ פורס"
$WRANGLER deploy

cat <<'DONE'

הפריסה הושלמה.

הכתובת מודפסת למעלה (משהו בסגנון https://studio-training.<שם>.workers.dev).
זו הכתובת שנותנים לכל המאמנים: הם נכנסים לאותו חשבון סטודיו ורואים את
אותם מתאמנים, מכל מכשיר.

לעדכון גרסה בעתיד — אותה פקודה בדיוק:
  ./scripts/deploy-cloudflare.sh
DONE
