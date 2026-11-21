import { useState } from 'react'
import { useAuthProfileReady, useQuery, useMutations, usePresenceRoom } from 'deepspace'

type Session = {
  title: string
  joinCode: string
  status: string
  endsAt: string
  taId: string
}

type Ticket = {
  sessionId: string
  studentId?: string  // userBound — set by server on create
  question: string
  status?: string     // default: 'waiting' — set by server on create
  groupId?: string
}

function generateJoinCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase()
}

export default function HomePage() {
  const { isLoaded, isSignedIn, user, userLoading, userId } = useAuthProfileReady({
    requireUser: true,
  })

  if (!isLoaded || (isSignedIn && userLoading)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    )
  }

  if (!isSignedIn || !user || !userId) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Sign in to use Office Hours.
      </div>
    )
  }

  if (user.role === 'admin') return <TADashboard userId={userId} />
  return <StudentView userId={userId} />
}

// ── TA Dashboard ──────────────────────────────────────────────────────────────

function TADashboard({ userId }: { userId: string }) {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  if (selectedId) {
    return <QueueView sessionId={selectedId} onBack={() => setSelectedId(null)} />
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8">
      <h1 className="text-xl font-semibold">TA Dashboard</h1>
      <CreateSessionForm userId={userId} />
      <MySessions userId={userId} onSelect={setSelectedId} />
    </div>
  )
}

function CreateSessionForm({ userId }: { userId: string }) {
  const [title, setTitle] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const { ready, create } = useMutations<Session>('sessions')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !endsAt || !ready) return
    create({
      title: title.trim(),
      joinCode: generateJoinCode(),
      status: 'open',
      endsAt,
      taId: userId, // userBound — SDK overwrites with caller's id; we pass it to satisfy the type
    })
    setTitle('')
    setEndsAt('')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border p-4">
      <h2 className="text-sm font-medium">New session</h2>
      <input
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        placeholder="Session title"
        value={title}
        onChange={e => setTitle(e.target.value)}
      />
      <input
        type="datetime-local"
        className="w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm"
        value={endsAt}
        onChange={e => setEndsAt(e.target.value)}
      />
      <button
        type="submit"
        disabled={!ready || !title.trim() || !endsAt}
        className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        Create session
      </button>
    </form>
  )
}

function MySessions({ userId, onSelect }: { userId: string; onSelect: (id: string) => void }) {
  const { records, status } = useQuery<Session>('sessions', {
    orderBy: 'createdAt',
    orderDir: 'desc',
  })

  if (status === 'loading') {
    return <p className="text-sm text-muted-foreground">Loading sessions…</p>
  }

  const mine = records.filter(r => r.data.taId === userId)

  if (!mine.length) {
    return <p className="text-sm text-muted-foreground">No sessions yet. Create one above.</p>
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium">My sessions</h2>
      {mine.map(r => (
        <button
          key={r.recordId}
          onClick={() => onSelect(r.recordId)}
          className="w-full rounded-lg border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-card/80"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{r.data.title}</span>
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                r.data.status === 'open'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {r.data.status}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Code: <span className="font-mono font-semibold">{r.data.joinCode}</span>
            {r.data.endsAt && (
              <span className="ml-3">Ends {new Date(r.data.endsAt).toLocaleString()}</span>
            )}
          </p>
        </button>
      ))}
    </div>
  )
}

