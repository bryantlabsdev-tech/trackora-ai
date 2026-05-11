import '../privacy.css'

/**
 * Full policy body (used on /privacy and inside Account Settings modal).
 * Wrap with `<article className="card privacy-card">` (or settings modal wrapper).
 */
export default function PrivacyPolicyContent() {
  return (
    <>
      <p className="privacy-kicker">TrackoraAI</p>
      <h1 className="privacy-title" id="privacy-policy-title">
        Privacy Policy
      </h1>
      <p className="privacy-meta">
        Last updated: May 11, 2026 · Offered by BryantLabs.Dev (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for the TrackoraAI
        product.
      </p>

      <p className="privacy-lead">
        This policy describes how BryantLabs.Dev handles information when you use TrackoraAI. It reflects what the
        product does in its codebase today—not hypothetical features. Questions or privacy requests:{' '}
        <a href="mailto:Bryantlabs.dev@gmail.com">Bryantlabs.dev@gmail.com</a>. Our{' '}
        <a href="/terms">Terms of Service</a> govern use of the product.
      </p>

      <section className="privacy-section" id="summary">
        <h2>Summary</h2>
        <ul>
          <li>
            <strong>Accounts</strong> use Supabase authentication. We store a <strong>profile</strong> row (email,
            plan and usage fields, billing sync fields, coaching preferences).
          </li>
          <li>
            <strong>Coaching forms you generate</strong> are produced in real time and are{' '}
            <strong>not saved to our database</strong> as part of the shipped generation flow.
          </li>
          <li>
            <strong>AI</strong> is provided by OpenAI when configured: your coaching inputs are sent to generate a
            response, which is returned to your browser.
          </li>
          <li>
            <strong>Billing</strong> is processed by Stripe; we sync subscription-related identifiers and status into
            your profile.
          </li>
          <li>
            <strong>Optional feedback</strong> you send is stored in Supabase.
          </li>
          <li>
            We use <strong>localStorage</strong> and <strong>sessionStorage</strong> for lightweight preferences and UI
            hints (workspace choice, tutorial/paywall flags, optional usage display).
          </li>
        </ul>
      </section>

      <section className="privacy-section" id="collect">
        <h2>Information we collect and store</h2>

        <h3 className="privacy-subhead">1. Account and profile (Supabase)</h3>
        <p>
          When you use authentication, we maintain a profile linked to your user id, including: email address; plan
          and access fields (e.g. free vs paid tier, subscription status synced from Stripe); usage counters for
          free-tier AI generations and monthly refinement usage where applicable; onboarding and UX flags (such as
          tutorial completion); your <strong>coaching workspace</strong> preference and a one-time setup flag for new
          accounts; and Stripe identifiers (customer and subscription ids, plus status and period fields we sync from
          webhooks) needed to manage access.
        </p>
        <p>
          We do <strong>not</strong> use this profile table to store the full text of generated coaching forms in the
          generation path the application implements today.
        </p>

        <h3 className="privacy-subhead">2. Coaching and AI features</h3>
        <p>
          Inputs you provide (for example employee name, coaching topic, notes, coaching vs recognition mode, and
          workspace selection) are sent from your browser to our server, and when OpenAI is enabled, to OpenAI, to
          produce a draft. Outputs are returned to your browser. Treat free-text fields as workplace-appropriate; avoid
          highly sensitive personal data you would not put in an ordinary internal note.
        </p>

        <h3 className="privacy-subhead">3. Section refinement</h3>
        <p>
          If you use paid section refinement, the app sends the selected section text, surrounding form context,
          refinement instructions, and related metadata to the AI provider. That flow does not store the refined
          document in our database as implemented today.
        </p>

        <h3 className="privacy-subhead">4. Billing (Stripe)</h3>
        <p>
          Payments and payment methods are handled by Stripe. We store Stripe customer and subscription identifiers and
          related status fields in Supabase. Checkout may attach metadata such as your user id, plan tier, and
          optionally your email when the client supplies it, so webhooks can associate a subscription with the correct
          profile. Stripe&apos;s own privacy policy governs card and payment data held at Stripe.
        </p>

        <h3 className="privacy-subhead">5. In-app feedback (optional)</h3>
        <p>
          If you submit feedback, we store in Supabase: your user id; your account email when available; the message you
          wrote; and an optional follow-up email if you provide one.
        </p>

        <h3 className="privacy-subhead">6. Browser storage</h3>
        <p>
          <strong>localStorage</strong> may hold your coaching workspace preference, a small usage display shadow, and a
          tutorial-completion cache key. <strong>sessionStorage</strong> may hold short-lived UI flags (for example
          paywall or warmup tip) for the current tab. You can clear these in your browser settings.
        </p>
      </section>

      <section className="privacy-section" id="use">
        <h2>How we use information</h2>
        <p>
          To authenticate you, enforce plan limits, generate coaching text with AI when enabled, process subscriptions,
          remember preferences, and read voluntary feedback.
        </p>
        <p>
          We do <strong>not</strong> sell your personal information. The shipped web client does{' '}
          <strong>not</strong> include first-party product analytics SDKs (such as Google Analytics or similar) in the
          repository as built today.
        </p>
      </section>

      <section className="privacy-section" id="providers">
        <h2>Service providers</h2>
        <ul>
          <li>
            <strong>Supabase</strong> — authentication and database
          </li>
          <li>
            <strong>Stripe</strong> — payments and billing portal
          </li>
          <li>
            <strong>OpenAI</strong> — AI completions for coaching and refinements
          </li>
        </ul>
        <p>
          The marketing site loads fonts from Google Fonts; your browser may contact Google. See Google&apos;s policies
          for what they collect from those requests.
        </p>
      </section>

      <section className="privacy-section" id="ai">
        <h2>AI-generated content</h2>
        <p>
          Outputs are machine-generated suggestions, not legal or HR advice. You are responsible for reviewing and
          deciding what to use in your workplace.
        </p>
      </section>

      <section className="privacy-section" id="logging">
        <h2>Server logs and development</h2>
        <p>
          The server uses console logging for operations (for example billing sync, Stripe webhooks, checkout setup, and
          errors). Some diagnostic logs are limited to non-production environments. Depending on your host, production
          logs may still capture high-level operational messages—avoid putting secrets in support tickets.
        </p>
      </section>

      <section className="privacy-section" id="retention">
        <h2>Retention and deletion</h2>
        <p>
          Profile and billing-sync data live in Supabase until your account is deleted or we delete data as part of
          account processes we maintain. Feedback remains until deleted under our internal practices. Stripe retains
          billing records under Stripe&apos;s policies. Browser storage lasts until you clear it.
        </p>
        <p>
          For account or data deletion requests, email{' '}
          <a href="mailto:Bryantlabs.dev@gmail.com">Bryantlabs.dev@gmail.com</a>. We will respond in line with what
          our Supabase project and Stripe account allow.
        </p>
      </section>

      <section className="privacy-section" id="security">
        <h2>Security</h2>
        <p>
          We rely on HTTPS in production, authenticated API routes, Row Level Security on applicable tables (such as
          feedback), and verified Stripe webhooks. No security practice is perfect—use a strong password and protect your
          session.
        </p>
      </section>

      <section className="privacy-section" id="children">
        <h2>Children</h2>
        <p>TrackoraAI is intended for adult workplace use and is not directed at children.</p>
      </section>

      <section className="privacy-section" id="international">
        <h2>International users</h2>
        <p>
          Infrastructure providers may process data in the United States or other regions where they operate. By using
          the product, you acknowledge that processing may occur outside your home country.
        </p>
      </section>

      <section className="privacy-section" id="changes">
        <h2>Changes to this policy</h2>
        <p>
          We may update this policy as TrackoraAI changes. We will revise the &ldquo;Last updated&rdquo; date when we do.
          Material changes may also be communicated in-app or by email where appropriate.
        </p>
      </section>

      <footer className="privacy-foot">
        <strong>BryantLabs.Dev</strong> — TrackoraAI · Privacy:{' '}
        <a href="mailto:Bryantlabs.dev@gmail.com">Bryantlabs.dev@gmail.com</a>
        {' · '}
        <a href="/terms">Terms of Service</a>
      </footer>
    </>
  )
}
