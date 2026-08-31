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

      - name: בדיקות
        run: node --test tests/*.test.js

      - name: בנייה
        run: |
          node build.mjs
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

# הבדיקות הן שער בטיחות, אבל אין טעם להיכשל רק כי Node לא מותקן —
# ב-GitHub Actions הן ירוצו בכל מקרה לפני הפרסום.
if command -v node >/dev/null 2>&1; then
  echo "→ מריץ את הבדיקות לפני שדוחפים"
  if ( cd "$STAGE" && node --test tests/*.test.js >/dev/null 2>&1 ); then
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