function QueueView({ sessionId, onBack }: { sessionId: string; onBack: () => void }) {
  const { records: sessions } = useQuery<Session>('sessions')
  const session = sessions.find(r => r.recordId === sessionId)

  const { records: tickets } = useQuery<Ticket>('tickets', {
    where: { sessionId },
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const { ready: ticketReady, put } = useMutations<Ticket>('tickets')
  const { ready: sessionReady, put: putSession } = useMutations<Session>('sessions')

  const { peers } = usePresenceRoom(`session:${sessionId}`)

  const active = tickets.filter(r => r.data.status !== 'done')
  const done = tickets.filter(r => r.data.status === 'done')

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground">
          ← Back
        </button>
        <h1 className="text-xl font-semibold">{session?.data.title ?? 'Queue'}</h1>
        {session && (
          <span className="rounded bg-muted px-2 py-0.5 font-mono text-sm">
            {session.data.joinCode}
          </span>
        )}
        {session?.data.status === 'open' && (
          <button
            disabled={!sessionReady}
            onClick={() => putSession(sessionId, { status: 'closed' })}
            className="ml-auto text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Close session
          </button>
        )}
        {session?.data.status === 'closed' && (
          <span className="ml-auto text-xs text-muted-foreground">Session closed</span>
        )}
      </div>

      {/* Online students */}
      {peers.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Online now:</span>
          {peers.map(peer => (
            <span
              key={peer.userId}
              className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
              {peer.userName || 'Student'}
            </span>
          ))}
        </div>
      )}
      {peers.length === 0 && (
        <p className="text-xs text-muted-foreground">No students online yet.</p>
      )}

      {active.length === 0 ? (
        <p className="text-sm text-muted-foreground">Queue is empty.</p>
      ) : (
        <div className="space-y-2">
          {active.map(ticket => (
            <div
              key={ticket.recordId}
              className="flex items-start justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm">{ticket.data.question}</p>
                <span
                  className={`mt-1 inline-block rounded-full px-1.5 py-0.5 text-xs ${
                    ticket.data.status === 'helping'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-yellow-100 text-yellow-700'
                  }`}
                >
                  {ticket.data.status}
                </span>
              </div>
              <div className="flex shrink-0 gap-2">
                {ticket.data.status === 'waiting' && (
                  <button
                    disabled={!ticketReady}
                    onClick={() => put(ticket.recordId, { status: 'helping' })}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    Help
                  </button>
                )}
                {ticket.data.status === 'helping' && (
                  <button
                    disabled={!ticketReady}
                    onClick={() => put(ticket.recordId, { status: 'done' })}
                    className="rounded-md bg-primary px-3 py-1 text-xs font-medium text-primary-foreground disabled:opacity-50"
                  >
                    Done
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {done.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Done ({done.length})
          </summary>
          <div className="mt-2 space-y-1">
            {done.map(ticket => (
              <div
                key={ticket.recordId}
                className="rounded bg-muted/50 px-3 py-2 text-sm text-muted-foreground line-through"
              >
                {ticket.data.question}
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}

// ── Student View ──────────────────────────────────────────────────────────────

function StudentView({ userId }: { userId: string }) {
  const [joinedSessionId, setJoinedSessionId] = useState<string | null>(null)
  const [codeInput, setCodeInput] = useState('')
  const [joinError, setJoinError] = useState('')

  const { records: sessions } = useQuery<Session>('sessions')

  function handleJoin(e: React.FormEvent) {
    e.preventDefault()
    const match = sessions.find(
      r =>
        r.data.joinCode.toUpperCase() === codeInput.trim().toUpperCase() &&
        r.data.status === 'open',
    )
    if (!match) {
      setJoinError('No open session with that code.')
      return
    }
    setJoinedSessionId(match.recordId)
    setJoinError('')
  }

  if (!joinedSessionId) {
    return (
      <div className="flex h-full items-center justify-center">
        <form
          onSubmit={handleJoin}
          className="w-full max-w-sm space-y-3 rounded-lg border border-border p-6"
        >
          <h1 className="text-lg font-semibold">Join Office Hours</h1>
          <input
            className="w-full rounded-md border border-input bg-background px-3 py-1.5 font-mono text-sm uppercase tracking-widest"
            placeholder="Enter join code"
            value={codeInput}
            onChange={e => setCodeInput(e.target.value.toUpperCase())}
            maxLength={6}
            autoCapitalize="characters"
          />
          {joinError && <p className="text-xs text-red-500">{joinError}</p>}
          <button
            type="submit"
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
          >
            Join
          </button>
        </form>
      </div>
    )
  }

  return (
    <TicketView sessionId={joinedSessionId} userId={userId} onLeave={() => setJoinedSessionId(null)} />
  )
}

function TicketView({
  sessionId,
  userId,
  onLeave,
}: {
  sessionId: string
  userId: string
  onLeave: () => void
}) {
  const [question, setQuestion] = useState('')

  const { records: sessions } = useQuery<Session>('sessions')
  const session = sessions.find(r => r.recordId === sessionId)

  const { records: tickets } = useQuery<Ticket>('tickets', {
    where: { sessionId },
    orderBy: 'createdAt',
    orderDir: 'asc',
  })
  const { ready, create, remove } = useMutations<Ticket>('tickets')
  const { peers: sessionPeers } = usePresenceRoom(`session:${sessionId}`)
  const taIsOnline = session ? sessionPeers.some(p => p.userId === session.data.taId) : false

  // studentId is userBound — the server sets it to the caller's userId on create
  const myTicket = tickets.find(r => r.data.studentId === userId)
  const waitingTickets = tickets.filter(r => r.data.status === 'waiting')
  const myPosition =
    myTicket?.data.status === 'waiting'
      ? waitingTickets.findIndex(r => r.recordId === myTicket.recordId) + 1
      : null

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!question.trim() || !ready) return
    create({ sessionId, question: question.trim() })
    setQuestion('')
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">{session?.data.title ?? 'Office Hours'}</h1>
          <p className="text-xs text-muted-foreground">
            Code: <span className="font-mono">{session?.data.joinCode}</span>
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <button onClick={onLeave} className="text-xs text-muted-foreground hover:text-foreground">
            Leave
          </button>
          <span
            className={`flex items-center gap-1 text-xs ${taIsOnline ? 'text-green-600' : 'text-muted-foreground'}`}
          >
            <span
              className={`h-1.5 w-1.5 rounded-full ${taIsOnline ? 'bg-green-500' : 'bg-muted-foreground'}`}
            />
            {taIsOnline ? 'TA is online' : 'TA is offline'}
          </span>
        </div>
      </div>

      {!myTicket ? (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-border p-4">
          <h2 className="text-sm font-medium">Ask a question</h2>
          <textarea
            className="w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm"
            rows={3}
            placeholder="What's your question?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
          />
          <button
            type="submit"
            disabled={!ready || !question.trim()}
            className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            Join queue
          </button>
        </form>
      ) : (
        <div className="space-y-3 rounded-lg border border-border bg-card p-4">
          {myTicket.data.status === 'waiting' && myPosition !== null && (
            <p className="text-2xl font-semibold">You are #{myPosition} in line</p>
          )}
          {myTicket.data.status === 'helping' && (
            <p className="text-lg font-semibold text-blue-600">The TA is helping you now!</p>
          )}
          {myTicket.data.status === 'done' && (
            <p className="text-lg font-semibold text-green-600">Done! Your question was answered.</p>
          )}
          <p className="text-sm text-muted-foreground">
            Your question: {myTicket.data.question}
          </p>
          {myTicket.data.status === 'waiting' && (
            <button
              disabled={!ready}
              onClick={() => remove(myTicket.recordId)}
              className="text-xs text-muted-foreground hover:text-red-500 disabled:opacity-50"
            >
              Withdraw from queue
            </button>
          )}
        </div>
      )}

      <div>
        <h2 className="mb-2 text-sm font-medium">Queue ({waitingTickets.length} waiting)</h2>
        {tickets.filter(r => r.data.status !== 'done').length === 0 ? (
          <p className="text-xs text-muted-foreground">Queue is empty.</p>
        ) : (
          <div className="space-y-1">
            {tickets
              .filter(r => r.data.status !== 'done')
              .map(ticket => (
                <div
                  key={ticket.recordId}
                  className={`flex items-center gap-2 rounded px-3 py-2 text-sm ${
                    ticket.recordId === myTicket?.recordId
                      ? 'border border-primary/20 bg-primary/10'
                      : 'bg-muted/40'
                  }`}
                >
                  <span className="w-6 text-xs text-muted-foreground">
                    {ticket.data.status === 'waiting'
                      ? `#${waitingTickets.indexOf(ticket) + 1}`
                      : '→'}
                  </span>
                  <span className="flex-1 text-xs text-muted-foreground">
                    {ticket.recordId === myTicket?.recordId ? 'You' : '•'}
                  </span>
                  <span
                    className={`text-xs ${
                      ticket.data.status === 'helping' ? 'text-blue-600' : 'text-muted-foreground'
                    }`}
                  >
                    {ticket.data.status === 'helping' ? 'being helped' : 'waiting'}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  )
}
