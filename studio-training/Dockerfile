# מערכת תכניות האימון — תמונה עצמאית לחלוטין.
# אין תלויות להתקין: כל המנוע הוא Node טהור, ולכן אין שלב npm install.
FROM node:22-alpine

WORKDIR /app
COPY . .

# בונים את מסך המאמן לקובץ אחד לפני ההפעלה
RUN node build.mjs

# המסד נשמר בנפח נפרד כדי שהוא ישרוד פריסה מחדש
ENV STUDIO_DB_FILE=/data/db.json
ENV PORT=8080
EXPOSE 8080

# בדיקת חיות — מוודאת שהמנוע נטען ולא רק שהתהליך רץ
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1

CMD ["node", "src/server/server.js"]
