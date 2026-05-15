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
        Last updated: May 15, 2026 · Offered by BryantLabs.Dev (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for the TrackoraAI
        product.
      </p>

      <p className="privacy-lead">
        This policy describes how BryantLabs.Dev handles information when you use TrackoraAI on the web or in our
        mobile apps. It reflects what the product does today—not hypothetical certifications or compliance programs.
        Questions or privacy requests:{' '}
        <a href="mailto:Bryantlabs.dev@gmail.com">Bryantlabs.dev@gmail.com</a>. Our{' '}
        <a href="/terms">Terms of Service</a> govern use of the product.
      </p>

      <section className="privacy-section" id="summary">
        <h2>Summary</h2>
        <ul>
          <li>
            <strong>Accounts</strong> use Supabase authentication and database storage. We store a{' '}
            <strong>profile</strong> (email, plan and usage fields, workspace preferences, billing sync fields).
          </li>
          <li>
            <strong>Coaching and recognition inputs</strong> you submit are processed to generate AI outputs. As
            implemented today, full generated forms from the main flow are <strong>not stored</strong> in our database.
          </li>
          <li>
            <strong>AI</strong> is provided by OpenAI when configured: your inputs are sent to generate a response
            returned to your device.
          </li>
          <li>
            <strong>Billing</strong> is processed by Stripe; we do not store full card numbers. We sync subscription
            status, usage limits, and related identifiers via Stripe checkout and webhooks.
          </li>
          <li>
            <strong>First-party product events</strong> may be logged on our servers (not third-party ad/analytics
            SDKs) for product improvement, billing support, abuse prevention, and reliability.
          </li>
          <li>
            <strong>Optional error monitoring</strong> (Sentry) may collect technical diagnostic data when enabled in
            an environment.
          </li>
          <li>
            We use <strong>localStorage</strong> and <strong>sessionStorage</strong> for lightweight preferences and UI
            hints.
          </li>
        </ul>
      </section>

      <section className="privacy-section" id="collect">
        <h2>Information we collect and store</h2>

        <h3 className="privacy-subhead">1. Account and profile (Supabase)</h3>
        <p>
          When you sign up or sign in, we maintain a profile linked to your user id, including: email address; plan
          tier and access fields (Free, Pro, Elite); usage counters for free-tier AI generations and monthly refinement
          usage where applicable; onboarding and UX flags; your <strong>coaching workspace</strong> preference; and
          Stripe identifiers (customer and subscription ids, plus status and billing-period fields synced from
          webhooks) needed to manage access and enforce limits.
        </p>
        <p>
          We do <strong>not</strong> use this profile table to store the full text of generated coaching forms in the
          main generation path the application implements today.
        </p>

        <h3 className="privacy-subhead">2. Coaching, recognition, and AI processing</h3>
        <p>
          Inputs you provide (for example employee name, coaching topic, notes, coaching vs recognition mode, and
          workspace selection) are sent from your browser or app to our server, and when OpenAI is enabled, to OpenAI, to
          produce a draft. Outputs are returned to your device. <strong>Review all AI output before use.</strong> Treat
          free-text fields as workplace-appropriate; avoid highly sensitive personal data you would not put in an
          ordinary internal note.
        </p>

        <h3 className="privacy-subhead">3. Section refinement</h3>
        <p>
          If you use paid section refinement, the app sends the selected section text, surrounding form context,
          refinement instructions, and related metadata to the AI provider. That flow does not store the refined
          document in our database as implemented today.
        </p>

        <h3 className="privacy-subhead">4. Billing and subscriptions (Stripe)</h3>
        <p>
          Payments, payment methods, and subscription lifecycle events are handled by <strong>Stripe</strong>. TrackoraAI
          does <strong>not</strong> store full payment card numbers. We store Stripe customer and subscription
          identifiers and related status fields in Supabase. Checkout may attach metadata such as your user id, plan
          tier, and optionally your email so webhooks can associate a subscription with the correct profile. Plan
          changes (including upgrades with proration where implemented) are processed through Stripe. Stripe&apos;s
          privacy policy governs card and payment data held at Stripe.
        </p>

        <h3 className="privacy-subhead">5. Server-side product events</h3>
        <p>
          Our API may record <strong>first-party, server-side product events</strong> tied to your account id (for
          example, coaching generation completed, section refined, checkout started, or plan upgrade initiated). These
          events help us operate the service, understand usage, support billing, prevent abuse, and improve reliability.
          They are <strong>not</strong> used for third-party advertising, and the shipped web client does{' '}
          <strong>not</strong> include third-party analytics SDKs such as Google Analytics.
        </p>

        <h3 className="privacy-subhead">6. Optional error monitoring (Sentry)</h3>
        <p>
          When <strong>SENTRY_DSN</strong> (server) or <strong>VITE_SENTRY_DSN</strong> (client) is configured in an
          environment, error reports may be sent to <strong>Sentry</strong> with technical diagnostic information (such
          as error messages, stack traces, release/build context, and request path). We use this to investigate crashes
          and reliability issues—not to profile you for marketing.
        </p>

        <h3 className="privacy-subhead">7. In-app feedback (optional)</h3>
        <p>
          If you submit feedback, we store in Supabase: your user id; your account email when available; the message you
          wrote; and an optional follow-up email if you provide one.
        </p>

        <h3 className="privacy-subhead">8. Browser and device storage</h3>
        <p>
          <strong>localStorage</strong> may hold your coaching workspace preference, a small usage display shadow, and a
          tutorial-completion cache key. <strong>sessionStorage</strong> may hold short-lived UI flags for the current
          tab. Native mobile builds (iOS/Android via Capacitor) use the same web application shell; OS-level storage and
          permissions follow your device settings. You can clear browser storage in your device or browser settings.
        </p>
      </section>

      <section className="privacy-section" id="use">
        <h2>How we use information</h2>
        <p>
          To authenticate you, enforce plan and usage limits, generate coaching and recognition text with AI when
          enabled, process subscriptions and billing sync, remember preferences, respond to voluntary feedback, monitor
          reliability, and protect the service from abuse.
        </p>
        <p>
          We do <strong>not</strong> sell your personal information.
        </p>
      </section>

      <section className="privacy-section" id="providers">
        <h2>Service providers</h2>
        <ul>
          <li>
            <strong>Supabase</strong> — authentication and database
          </li>
          <li>
            <strong>Stripe</strong> — payments, subscriptions, billing portal, and webhooks
          </li>
          <li>
            <strong>OpenAI</strong> — AI completions for coaching, recognition, and refinements
          </li>
          <li>
            <strong>Sentry</strong> (optional) — error and crash diagnostics when enabled
          </li>
        </ul>
        <p>
          The marketing site may load fonts from Google Fonts; your browser may contact Google. See Google&apos;s
          policies for what they collect from those requests. Mobile apps are distributed through Apple App Store and
          Google Play where applicable; those platforms have their own policies for app distribution and updates.
        </p>
      </section>

      <section className="privacy-section" id="ai">
        <h2>AI-generated content</h2>
        <p>
          TrackoraAI is an <strong>AI-assisted drafting tool</strong>. Outputs are machine-generated suggestions, not
          legal, medical, or HR advice. You are responsible for reviewing, editing, and deciding what to use in your
          workplace, and for ensuring your use complies with employer policies and applicable laws.
        </p>
      </section>

      <section className="privacy-section" id="logging">
        <h2>Server logs, security, and operations</h2>
        <p>
          Our servers use operational logging (for example billing sync, Stripe webhooks, checkout, and errors). Some
          verbose diagnostic logs are limited to non-production environments. Depending on your host, production logs may
          still capture high-level operational messages—avoid putting secrets in support tickets.
        </p>
        <p>
          We apply baseline <strong>security headers</strong> on API responses and expose a <strong>health check</strong>{' '}
          endpoint for monitoring. These measures reduce common web risks but do not guarantee that no incident will ever
          occur.
        </p>
      </section>

      <section className="privacy-section" id="retention">
        <h2>Retention and deletion</h2>
        <p>
          Profile, product-event, and billing-sync data live in Supabase until your account is deleted or we delete data
          as part of account processes we maintain. Feedback remains until deleted under our internal practices. Stripe
          retains billing records under Stripe&apos;s policies. Browser storage lasts until you clear it. Sentry retains
          error data according to Sentry&apos;s settings and our configuration when enabled.
        </p>
        <p>
          For account or data deletion requests, email{' '}
          <a href="mailto:Bryantlabs.dev@gmail.com">Bryantlabs.dev@gmail.com</a>. We will respond in line with what our
          Supabase project, Stripe account, and other providers allow.
        </p>
      </section>

      <section className="privacy-section" id="security">
        <h2>Security</h2>
        <p>
          We rely on HTTPS in production, authenticated API routes, Row Level Security on applicable user-facing tables,
          validated API inputs, verified Stripe webhooks, and duplicate-event protection on billing webhooks where
          implemented. No security practice is perfect—use a strong password and protect your session.
        </p>
        <p>
          We do <strong>not</strong> represent that TrackoraAI meets HIPAA, SOC 2, or other specialized compliance
          frameworks unless we state that separately in writing.
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
