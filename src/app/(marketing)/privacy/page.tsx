import type { Metadata } from "next";
import { LegalPage } from "@/components/marketing/legal-page";
import { PRIVACY_VERSION } from "@/lib/consent/agreements";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" version={PRIVACY_VERSION}>
      <section>
        <h2>What we collect</h2>
        <ul>
          <li>
            Account: email address, a display name you choose, password (hashed by our auth provider), and your time
            zone.
          </li>
          <li>Eligibility: a confirmation that you meet the minimum age. We do not collect your date of birth.</li>
          <li>Phone number (optional): stored only after you verify it, used only for reminders you consent to.</li>
          <li>Assignments you create: titles, descriptions, subjects, deadlines and your settings.</li>
          <li>Screenshots you upload as evidence of completed work.</li>
          <li>
            Notification records: when reminders were scheduled, sent, delivered, failed or canceled. We do not store
            message text in notification history.
          </li>
          <li>
            Consent records: what you agreed to, which version, when, and the IP address and browser user-agent at that
            moment.
          </li>
        </ul>
      </section>
      <section>
        <h2>How we use it</h2>
        <p>
          Only to run LastStep: to schedule and send the reminders you asked for, show your dashboard and progress, keep
          the service secure, and comply with legal obligations. We do not sell personal information, we do not use your
          data for advertising, and we do not use your assignments or screenshots to train AI models.
        </p>
      </section>
      <section>
        <h2>Screenshots</h2>
        <p>
          Uploads are re-encoded on our servers to remove embedded metadata (such as location or device details) and
          stored in private storage. They are accessible to you through short-lived links. If an assignment uses
          review-required completion, a designated reviewer may view that pending screenshot; each such access is
          logged. Screenshots are deleted when you delete them, when you delete your account, or automatically after the
          retention period (365 days by default).
        </p>
      </section>
      <section>
        <h2>Service providers</h2>
        <ul>
          <li>Supabase — database, authentication, and private file storage.</li>
          <li>Twilio — sending SMS, phone verification codes, and optional voice calls.</li>
          <li>Inngest — running scheduled reminder jobs.</li>
          <li>Vercel — application hosting.</li>
        </ul>
      </section>
      <section>
        <h2>Your choices</h2>
        <ul>
          <li>Turn off texts or calls, revoke consent, or reply STOP at any time.</li>
          <li>Export your data from Account Settings.</li>
          <li>Delete individual screenshots or your entire account from Account Settings.</li>
        </ul>
      </section>
      <section>
        <h2>Retention</h2>
        <p>
          Account data is kept while your account is active. When you delete your account we immediately stop all
          notifications, delete your screenshots, and delete your account records. If your number replied STOP, we keep
          a one-way cryptographic fingerprint of it (not the number itself) so we never message it again. Operational
          logs (webhook receipts, rate-limit counters) are purged on a rolling schedule.
        </p>
      </section>
      <section>
        <h2>Students and minors</h2>
        <p>
          LastStep is intended for students aged 13 and older. If you are under 18, you should have a parent or
          guardian&apos;s permission to use LastStep and to receive text or call reminders. Requirements for minors vary
          by jurisdiction and are part of the pending legal review.
        </p>
      </section>
    </LegalPage>
  );
}
