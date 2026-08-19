import Link from 'next/link'

/**
 * The acquisition surface: a free scan.
 *
 * The funnel the brief describes starts here — a business owner enters a domain, sees a
 * real number, and is shown what is fixable. The copy promises what the product can
 * actually do and nothing more.
 */
export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">
        Where do AI assistants send your customers?
      </h1>
      <p className="mt-4 max-w-2xl text-[--color-muted]">
        When someone asks ChatGPT, Gemini or Claude for a business like yours, you are
        either in the answer or you are not. We measure how often you are, work out what is
        stopping you, and fix the parts that are actually on your own website.
      </p>

      <form className="mt-8 flex max-w-xl gap-2" action="/dashboard">
        <input
          type="url"
          name="website"
          required
          placeholder="https://your-business.co.il"
          className="flex-1 rounded-lg border border-[--color-line] px-4 py-3 text-sm outline-none focus:border-[--color-accent]"
        />
        <button
          type="submit"
          className="rounded-lg bg-[--color-accent] px-5 py-3 text-sm font-medium text-white"
        >
          Run a free scan
        </button>
      </form>

      <p className="mt-3 text-xs text-[--color-muted]">
        No credit card. The first result appears in about a minute.
      </p>

      <section className="mt-14 grid gap-6 sm:grid-cols-3">
        {[
          {
            title: 'We measure',
            body: 'Real customer questions, in Hebrew and English, across several AI engines.',
          },
          {
            title: 'We diagnose',
            body: 'What is missing, and honestly which parts of it we can change for you.',
          },
          {
            title: 'We fix and re-measure',
            body: 'Safe changes are applied and reversible. Then we measure again.',
          },
        ].map((item) => (
          <div key={item.title}>
            <h2 className="text-sm font-semibold">{item.title}</h2>
            <p className="mt-1 text-sm text-[--color-muted]">{item.body}</p>
          </div>
        ))}
      </section>

      <p className="mt-14 text-xs text-[--color-muted]">
        We cannot control what any AI system says, and we will not claim otherwise. What we
        can do is make the information about your business unmistakable, and show you the
        measurements.{' '}
        <Link href="/dashboard" className="underline">
          See an example dashboard
        </Link>
        .
      </p>
    </main>
  )
}
