import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { TERMS_VERSION } from "@/lib/consent/agreements";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" version={TERMS_VERSION}>
      <section>
        <h2>The service</h2>
        <p>
          LastStep helps you track assignments, receive reminders you choose, and record completion by uploading a
          screenshot. It is a self-accountability tool. It does not verify academic work, communicate with your school,
          or guarantee any result.
        </p>
      </section>
      <section>
        <h2>Eligibility</h2>
        <p>
          You must be at least 13 years old. If you are under 18, you confirm that a parent or guardian has agreed to
          your use of LastStep.
        </p>
      </section>
      <section>
        <h2>Messaging is separate</h2>
        <p>
          Accepting these Terms does not authorize us to text or call you. SMS and voice reminders require separate,
          explicit consent described in the SMS Terms and Consent.
        </p>
      </section>
      <section>
        <h2>Your content</h2>
        <p>
          You keep ownership of what you upload. You grant LastStep a limited license to store and display it to you
          (and, for review-required assignments, to a designated reviewer) solely to operate the service. Only upload
          content you have the right to share, and don&apos;t upload other people&apos;s personal information.
        </p>
      </section>
      <section>
        <h2>Acceptable use</h2>
        <ul>
          <li>Don&apos;t attempt to access other users&apos; data or interfere with the service.</li>
          <li>Don&apos;t register phone numbers you don&apos;t own or control.</li>
          <li>Don&apos;t use LastStep to violate academic-integrity rules.</li>
        </ul>
      </section>
      <section>
        <h2>No guarantees</h2>
        <p>
          Reminders depend on carriers and providers and may be delayed or not delivered. LastStep is provided &quot;as
          is&quot; without warranties to the extent permitted by law.
        </p>
      </section>
      <section>
        <h2>Ending your account</h2>
        <p>
          You can delete your account at any time from Account Settings. We may suspend accounts that misuse the
          service.
        </p>
      </section>
    </LegalPage>
  );
}
