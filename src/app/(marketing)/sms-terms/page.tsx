import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { SMS_AGREEMENT_VERSION, VOICE_AGREEMENT_VERSION } from "@/lib/consent/agreements";

export const metadata: Metadata = { title: "SMS Terms and Consent" };

export default function SmsTermsPage() {
  return (
    <LegalPage title="SMS Terms and Consent" version={`${SMS_AGREEMENT_VERSION} / ${VOICE_AGREEMENT_VERSION}`}>
      <section>
        <h2>Program description</h2>
        <p>
          LastStep Accountability Reminders sends automated text messages about assignments you created in LastStep:
          reminders before a deadline, at the deadline, check-ins while work is unfinished, a follow-up if it becomes
          overdue, and (if enabled) a confirmation when your submission is accepted. We do not send marketing messages.
        </p>
      </section>
      <section>
        <h2>Consent</h2>
        <p>
          You opt in by verifying your phone number and checking the separate, unchecked SMS consent box. Consent is not
          a condition of using LastStep. Automated voice-call reminders require an additional, separate consent.
        </p>
      </section>
      <section>
        <h2>Frequency</h2>
        <p>
          Message frequency varies with your assignments and chosen intensity. LastStep never exceeds the daily maximum
          you set (4 per day by default, 12 at most) and never sends during your quiet hours.
        </p>
      </section>
      <section>
        <h2>Costs and delivery</h2>
        <p>
          Message and data rates may apply. Delivery depends on your carrier and our provider and is not guaranteed.
          Carriers are not liable for delayed or undelivered messages.
        </p>
      </section>
      <section>
        <h2>Opting out</h2>
        <ul>
          <li>
            Reply <strong>STOP</strong> to any message to stop SMS and voice reminders. We will send no further
            reminders to that number, and any queued reminders are canceled.
          </li>
          <li>
            Reply <strong>START</strong> to resubscribe to SMS reminders.
          </li>
          <li>
            Reply <strong>HELP</strong> for help.
          </li>
          <li>You can also turn off texts or calls, or revoke consent, in Notification Settings.</li>
        </ul>
      </section>
      <section>
        <h2>Voice calls</h2>
        <p>
          Voice reminders are optional, off by default, limited to one call per assignment and one per day by default,
          never placed during quiet hours, and can be turned off independently of texts.
        </p>
      </section>
      <section>
        <h2>Records</h2>
        <p>
          We keep a record of when you granted or revoked consent, which agreement version applied, and the IP address
          and browser user-agent at that time.
        </p>
      </section>
    </LegalPage>
  );
}
