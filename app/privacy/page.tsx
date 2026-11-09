import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Privacy policy · Exam App" };

const UPDATED = "November 9, 2026";

/** Public privacy policy (linked from the Google OAuth consent screen). */
export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 text-sm leading-relaxed text-ink">
      <h1 className="text-2xl font-semibold">Privacy policy</h1>
      <p className="mt-1 text-ink-muted">Last updated {UPDATED}</p>

      <div className="mt-6 flex flex-col gap-5 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold [&_li]:ml-5 [&_li]:list-disc">
        <p>
          Exam App is a private review site for the Electronics Engineering board exam, used by a small group of approved
          members. This page explains what it stores and why.
        </p>

        <section>
          <h2>What we collect</h2>
          <ul>
            <li>Your Google account name, email address and profile picture, when you sign in with Google.</li>
            <li>
              What you do in the app: exam answers and scores, study time, notes, formulas, saved questions, timeline markers and
              weekly targets.
            </li>
            <li>Pictures you add to notes or questions, stored with our hosting provider.</li>
          </ul>
        </section>

        <section>
          <h2>Google Drive</h2>
          <p>
            Only the site administrator connects Google Drive, to upload the review videos and stream them in the site&rsquo;s
            player. The app asks for the <code className="rounded bg-bg-muted px-1 font-mono text-xs">drive.file</code> permission, which lets it see and manage only the files it
            uploaded itself, not anything else in that Drive. The access token is stored encrypted and used only to upload and
            play those videos. Members never connect their own Drive.
          </p>
          <p className="mt-2">
            The app&rsquo;s use of information received from Google APIs adheres to the Google API Services User Data Policy,
            including the Limited Use requirements.
          </p>
        </section>

        <section>
          <h2>How it&rsquo;s used</h2>
          <p>
            Only to run the site: sign you in, save your progress, and show your own study history. Your data is not sold,
            shared for advertising, or used to train AI models.
          </p>
        </section>

        <section>
          <h2>Services that process data for us</h2>
          <ul>
            <li>Vercel (hosting and picture storage) and Neon (database).</li>
            <li>Google (sign-in, and Drive for the video library).</li>
            <li>
              Anthropic (Claude), only when you ask the app for an explanation or answer suggestions: the question text is sent
              to generate them.
            </li>
          </ul>
        </section>

        <section>
          <h2>Keeping and deleting your data</h2>
          <p>
            Your data is kept while you use the site. Ask the administrator who approved your access and your account and
            data will be deleted. You can also remove the app&rsquo;s access to your Google account at any
            time in your Google Account settings under Security → Third-party apps.
          </p>
        </section>

        <p className="text-ink-muted">
          See also the{" "}
          <Link href="/terms" className="text-accent hover:underline">
            terms of service
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
