/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO itself records executions, tracks history, and
 * pushes status to admin clients via the `/ws/cron/:roomId` WebSocket.
 *
 * Each task declares EITHER `intervalMinutes` (run every N minutes) OR
 * `schedule` + `timezone` (5-field cron expression). CronRoom validates
 * the config at construction time and throws on ambiguous declarations.
 *
 * Example:
 *
 *   import type { CronTask } from 'deepspace/worker'
 *   import { buildCronContext } from 'deepspace/worker'
 *
 *   export const tasks: CronTask[] = [
 *     { name: 'heartbeat', intervalMinutes: 1 },
 *     { name: 'daily-report', schedule: '0 9 * * *', timezone: 'America/New_York' },
 *   ]
 *
 *   export async function runTask(name: string, env: Env): Promise<void> {
 *     const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
 *     if (name === 'heartbeat') {
 *       // …
 *     }
 *   }
 */

import type { CronTask } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import type { Env } from '../worker'

export const tasks: CronTask[] = [
  { name: 'close-expired-sessions', intervalMinutes: 1 },
]

export async function runTask(name: string, env: Env): Promise<void> {
  if (name === 'close-expired-sessions') {
    const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)

    // Query all open sessions; cron context bypasses RBAC and runs as the app owner
    const sessions = await ctx.records.query('sessions', { where: { status: 'open' }, limit: 200 }) as Array<{
      recordId: string
      data: { endsAt?: string }
    }>

    const now = new Date().toISOString()
    for (const session of sessions) {
      if (session.data.endsAt && session.data.endsAt <= now) {
        await ctx.records.update('sessions', session.recordId, { status: 'closed' })
      }
    }
  }
}
