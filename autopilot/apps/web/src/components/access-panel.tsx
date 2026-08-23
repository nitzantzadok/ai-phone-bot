/**
 * Which assistants are actually allowed to read this site.
 *
 * Placed above everything else on the report when anything is blocked, because it can
 * invalidate the rest of the page. A site that scores 82 and has told ChatGPT's crawler to
 * stay out does not have an 82 as far as ChatGPT is concerned — it has nothing, and every
 * other number on the report is describing how well a locked door is decorated.
 *
 * Shown per assistant rather than as one verdict because the answer genuinely differs per
 * assistant, and the customer's next action depends on which. "ChatGPT cannot read you,
 * Gemini can" is a sentence somebody acts on this afternoon.
 *
 * The training distinction is carried into the copy rather than flattened away. A business
 * that blocks GPTBot has opted out of training, which many do deliberately and correctly,
 * and which does not affect how ChatGPT answers a question about them today. Reporting
 * that as lost visibility would be alarming and false.
 */
import type { AiAccessReport } from '@autopilot/crawler/ai-access.ts'

type Lang = 'he' | 'en'

const t = (he: string, en: string, language: Lang) => (language === 'he' ? he : en)

const STATE = {
  ALLOWED: {
    mark: '✓',
    ring: 'border-positive/30 bg-positive/5',
    text: 'text-positive',
    label: { he: 'יכול לקרוא אתכם', en: 'can read you' },
  },
  BLOCKED: {
    mark: '✕',
    ring: 'border-negative/40 bg-negative/8',
    text: 'text-negative',
    label: { he: 'חסום — לא יכול לקרוא אתכם', en: 'blocked — cannot read you' },
  },
  TRAINING_ONLY_BLOCKED: {
    mark: '◐',
    ring: 'border-caution/30 bg-caution/8',
    text: 'text-caution',
    label: { he: 'קורא אתכם, לא לומד מכם', en: 'reads you, does not train on you' },
  },
} as const

export const AccessPanel = ({
  access,
  language,
}: {
  access: AiAccessReport
  language: Lang
}) => {
  const he = language === 'he'
  const anyBlocked = access.blocked.length > 0

  return (
    <section
      className={`rounded-xl border p-6 sm:p-8 ${
        anyBlocked ? 'border-negative/40 bg-negative/5' : 'border-line bg-white'
      }`}
    >
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">
        {t('הבדיקה הראשונה', 'The first check', language)}
      </p>

      <h2 className="mt-2 text-xl font-semibold tracking-tight">
        {anyBlocked
          ? t(
              `האתר שלכם חוסם ${access.blocked.map((a) => a.name).join(' ו-')}`,
              `Your site blocks ${access.blocked.map((a) => a.name).join(' and ')}`,
              language,
            )
          : t('כל מערכות ה-AI מורשות לקרוא את האתר', 'Every AI system is allowed to read the site', language)}
      </h2>

      <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-muted">
        {anyBlocked
          ? t(
              'לפני הכול: יש באתר קובץ שאומר לתוכנות מסוימות לא להיכנס, והוא מזכיר בשמן את התוכנות שמזינות את המערכות שלמטה. כל עוד זה ככה, שום שיפור אחר בדוח לא ישנה עבורן כלום — הן פשוט לא קוראות את האתר.'
              ,
              'First things first: there is a file on your site telling certain programs to stay out, and it names the ones that feed the systems below. While that is true, no other improvement in this report changes anything for them — they simply do not read the site.',
              language,
            )
          : t(
              'בדקנו את הקובץ שקובע מי מורשה לקרוא את האתר, מול השם של כל תוכנה שמזינה מערכת AI בנפרד. אף אחת מהן לא חסומה.',
              'We checked the file that decides who may read the site, against the name of each program that feeds an AI system. None of them is blocked.',
              language,
            )}
      </p>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {access.assistants.map((assistant) => {
          const state = STATE[assistant.verdict]
          return (
            <li
              key={assistant.assistant}
              className={`flex items-start gap-3 rounded-lg border p-4 ${state.ring}`}
            >
              <span className={`mt-0.5 shrink-0 text-lg font-bold leading-none ${state.text}`}>
                {state.mark}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{assistant.name}</p>
                <p className={`mt-0.5 text-sm ${state.text}`}>
                  {he ? state.label.he : state.label.en}
                </p>
                {assistant.blockedAgents.length > 0 ? (
                  <p className="mt-1.5 break-all font-mono text-xs text-muted" dir="ltr">
                    {assistant.blockedAgents.join(', ')}
                  </p>
                ) : null}
              </div>
            </li>
          )
        })}
      </ul>

      {anyBlocked ? (
        <div className="mt-6 rounded-lg border border-line bg-white p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">
            {t('איפה זה נמצא ומה לעשות', 'Where this is and what to do', language)}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed">
            {t(
              'בקובץ בשם robots.txt, בשורש האתר — אפשר לראות אותו בכתובת שלכם עם ‎/robots.txt בסוף. חפשו שם את השורות עם השמות שמופיעים למעלה באדום, ומחקו את השורה Disallow שמתחת לכל אחת מהן.',
              'In a file called robots.txt at the site root — open your address with /robots.txt on the end to see it. Find the lines with the names shown in red above, and delete the Disallow line under each.',
              language,
            )}
          </p>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            {t(
              'לרוב זה לא נעשה בכוונה: תוסף אבטחה, הגדרה של חברת האחסון, או מישהו שהוסיף חסימה כשדובר בעיתונות על "AI שגונב תוכן". אם זה כן היה בכוונה — זו החלטה לגיטימית, פשוט תדעו שהמחיר שלה הוא לא להופיע בתשובות של המערכות האלה.',
              'Usually this was not deliberate: a security plugin, a hosting default, or somebody adding a block while the press was full of "AI stealing content". If it was deliberate, that is a legitimate choice — just know its price is not appearing in those systems’ answers.',
              language,
            )}
          </p>
        </div>
      ) : null}

      <p className="mt-5 text-xs leading-relaxed text-muted">
        {t(
          'הערה על דיוק: אנחנו בודקים את ההרשאה בלבד — מה שהאתר שלכם מצהיר שמותר לקרוא. זה לא מבטיח שמערכת כלשהי אכן קראה אתכם, וגם לא מתי. את זה מודדים בנפרד, בשאילת המערכות עצמן.',
          'A note on precision: we check permission only — what your site declares may be read. That does not promise any system has read you, or when. That is measured separately, by asking the systems themselves.',
          language,
        )}
      </p>
    </section>
  )
}
