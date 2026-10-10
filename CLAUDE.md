@AGENTS.md

# LastStep — working notes

- Node lives at /opt/homebrew/opt/node@22/bin on this machine (Homebrew `node@22`, not on PATH by default).
- Local backend: `supabase start` (Docker via Colima: `colima start`). After changing SQL, run `npm run db:reset && npm run db:types`.
- All privileged writes are Postgres functions executable only by service_role (supabase/migrations/*_functions.sql). Server code authenticates, then calls them with the admin client. Keep RLS reads on the user-scoped client.
- The assignment state machine exists twice: `assignment_transitions` (SQL) and `src/lib/assignments/state-machine.ts`. A unit test enforces parity.
- Never send a notification without `confirm_job_sendable`. Consent rows are authoritative; preference flags are not.
- Verify before declaring done: `npm run typecheck && npm run lint && npm test && npm run test:integration && npm run test:e2e`.
