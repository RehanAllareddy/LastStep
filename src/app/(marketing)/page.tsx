import Link from "next/link";
import {
  ArrowRight,
  BarChart3,
  BellRing,
  CalendarCheck2,
  CheckCircle2,
  Clock3,
  Image as ImageIcon,
  LayoutDashboard,
  MessageSquareText,
  MoonStar,
  PhoneCall,
  ShieldCheck,
  Target,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { AssignmentCard } from "@/components/assignments/assignment-card";

export const dynamic = "force-dynamic";

const STEPS = [
  {
    icon: Target,
    title: "Commit",
    body: "Define the assignment and its deadline. Add a personal commitment if it helps.",
  },
  { icon: BellRing, title: "Focus", body: "Get reminders on the schedule you chose — never during your quiet hours." },
  {
    icon: CheckCircle2,
    title: "Finish",
    body: "Upload a screenshot of your finished work. Reminders stop automatically.",
  },
];

const FEATURES = [
  {
    icon: CalendarCheck2,
    title: "Deadline-based accountability",
    body: "Every assignment has a real deadline in your time zone and a clear status — active, overdue, submitted, or done.",
  },
  {
    icon: MessageSquareText,
    title: "Personalized SMS reminders",
    body: "Gentle, standard, or intensive schedules. Short, supportive messages — no guilt trips, no fake urgency.",
  },
  {
    icon: PhoneCall,
    title: "Optional phone-call reminders",
    body: "Off by default. Calls need their own separate consent, are strictly limited, and depend on provider availability.",
  },
  {
    icon: ImageIcon,
    title: "Screenshot submissions",
    body: "Close the loop by uploading proof. Images are stored privately and stripped of location and device metadata.",
  },
  {
    icon: Clock3,
    title: "Automatic reminder cancellation",
    body: "The moment your submission is accepted, every pending reminder for that assignment is canceled.",
  },
  {
    icon: BarChart3,
    title: "Assignment progress tracking",
    body: "See what you finished this week and your on-time rate — calculated transparently from your own data.",
  },
  {
    icon: LayoutDashboard,
    title: "Daily focus dashboard",
    body: "Today's commitments, upcoming deadlines, and your next reminder in one calm view.",
  },
  {
    icon: MoonStar,
    title: "Notification controls and quiet hours",
    body: "Set quiet hours, a daily maximum, and intervals. Pause a channel or revoke consent any time.",
  },
];

const FAQ = [
  {
    q: "How do reminders work?",
    a: "When you create an assignment, LastStep builds a reminder plan from your chosen intensity: for example a reminder 24 hours before, one at the deadline, and a follow-up if it becomes overdue. Reminders are sent by our servers, so they arrive even when the app is closed — but only on channels you've explicitly consented to.",
  },
  {
    q: "When do reminders stop?",
    a: "As soon as you submit your work (or the moment it's accepted, if review is required), when you pause or cancel the assignment, when you turn a channel off, revoke consent, or reply STOP. Reminders also never exceed your daily maximum and are never sent during quiet hours.",
  },
  {
    q: "Why do you ask for a screenshot?",
    a: "Uploading proof is the moment you close the loop — it's a small, concrete action that marks the work as done. LastStep doesn't claim a screenshot proves academic completion, and it never accesses your school accounts or device activity.",
  },
  {
    q: "How does phone verification work?",
    a: "Enter your mobile number and we text a one-time code. Codes expire after 10 minutes and attempts are limited. We only send reminders to numbers you've verified, and you can use LastStep without a phone number at all.",
  },
  {
    q: "How do I change how often I'm reminded?",
    a: "Pick an intensity per assignment, and adjust your defaults, intervals, quiet hours, and daily maximum in Notification Settings. Changes apply to future reminders right away.",
  },
  {
    q: "How do I opt out of texts or calls?",
    a: "Reply STOP to any text to stop SMS (and voice) reminders immediately. You can also switch channels off or revoke consent in Notification Settings. Voice calls can be turned off independently of texts.",
  },
  {
    q: "How do I delete my account and data?",
    a: "Go to Account Settings → Delete account. We stop all notifications first, then delete your screenshots and account data. You can also export a copy of your data before deleting.",
  },
  {
    q: "Does LastStep guarantee academic success?",
    a: "No. LastStep is a tool to help you follow through on your own commitments. It can't guarantee grades, results, or that any reminder will be delivered — carriers and providers can delay or drop messages.",
  },
];

function HeroPreview() {
  const now = new Date();
  const serverNow = now.toISOString();
  const inHours = (h: number) => new Date(now.getTime() + h * 3600_000).toISOString();
  const tz = "America/New_York";
  return (
    <div className="relative">
      <div
        aria-hidden
        className="from-accent-soft/80 absolute -inset-6 -z-10 rounded-[28px] bg-gradient-to-b to-transparent"
      />
      <Card className="space-y-3 p-4 shadow-[var(--shadow-raised)] sm:p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold">Today&apos;s commitments</p>
          <span className="bg-surface-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
            Example data
          </span>
        </div>
        <AssignmentCard
          assignment={{
            id: "ex1",
            title: "Lab report: enzyme kinetics",
            subject: "Biology",
            due_at: inHours(5.5),
            time_zone: tz,
            priority: "high",
            status: "active",
            estimated_minutes: 90,
          }}
          nextReminder={{ scheduled_at: inHours(2.5), channel: "sms" }}
          serverNow={serverNow}
          viewerTimeZone={tz}
        />
        <AssignmentCard
          assignment={{
            id: "ex2",
            title: "Essay outline — The Great Gatsby",
            subject: "English",
            due_at: inHours(-3),
            time_zone: tz,
            priority: "normal",
            status: "completed",
            estimated_minutes: null,
          }}
          serverNow={serverNow}
          viewerTimeZone={tz}
        />
        <div className="border-border bg-surface-muted/60 flex items-start gap-3 rounded-[12px] border p-3.5 text-[13px]">
          <MessageSquareText className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-muted-foreground">
            <span className="text-foreground font-medium">LastStep:</span> Your assignment &apos;Lab report: enzyme
            kinetics&apos; is due at 5:30 PM. Take the next step and make some progress. Reply STOP to stop SMS
            reminders.
          </p>
        </div>
      </Card>
    </div>
  );
}

export default async function LandingPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  return (
    <>
      {params.account === "deleted" && (
        <div className="mx-auto max-w-6xl px-4 pt-6 sm:px-6">
          <Alert tone="success" title="Your account has been deleted.">
            Notifications were stopped and your data was removed. Thanks for using LastStep.
          </Alert>
        </div>
      )}

      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-20 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-16">
        <div className="animate-fade-in space-y-7">
          <p className="border-border bg-surface text-muted-foreground inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium">
            <span className="bg-accent size-1.5 rounded-full" aria-hidden />
            Accountability for students
          </p>
          <h1 className="text-4xl font-semibold tracking-[-0.035em] text-balance sm:text-5xl lg:text-[3.5rem] lg:leading-[1.05]">
            Stop scrolling.
            <br />
            <span className="text-accent">Start finishing.</span>
          </h1>
          <p className="text-muted-foreground max-w-xl text-lg leading-relaxed text-pretty">
            Turn your deadlines into commitments. LastStep keeps you accountable with personalized reminders until you
            submit proof that your work is done.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/sign-up">
                Start Your First Commitment <ArrowRight />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="#how-it-works">See How It Works</Link>
            </Button>
          </div>
          <p className="text-subtle-foreground text-sm">
            Free while in early access. Texts and calls only with your explicit consent.
          </p>
        </div>
        <HeroPreview />
      </section>

      <section id="how-it-works" className="border-border bg-surface scroll-mt-20 border-y py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-[-0.025em]">How it works</h2>
            <p className="text-muted-foreground mt-3">Three steps. One loop you actually close.</p>
          </div>
          <ol className="mt-12 grid gap-6 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="border-border bg-background relative rounded-[var(--radius)] border p-6">
                <div className="flex items-center gap-3">
                  <span className="bg-accent-soft text-accent-soft-foreground flex size-9 items-center justify-center rounded-[10px]">
                    <s.icon className="size-4" aria-hidden />
                  </span>
                  <span className="text-subtle-foreground text-xs font-semibold tabular-nums">0{i + 1}</span>
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight">{s.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="features" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="max-w-2xl">
            <h2 className="text-3xl font-semibold tracking-[-0.025em]">Built to help you follow through</h2>
            <p className="text-muted-foreground mt-3">Serious about deadlines. Respectful of your attention.</p>
          </div>
          <div className="border-border bg-border mt-12 grid gap-px overflow-hidden rounded-[var(--radius)] border sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((f) => (
              <div key={f.title} className="bg-surface p-6">
                <f.icon className="text-accent size-5" aria-hidden />
                <h3 className="mt-4 font-semibold tracking-tight">{f.title}</h3>
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">{f.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="trust" className="border-border bg-surface border-y py-20">
        <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <ShieldCheck className="text-accent size-6" aria-hidden />
            <h2 className="mt-4 text-3xl font-semibold tracking-[-0.025em]">Your data, handled with care</h2>
            <p className="text-muted-foreground mt-3">
              We collect only what LastStep needs to work. Read the full{" "}
              <Link href="/privacy" className="text-accent underline-offset-4 hover:underline">
                Privacy Policy
              </Link>
              .
            </p>
          </div>
          <dl className="grid gap-6 sm:grid-cols-2">
            {[
              {
                t: "Phone numbers",
                d: "Used only to send reminders you consented to. Never shown to other users, never sold, and never used for marketing.",
              },
              {
                t: "Uploaded work",
                d: "Stored in private storage, re-encoded to remove metadata, and viewable only through short-lived links. Never public, never used for ads or AI training.",
              },
              {
                t: "Notification preferences",
                d: "Consent for texts and calls is recorded separately, with the date and agreement version, and you can revoke it any time.",
              },
              {
                t: "Deletion requests",
                d: "Deleting your account stops all notifications immediately, then removes your screenshots and account records.",
              },
            ].map((x) => (
              <div key={x.t}>
                <dt className="font-semibold">{x.t}</dt>
                <dd className="text-muted-foreground mt-1.5 text-sm leading-relaxed">{x.d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section id="faq" className="scroll-mt-20 py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="text-3xl font-semibold tracking-[-0.025em]">Frequently asked questions</h2>
          <div className="divide-border border-border bg-surface mt-10 divide-y rounded-[var(--radius)] border">
            {FAQ.map((f) => (
              <details key={f.q} className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-medium">
                  {f.q}
                  <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-45">
                    +
                  </span>
                </summary>
                <p className="text-muted-foreground mt-3 text-sm leading-relaxed">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 pb-24 sm:px-6">
        <div className="bg-foreground text-background mx-auto flex max-w-6xl flex-col items-start gap-6 rounded-[20px] px-8 py-12 sm:px-12 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-3xl">
              Your goals deserve more than another tomorrow.
            </h2>
            <p className="text-background/70 mt-2">Set your first commitment in under two minutes.</p>
          </div>
          <Button asChild size="lg" className="bg-background text-foreground hover:bg-background/90">
            <Link href="/sign-up">
              Get Started <ArrowRight />
            </Link>
          </Button>
        </div>
        <p className="text-subtle-foreground mx-auto mt-6 flex max-w-6xl items-center gap-2 text-xs">
          <Trash2 className="size-3.5" aria-hidden /> Delete your account and data any time from Account Settings.
        </p>
      </section>
    </>
  );
}
