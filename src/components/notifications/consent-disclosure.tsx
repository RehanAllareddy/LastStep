import { DEFAULT_LIMITS } from "@/lib/scheduler/policy";

/** The full notification agreement shown before any consent is given. */
export function ConsentDisclosure() {
  return (
    <div className="text-muted-foreground space-y-3 text-sm leading-relaxed">
      <ul className="[&>li]:before:bg-subtle-foreground space-y-2 [&>li]:flex [&>li]:gap-2 [&>li]:before:mt-2 [&>li]:before:size-1 [&>li]:before:shrink-0 [&>li]:before:rounded-full [&>li]:before:content-['']">
        <li>
          <span>
            <strong className="text-foreground">What you&apos;ll get:</strong> automated reminders about assignments you
            create — before a deadline, at the deadline, check-ins while work is unfinished, a follow-up if it&apos;s
            overdue, and optionally a note when your submission is accepted. Never marketing.
          </span>
        </li>
        <li>
          <span>
            <strong className="text-foreground">Why:</strong> to help you follow through on commitments you set.
            Reminders stop when you submit your work.
          </span>
        </li>
        <li>
          <span>
            <strong className="text-foreground">How often:</strong> depends on the intensity you choose (gentle,
            standard, intensive), capped by your daily maximum (default 4, up to 12) and at most{" "}
            {DEFAULT_LIMITS.maxRemindersPerAssignment} texts per assignment.
          </span>
        </li>
        <li>
          <span>
            <strong className="text-foreground">Calls:</strong> automated voice calls are off unless you separately
            agree below — at most one per assignment and one per day by default.
          </span>
        </li>
        <li>
          <span>
            <strong className="text-foreground">Quiet hours:</strong> nothing is sent during your quiet hours (default
            9:30 PM – 8:00 AM in your time zone).
          </span>
        </li>
        <li>
          <span>
            <strong className="text-foreground">Costs &amp; delivery:</strong> message and data rates may apply.
            Delivery depends on your carrier and our provider and isn&apos;t guaranteed.
          </span>
        </li>
        <li>
          <span>
            <strong className="text-foreground">Turning it off:</strong> reply{" "}
            <strong className="text-foreground">STOP</strong> to any text, or switch channels off or revoke consent in
            Notification Settings at any time. Once you opt out or revoke, every pending reminder on that channel is
            canceled immediately. Reply START to resubscribe.
          </span>
        </li>
        <li>
          <span>
            <strong className="text-foreground">Your data:</strong> we record when you agreed, the agreement version,
            and your IP and browser at that moment. We log when reminders are sent or fail, but not the message text.
            See the{" "}
            <a href="/sms-terms" target="_blank" className="text-accent underline-offset-2 hover:underline">
              SMS Terms
            </a>{" "}
            and{" "}
            <a href="/privacy" target="_blank" className="text-accent underline-offset-2 hover:underline">
              Privacy Policy
            </a>
            .
          </span>
        </li>
      </ul>
    </div>
  );
}
