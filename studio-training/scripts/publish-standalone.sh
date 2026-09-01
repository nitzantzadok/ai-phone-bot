#!/usr/bin/env bash
#
# מעביר את מערכת תכניות האימון לריפו עצמאי משלה ומעלה אותה ל-GitHub Pages.
#
# למה צריך את זה: לריפו יש אתר Pages אחד בלבד. הריפו הנוכחי כבר מפרסם
# פרויקט אחר, ושתי מערכות לא יכולות לחלוק כתובת אחת. ריפו נפרד גם שומר על
# ההפרדה המלאה בין המערכת הזאת לכל דבר אחר.
#
# שימוש:
#   ./scripts/publish-standalone.sh https://github.com/<user>/studio-training.git
#
set -euo pipefail

REMOTE="${1:-}"
if [ -z "$REMOTE" ]; then
  echo "שימוש: $0 <כתובת-הריפו-החדש>" >&2
  echo "לדוגמה: $0 https://github.com/nitzantzadok/studio-training.git" >&2
  exit 1
fi

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

echo "→ מעתיק את המערכת מ-$SRC"
# רק מה ששייך למערכת. בלי נתונים, בלי תוצרי בנייה, בלי היסטוריית git.
tar -C "$SRC" \
    --exclude='./data' --exclude='./dist' --exclude='./node_modules' \
    --exclude='./.git' --exclude='./_site' \
    -cf - . | tar -C "$STAGE" -xf -

