import '../privacy.css'

/**
 * Terms body for /terms (same typography shell as Privacy Policy via privacy.css).
 */
export default function TermsOfServiceContent() {
  return (
    <>
      <p className="privacy-kicker">TrackoraAI</p>
      <h1 className="privacy-title" id="terms-of-service-title">
        Terms of Service
      </h1>
      <p className="privacy-meta">
        Effective: May 15, 2026 · Offered by BryantLabs.Dev (&ldquo;we&rdquo;, &ldquo;us&rdquo;) for the TrackoraAI
        product (&ldquo;Service&rdquo;).
      </p>

      <p className="privacy-lead">
        These Terms govern your use of TrackoraAI on the web and in our mobile apps. TrackoraAI is an{' '}
        <strong>AI-assisted tool</strong> for drafting workplace coaching and recognition forms—not a law firm, HR
        consultancy, or certified compliance program. Questions:{' '}
        <a href="mailto:Bryantlabs.dev@gmail.com">Bryantlabs.dev@gmail.com</a>. See also our{' '}
        <a href="/privacy">Privacy Policy</a>.
      </p>

      <section className="privacy-section" id="acceptance">
        <h2>Acceptance of Terms</h2>
        <p>
          By creating an account, signing in, downloading our app, or using the Service, you agree to these Terms. If
          you do not agree, do not use TrackoraAI. You must be old enough to enter a binding contract where you live and
          use the Service only for lawful workplace purposes.
        </p>
        <p>
          These Terms are not legal advice. If you need advice about employment law or internal policies, consult
          qualified professionals.
        </p>
      </section>

      <section className="privacy-section" id="product">
        <h2>Product Description</h2>
        <p>
          TrackoraAI helps you turn short notes into structured coaching or recognition forms. You choose a workspace
          mode—currently <strong>Mobile Sales Coaching</strong> or <strong>General Workplace Coaching</strong>—which
          shapes topics and wording style. Accounts and preferences are stored with Supabase; payments and subscriptions
          run through Stripe (including checkout, billing portal, webhooks, and proration where implemented); AI text is
          produced with OpenAI when the Service is configured to use it.
        </p>
        <p>
          The Service is also available through <strong>native mobile builds</strong> (iOS and Android via Capacitor)
          that load the same application experience. You are responsible for keeping your app and device reasonably
          secure.
        </p>
        <p>
          As implemented today, <strong>completed forms from the main generation flow are not stored in our database</strong>
          . You are responsible for saving, exporting, or sharing anything you want to keep.
        </p>
      </section>

      <section className="privacy-section" id="accounts">
        <h2>Accounts &amp; Access</h2>
        <p>
          You sign up and sign in through Supabase authentication. You are responsible for your password, device
          security, and any activity under your account. Keep your login private. We may suspend or end access if we
          reasonably believe these Terms were broken, limits were evaded, or the Service is being abused.
        </p>
      </section>

      <section className="privacy-section" id="billing">
        <h2>Subscription Billing</h2>
        <p>
          Paid plans are billed by <strong>Stripe</strong> on a <strong>recurring subscription</strong> basis at the
          prices shown in the product (currently <strong>Pro at $8.99/month</strong> and <strong>Elite at
          $11.99/month</strong> unless we change pricing with notice in these Terms or in-app). Taxes may apply where
          required.
        </p>
        <p>
          Stripe processes payment methods. TrackoraAI does <strong>not</strong> store full card numbers. Subscription
          status and billing-period information are synchronized via Stripe webhooks to enforce plan access and usage
          limits.
        </p>
        <p>
          You can <strong>cancel or manage your subscription</strong> (including payment method updates) through the
          Stripe customer billing portal linked from the app when available. When you cancel, you typically keep paid
          access through the end of the billing period you already paid for, as reflected in Stripe—exact timing follows
          Stripe&apos;s records and your subscription status.
        </p>
        <p>
          <strong>Refunds:</strong> We do not guarantee refunds for partial billing periods unless required by
          applicable law or unless we explicitly approve a refund in writing. If you believe a charge is in error,
          contact us at the email above and we will review in good faith.
        </p>
      </section>

      <section className="privacy-section" id="plans">
        <h2>Free, Pro &amp; Elite Usage</h2>
        <p>
          <strong>Free</strong> includes a <strong>limited number</strong> of AI-backed coaching generations per account,
          enforced on the server (see in-app messaging for the current cap). Free does not include paid section
          refinements.
        </p>
        <p>
          <strong>Pro</strong> includes unlimited coaching generations and a <strong>monthly</strong> allowance of section
          refinements, counted in UTC and enforced server-side.
        </p>
        <p>
          <strong>Elite</strong> includes unlimited generations and <strong>unlimited</strong> refinements within fair
          use of the Service. Upgrades from Pro to Elite may be handled in-app with proration as implemented at checkout
          or in the billing portal—details shown at purchase time apply.
        </p>
        <p>
          We may adjust plan features or limits to keep the Service reliable. If we make a material adverse change, we
          will try to give reasonable notice in-app or by email.
        </p>
      </section>

      <section className="privacy-section" id="ai">
        <h2>AI-Generated Content</h2>
        <p>
          Outputs are <strong>suggestions only</strong>. They are not legal, medical, or HR advice. Models can be wrong,
          omit context, or reflect biases. <strong>You must review, edit, and approve</strong> all content before using
          it with employees, candidates, or teams.
        </p>
        <p>
          You are solely responsible for how you apply anything produced in TrackoraAI. Do not rely on AI output as a
          substitute for required documentation, investigations, or decisions that need human judgment.
        </p>
      </section>

      <section className="privacy-section" id="acceptable-use">
        <h2>Acceptable Use</h2>
        <p>You agree not to:</p>
        <ul>
          <li>Use the Service for anything illegal or to promote illegal activity.</li>
          <li>Harass, threaten, bully, or discriminate against others, or generate content intended to do so.</li>
          <li>Violate others&apos; privacy, publicity, or intellectual property rights.</li>
          <li>Impersonate another person or misrepresent your authority to speak for an employer or team.</li>
          <li>
            Submit or request highly sensitive personal data (such as health diagnoses, government IDs, or financial
            account numbers) unless you have a lawful, authorized reason and your organization permits it.
          </li>
          <li>
            Misuse AI outputs—for example by presenting machine-generated text as guaranteed factual findings, formal
            legal filings, or official HR decisions without appropriate human review.
          </li>
          <li>
            Probe, disrupt, or bypass security, rate limits, plan limits, or billing controls—including using multiple
            accounts to evade limits.
          </li>
          <li>
            Reverse engineer or scrape the Service in a way that burdens systems or breaks agreements with our
            providers.
          </li>
        </ul>
      </section>

      <section className="privacy-section" id="user-responsibilities">
        <h2>User Responsibilities</h2>
        <p>
          You provide accurate account information where asked. You are responsible for ensuring that your use of
          TrackoraAI—including the notes you enter and the forms you share—complies with{' '}
          <strong>your employer&apos;s policies</strong>, workplace rules, collective agreements where applicable, and
          applicable laws. Obtain any internal approvals your organization requires before using or distributing
          generated forms.
        </p>
        <p>
          You are responsible for your conduct and for content you submit or distribute using the Service. We do not
          supervise your workplace decisions.
        </p>
      </section>

      <section className="privacy-section" id="ip">
        <h2>Intellectual Property</h2>
        <p>
          TrackoraAI, its branding, and the software are owned by BryantLabs.Dev or its licensors. Subject to these
          Terms, we grant you a personal, non-exclusive, non-transferable right to use the Service while your account is
          in good standing.
        </p>
        <p>
          You keep rights to the notes and inputs you supply. You receive the practical ability to use the text the
          Service generates for your workplace needs; do not resell the Service itself or misrepresent AI output as
          human-authored legal or compliance certification.
        </p>
      </section>

      <section className="privacy-section" id="availability">
        <h2>Availability &amp; Changes</h2>
        <p>
          We aim to keep the Service online but <strong>do not guarantee</strong> uninterrupted access, specific uptime
          percentages, or error-free operation. Maintenance, third-party outages (Supabase, Stripe, OpenAI, hosting,
          app stores), or bugs may cause downtime. Features may change as we ship improvements. Health checks and
          operational monitoring help us run the Service but do not create a service-level commitment to you.
        </p>
      </section>

      <section className="privacy-section" id="disclaimer">
        <h2>Disclaimer of Warranties</h2>
        <p>
          THE SERVICE IS PROVIDED <strong>&ldquo;AS IS&rdquo;</strong> AND <strong>&ldquo;AS AVAILABLE&rdquo;</strong>,
          WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING IMPLIED WARRANTIES OF
          MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT, TO THE MAXIMUM EXTENT PERMITTED
          BY LAW. WE DO NOT WARRANT THAT AI OUTPUTS WILL BE ACCURATE, COMPLETE, UNBIASED, OR SUITABLE FOR YOUR
          WORKPLACE.
        </p>
      </section>

      <section className="privacy-section" id="liability">
        <h2>Limitation of Liability</h2>
        <p>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, BRYANTLABS.DEV AND ITS AFFILIATES, OFFICERS, AND SUPPLIERS ARE{' '}
          <strong>NOT LIABLE</strong> FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR FOR LOST
          PROFITS, GOODWILL, OR DATA, ARISING FROM YOUR USE OF THE SERVICE OR RELIANCE ON AI OUTPUTS. OUR TOTAL LIABILITY
          FOR ANY CLAIM RELATED TO THE SERVICE IS LIMITED TO THE GREATER OF <strong>USD $50</strong> OR THE AMOUNT YOU
          PAID US FOR THE SERVICE IN THE <strong>THREE MONTHS</strong> BEFORE THE EVENT GIVING RISE TO THE CLAIM.
        </p>
        <p>
          Some jurisdictions do not allow certain limitations; in those cases, our liability is limited to the fullest
          extent still permitted.
        </p>
      </section>

      <section className="privacy-section" id="termination">
        <h2>Termination</h2>
        <p>
          You may stop using the Service at any time and cancel your subscription through Stripe when available. We may
          suspend or terminate access for breach of these Terms, risk to the Service, or non-payment as handled through
          Stripe. Provisions that reasonably should survive (disclaimers, limits on liability, governing law) survive
          termination.
        </p>
      </section>

      <section className="privacy-section" id="changes-terms">
        <h2>Changes to These Terms</h2>
        <p>
          We may update these Terms as TrackoraAI evolves. We will change the &ldquo;Effective&rdquo; date when we do.
          Continued use after notice means you accept the updated Terms. If you disagree, cancel your subscription and
          stop using the Service.
        </p>
      </section>

      <section className="privacy-section" id="governing">
        <h2>Governing Law</h2>
        <p>
          These Terms are governed by the <strong>laws of the United States</strong> applicable to contracts made and
          performed there, without regard to conflict-of-law rules that would send the dispute elsewhere. If a dispute
          arises, we hope you contact us first so we can try to resolve it informally.
        </p>
      </section>

      <footer className="privacy-foot">
        <strong>BryantLabs.Dev</strong> — TrackoraAI · Terms &amp; privacy:{' '}
        <a href="mailto:Bryantlabs.dev@gmail.com">Bryantlabs.dev@gmail.com</a>
        {' · '}
        <a href="/privacy">Privacy Policy</a>
      </footer>
    </>
  )
}
