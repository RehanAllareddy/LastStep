export type ActionResult<T = undefined> =
  { ok: true; data: T } | { ok: false; error: string; code?: string; fieldErrors?: Record<string, string> };

export function fail(error: string, code?: string, fieldErrors?: Record<string, string>): ActionResult<never> {
  return { ok: false, error, code, fieldErrors };
}

export function fieldErrorsFrom(issues: { path: PropertyKey[]; message: string }[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const key = i.path.map(String).join(".");
    if (key && !out[key]) out[key] = i.message;
  }
  return out;
}

export const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
export const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
