/**
 * Carrier-standard opt-out / opt-in keywords. Twilio Messaging Services with
 * Advanced Opt-Out also send an OptOutType parameter, which takes precedence.
 */
export type KeywordAction = "stop" | "start" | "help" | null;

const STOP = new Set(["STOP", "STOPALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT", "REVOKE", "OPTOUT", "OPT-OUT"]);
const START = new Set(["START", "UNSTOP", "YES", "SUBSCRIBE"]);
const HELP = new Set(["HELP", "INFO"]);

export function parseKeyword(body: string | null | undefined, optOutType?: string | null): KeywordAction {
  const type = optOutType?.trim().toUpperCase();
  if (type === "STOP") return "stop";
  if (type === "START") return "start";
  if (type === "HELP") return "help";
  const word = (body ?? "")
    .trim()
    .toUpperCase()
    .replace(/[.!]+$/, "");
  if (STOP.has(word)) return "stop";
  if (START.has(word)) return "start";
  if (HELP.has(word)) return "help";
  return null;
}
