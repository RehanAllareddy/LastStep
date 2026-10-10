import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  ASSIGNMENT_STATUSES,
  canTransition,
  isTerminal,
  remindersAllowed,
  TRANSITIONS,
} from "@/lib/assignments/state-machine";

/** Parse the transition rows inserted by the SQL migrations. */
function sqlTransitions(): Set<string> {
  const dir = path.resolve(__dirname, "../../supabase/migrations");
  const sql = ["20261009000001_core_schema.sql", "20261009000002_functions.sql"]
    .map((f) => readFileSync(path.join(dir, f), "utf8"))
    .join("\n");
  const out = new Set<string>();
  for (const block of sql.matchAll(
    /insert into public\.assignment_transitions \(from_status, to_status\) values([\s\S]*?);/g,
  )) {
    for (const m of block[1]!.matchAll(/\('(\w+)', '(\w+)'\)/g)) out.add(`${m[1]}->${m[2]}`);
  }
  return out;
}

describe("assignment state machine", () => {
  it("allows the documented transitions", () => {
    expect(canTransition("active", "submitted")).toBe(true);
    expect(canTransition("submitted", "completed")).toBe(true);
    expect(canTransition("submitted", "under_review")).toBe(true);
    expect(canTransition("active", "paused")).toBe(true);
    expect(canTransition("paused", "active")).toBe(true);
    expect(canTransition("active", "overdue")).toBe(true);
    expect(canTransition("active", "canceled")).toBe(true);
    expect(canTransition("overdue", "submitted")).toBe(true);
  });

  it("rejects invalid transitions", () => {
    expect(canTransition("completed", "active")).toBe(false);
    expect(canTransition("canceled", "active")).toBe(false);
    expect(canTransition("active", "completed")).toBe(false); // must go through submitted
    expect(canTransition("under_review", "paused")).toBe(false);
  });

  it("terminal states have no exits and block reminders", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("canceled")).toBe(true);
    for (const s of ASSIGNMENT_STATUSES) {
      expect(remindersAllowed(s)).toBe(s === "active" || s === "overdue");
    }
  });

  it("matches the database transition table exactly", () => {
    const ts = new Set(Object.entries(TRANSITIONS).flatMap(([from, tos]) => tos.map((to) => `${from}->${to}`)));
    expect([...ts].sort()).toEqual([...sqlTransitions()].sort());
  });
});