echo "→ מוסיף את תהליך הפרסום ל-Pages"
mkdir -p "$STAGE/.github/workflows"
cat > "$STAGE/.github/workflows/pages.yml" <<'YAML'
name: פרסום מסך המאמן

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      # הבנייה קודמת לבדיקות: הפריסה לקצה מגישה את המסך הבנוי, ויש בדיקה
      # שמוודאת בדיוק את זה
      - name: בנייה
        run: |
          node build.mjs

      - name: בדיקות
        run: node --test tests/*.test.js

      - name: אריזה לאתר
        run: |
          mkdir -p _site
          # app.html ולא artifact.html: הראשון הוא מסמך שלם עם doctype
          # ועם תגית viewport. artifact.html הוא תוכן בלבד — המארח של
          # הארטיפקט עוטף אותו בעצמו, אבל אתר רגיל אינו עושה זאת, והדפדפן
          # בטלפון מקטין את העמוד כדי "להתאים" מסמך בלי viewport.
          cp dist/app.html _site/index.html
          # כל נתיב שגוי מחזיר לאותה אפליקציה במקום למסך שגיאה
          cp dist/app.html _site/404.html
          # מונע מ-Jekyll לגעת בקבצים
          touch _site/.nojekyll

      - uses: actions/upload-pages-artifact@v3
        with:
          path: _site

  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
YAML

cat > "$STAGE/.github/workflows/deploy-cloudflare.yml" <<'YAML'
# פריסה לשרת המשותף — מהדפדפן, בלי טרמינל.
#
# פעם אחת: Settings → Secrets and variables → Actions → New repository secret
#   CLOUDFLARE_API_TOKEN   אסימון מחשבון Cloudflare (חינמי)
#   CLOUDFLARE_ACCOUNT_ID  מזהה החשבון, מתוך כתובת לוח הבקרה
#
# ואז: Actions → "פריסה לשרת המשותף" → Run workflow.
# מאותו רגע כל שינוי שנדחף ל-main מתפרסם לבד.
name: פריסה לשרת המשותף

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read

concurrency:
  group: deploy-cloudflare
  cancel-in-progress: false

jobs:
  deploy:
    runs-on: ubuntu-latest
    env:
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      # הבדיקה כאן ולא בתנאי של המשימה: הקשר secrets אינו זמין ב-if ברמת
      # המשימה, וניסיון להשתמש בו מפיל את כל התהליך עוד לפני שהוא מתחיל
      - name: יש אסימון?
        run: |
          if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
            echo "::error::חסר CLOUDFLARE_API_TOKEN. מוסיפים אותו ב-Settings → Secrets and variables → Actions, ומריצים שוב."
            exit 1
          fi

      # שגיאת האימות של wrangler מגיעה רק בשלב מאוחר ובניסוח טכני. כאן היא
      # נבדקת מראש, והתשובה אומרת בדיוק מה לא בסדר ומה לעשות.
      # אימות מול נקודת הקצה של החשבון ולא של המשתמש.
      #
      # אסימון שנוצר בעמוד "Account API tokens" שייך לחשבון ולא למשתמש,
      # ולכן /user/tokens/verify מחזיר עליו "Invalid API Token" גם כשהוא
      # תקין לחלוטין. הבדיקה שמעניינת אותנו היא ממילא אחרת: האם יש גישה
      # לחשבון, והאם יש הרשאת D1 — בלעדיה הפריסה תיפול בשלב הבא.
      - name: בדיקת גישה
        run: |
          LEN=${#CLOUDFLARE_API_TOKEN}
          echo "אורך הערך שנשמר: $LEN תווים"
          case "$CLOUDFLARE_API_TOKEN" in
            cfat_*|v1.0-*) echo "צורה: תקינה" ;;
            *) echo "צורה: אינו נראה כמו אסימון — ייתכן שהודבק ערך אחר" ;;
          esac
          if printf '%s' "$CLOUDFLARE_API_TOKEN" | grep -q '[[:space:]]'; then
            echo "::error::יש רווח או שורה חדשה בתוך הערך — זה לבדו מפיל את האימות."
            exit 1
          fi
          if [ -z "$CLOUDFLARE_ACCOUNT_ID" ]; then
            echo "::error::חסר CLOUDFLARE_ACCOUNT_ID. מוסיפים אותו כסוד נוסף — הוא מופיע בכתובת של לוח הבקרה."
            exit 1
          fi

          API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID"
          ACC="$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$API" || true)"
          if ! printf '%s' "$ACC" | grep -q '"success":true'; then
            echo "::error::אין גישה לחשבון עם האסימון הזה. אם האסימון נמחק — יוצרים חדש; אם הוא קיים — בעמוד היצירה, תחת Account Resources, צריך לכלול את החשבון."
            echo "תשובת Cloudflare: $ACC"
            exit 1
          fi
          echo "הגישה לחשבון תקינה."

          D1="$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "$API/d1/database?per_page=1" || true)"
          if ! printf '%s' "$D1" | grep -q '"success":true'; then
            echo "::error::לאסימון אין הרשאת D1. בעמוד יצירת האסימון: + Add more → Account → D1 → Edit, ואז יוצרים אסימון חדש ומעדכנים את הסוד."
            echo "תשובת Cloudflare: $D1"
            exit 1
          fi
          echo "הרשאת D1 קיימת."

      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: בנייה
        run: node build.mjs

      - name: בדיקות
        run: node --test tests/*.test.js

      # מזהה המסד נלקח מה-API ישירות ולא מפלט של כלי.
      #
      # יצירה חוזרת נכשלת ב"כבר קיים", וזה המצב הרגיל מהפריסה השנייה
      # והלאה. לכן קודם מחפשים מסד קיים בשם הזה, יוצרים רק אם אין, ובשני
      # המקרים קוראים את המזהה מתשובת ה-API — שהיא JSON יציב.
      - name: מסד D1
        run: |
          set -e
          if ! grep -q PLACEHOLDER wrangler.toml; then
            echo "המזהה כבר רשום בהגדרות."
            exit 0
          fi

          API="https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database"
          AUTH="Authorization: Bearer $CLOUDFLARE_API_TOKEN"
          pick() { node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const r=j.result;const a=Array.isArray(r)?r:[r];const m=a.find(x=>x&&x.name==="studio-training")||a[0];process.stdout.write(m&&(m.uuid||m.id)||"");}catch{process.stdout.write("");}})'; }

          ID="$(curl -s -H "$AUTH" "$API?name=studio-training" | pick)"
          if [ -z "$ID" ]; then
            echo "יוצר מסד חדש…"
            RESP="$(curl -s -X POST -H "$AUTH" -H 'content-type: application/json' \
              --data '{"name":"studio-training"}' "$API")"
            ID="$(printf '%s' "$RESP" | pick)"
            if [ -z "$ID" ]; then
              echo "::error::לא הצלחנו ליצור את המסד."
              echo "תשובת Cloudflare: $RESP"
              exit 1
            fi
          else
            echo "נמצא מסד קיים."
          fi

          sed -i "s|database_id = \".*\"|database_id = \"$ID\"|" wrangler.toml
          echo "מסד: $ID"

      - name: פריסה
        run: npx --yes wrangler@4 deploy
YAML

# הבדיקות הן שער בטיחות, אבל אין טעם להיכשל רק כי Node לא מותקן —
# ב-GitHub Actions הן ירוצו בכל מקרה לפני הפרסום.
if command -v node >/dev/null 2>&1; then
  echo "→ מריץ את הבדיקות לפני שדוחפים"
  if ( cd "$STAGE" && node build.mjs >/dev/null 2>&1 && node --test tests/*.test.js >/dev/null 2>&1 ); then
    echo "   הבדיקות עברו"
  else
    echo "   הבדיקות נכשלו — לא דוחפים" >&2
    exit 1
  fi
else
  echo "→ Node לא מותקן כאן; מדלג על הבדיקות (הן ירוצו ב-GitHub)"
fi

echo "→ דוחף ל-$REMOTE"
WORK="$(mktemp -d)"
trap 'rm -rf "$STAGE" "$WORK"' EXIT

# ריפו שכבר קיים מתעדכן ולא נדרס: מושכים את ההיסטוריה, מחליפים את הקבצים,
# ודוחפים קומיט רגיל. כך הקישור החי לא נשבר ואפשר לחזור אחורה.
# בודקים את הענף עצמו ולא את HEAD: ריפו שה-HEAD שלו מצביע לענף אחר
# היה נראה ריק בטעות, והעדכון היה הופך לדריסה.
if [ -n "$(git ls-remote --heads "$REMOTE" main 2>/dev/null)" ]; then
  git clone -q --branch main "$REMOTE" "$WORK"
  echo "   ריפו קיים — מעדכן"
  find "$WORK" -mindepth 1 -maxdepth 1 ! -name '.git' -exec rm -rf {} +
  tar -C "$STAGE" -cf - . | tar -C "$WORK" -xf -
  cd "$WORK"
  git add -A
  if git diff --cached --quiet; then
    echo "   אין שינויים — לא נדרש עדכון"
    exit 0
  fi
  git -c user.email="${GIT_AUTHOR_EMAIL:-studio@local}" \
      -c user.name="${GIT_AUTHOR_NAME:-studio}" \
      commit -q -m "${COMMIT_MESSAGE:-עדכון מערכת תכניות האימון}"
  git push -q origin HEAD:main
else
  echo "   ריפו חדש — מאתחל"
  cd "$STAGE"
  git init -q -b main
  git add -A
  git -c user.email="${GIT_AUTHOR_EMAIL:-studio@local}" \
      -c user.name="${GIT_AUTHOR_NAME:-studio}" \
      commit -q -m "מערכת תכניות אימון לסטודיו — גרסה ראשונה"
  git remote add origin "$REMOTE"
  git push -u origin main
fi

cat <<'DONE'

הועלה בהצלחה.

נשאר צעד אחד בדפדפן:
  Settings → Pages → Source → GitHub Actions

אחרי 2-3 דקות הכתובת תהיה:
  https://<שם-המשתמש>.github.io/studio-training/
DONE
