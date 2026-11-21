import type { ActionHandler } from 'deepspace/worker'
import type { Env } from '../../worker'

type AnthropicResponse = {
  content: Array<{ type: string; text: string }>
}

type SuggestionGroup = { label: string; ticketIds: string[]; groupId: string }

const groupTickets: ActionHandler<Env> = async ({ userId, params, tools }) => {
  // Server-side admin check — never trust the UI for this
  const userResult = await tools.get<{ role: string }>('users', userId)
  if (!userResult.success) return { success: false, error: 'User not found' }
  if (userResult.data.record.data.role !== 'admin') {
    return { success: false, error: 'Forbidden: admin only' }
  }

  const sessionId = params.sessionId as string
  if (!sessionId) return { success: false, error: 'sessionId required' }

  // Load all tickets for the session, then filter to waiting in memory
  const ticketResult = await tools.query<{ question: string; status: string; sessionId: string }>(
    'tickets',
    { where: { sessionId }, limit: 200 },
  )
  if (!ticketResult.success) return { success: false, error: 'Could not load tickets' }

  const waiting = ticketResult.data.records.filter(r => r.data.status === 'waiting')
  if (waiting.length < 2) return { success: true, data: { groups: [] as SuggestionGroup[] } }

  const questionsText = waiting
    .map(t => `id:${t.recordId} | "${t.data.question}"`)
    .join('\n')

  const aiResult = await tools.integration<AnthropicResponse>('anthropic/chat-completion', {
    model: 'claude-haiku-4-5',
    max_tokens: 1024,
    system: 'You group similar student questions. Respond only with valid JSON, no other text.',
    messages: [
      {
        role: 'user',
        content:
          `Group these student questions by shared topic. Only group questions that are genuinely about the same thing (at least 2 per group). Leave singles ungrouped.\n` +
          `Return JSON only: {"groups":[{"label":"short topic label","ticketIds":["id1","id2"]}]}. If nothing is similar enough, return {"groups":[]}.\n\n` +
          questionsText,
      },
    ],
  })

  if (!aiResult.success) return { success: false, error: 'AI unavailable — try again' }

  const text = aiResult.data.content?.[0]?.text ?? ''
  try {
    const match = text.match(/\{[\s\S]*\}/)
    const json = JSON.parse(match?.[0] ?? '{}')
    const validIds = new Set(waiting.map(r => r.recordId))
    const safeGroups: SuggestionGroup[] = (json.groups ?? [])
      .map((g: { label: string; ticketIds: string[] }) => ({
        label: g.label,
        groupId: `${g.label}:${Math.random().toString(36).slice(2, 7)}`,
        ticketIds: (g.ticketIds ?? []).filter((id: string) => validIds.has(id)),
      }))
      .filter((g: SuggestionGroup) => g.ticketIds.length >= 2)
    return { success: true, data: { groups: safeGroups } }
  } catch {
    return { success: false, error: 'AI returned an unexpected format — try again' }
  }
}

export const actions: Record<string, ActionHandler<Env>> = {
  groupTickets,
}
