# Office Hours Queue — project brief

Take-home for a DeepSpace internship. DEADLINE: tonight, Nov 21, 11:59 PM ET (8:59 PM PT).
A small, finished, working app beats a big unfinished one. Prefer simple, clear code I can explain in an interview.
Live URL: https://office-hours.app.space · Repo: github.com/aparajitasharma01/office-hours

## The product
TAs run office hours; students wait in a live queue.
1. A TA opens a session (title, end time). It gets a short join code.
2. A student enters the join code, types their question, and sees their position update live.
3. The TA sees the live queue and who is online, and marks tickets "helping" then "done". Everyone sees changes instantly.
4. "Group similar" (TA only): the server sends waiting questions to an AI model, which suggests groups of duplicate questions. The TA approves a group with one click, and those tickets share a groupId. The AI suggests; the TA decides.
5. A scheduled job closes sessions after their end time.

## Data model
- sessions: title, joinCode, status ('open'|'closed'), endsAt, taId
- tickets: sessionId, studentId, question, status ('waiting'|'helping'|'done'), groupId (optional)
- users: the scaffold's required schema. Extend it, never rename it.

## Roles (enforced by server-side RBAC in the schemas)
- member = student: read the queue, create a ticket, update/delete only their own
- admin = TA: everything
- Tradeoff: a TA is admin of the whole app, not of one session. Fine for one course's staff; per-session TAs would be future work.

## Deliberately NOT building
Payments, messaging channels, collaborative editing, file uploads. They don't serve the main flow.

## Build steps (do one step per request, then stop)
1. Schemas for sessions and tickets
2. Queue UI: TA view (create session, manage queue) and student view (join by code, add ticket, see position)
3. Presence: show who is online in a session
4. AI grouping via a server action (never call the AI from the browser)
5. Scheduled job to close expired sessions
6. Two-user test, design polish (own theme, not the scaffold placeholder), deploy

## Rules
- Use the deepspace skill and read docs.deep.space before building each area. Use SDK primitives instead of reimplementing them.
- Record fields live under record.data. Disable write buttons until useMutations().ready.
- Data and auth hooks only work in pages under src/pages/(app)/.
- Secrets go only in `npx deepspace secrets`, never in code or .dev.vars.
- A dev server is already running on port 5173. Don't start or kill one.
- Never run `deepspace push`. Don't run `deepspace deploy` unless I explicitly ask.
- Use fake demo data only, never real student information.
- After each step: run `npx deepspace test run`, list changed files, and explain the changes in plain, simple words (I'm learning DeepSpace). Then stop and wait for me.