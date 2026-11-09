import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of service · Exam App" };

const CONTACT = "valentinjasongaje@gmail.com";
const UPDATED = "November 9, 2026";

/** Public terms of service (linked from the Google OAuth consent screen). */
export default function TermsPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 text-sm leading-relaxed text-ink">
      <h1 className="text-2xl font-semibold">Terms of service</h1>
      <p className="mt-1 text-ink-muted">Last updated {UPDATED}</p>

      <div className="mt-6 flex flex-col gap-5 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold">
        <section>
          <h2>Who can use it</h2>
          <p>
            Exam App is a private study tool. Only members approved by the administrator can sign in, and access can be removed
            at any time.
          </p>
        </section>

        <section>
          <h2>Review materials</h2>
          <p>
            The videos and questions are for your personal review only. Don&rsquo;t download, copy, record or share them
            outside the site.
          </p>
        </section>

        <section>
          <h2>No guarantees</h2>
          <p>
            The site is provided as is, free of charge. Answers, explanations and AI suggestions can contain mistakes; check
            them against your review materials. The site may change or be unavailable at times, and it isn&rsquo;t affiliated
            with the PRC or any review center.
          </p>
        </section>

        <section>
          <h2>Your data</h2>
          <p>
            How your information is handled is described in the{" "}
            <Link href="/privacy" className="text-accent hover:underline">
              privacy policy
            </Link>
            .
          </p>
        </section>

        <section>
          <h2>Contact</h2>
          <p>
            <a href={`mailto:${CONTACT}`} className="text-accent hover:underline">
              {CONTACT}
            </a>
          </p>
        </section>
      </div>
    </main>
  );
}
