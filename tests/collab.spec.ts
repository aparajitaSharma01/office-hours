/**
 * Multi-user collaboration spec — verifies two users sign in into
 * separate browser contexts and the app distinguishes them.
 *
 * `users(2)` takes any two accounts from your pool, so this spec passes on a
 * fresh app with no setup beyond having two test accounts:
 *   npx deepspace test accounts list
 *   npx deepspace test accounts create --email a@deepspace.test --name "A" --password-stdin
 *
 * Ask for accounts *by name* (`users(['Alice', 'Bob'])`) only when the
 * behaviour under test depends on which identity acts — otherwise naming them
 * couples the spec to one machine's pool.
 *
 * The `users` fixture handles sign-in caching (per-account storageState
 * persisted to `~/.deepspace/playwright-states/`), context creation, and
 * cleanup. No need to manage browser contexts manually.
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

// A machine that has never created test accounts is the normal state of a
// fresh checkout, and there `users()` throws — turning "you have no pool yet"
// into three red tests about the app, which it is not. Skip the file instead
// and say what creates the pool. The count is of accounts usable HERE: the
// pool is global per developer, but passwords live only on the machine that
// created the account.
const usableTestAccounts = loadAllTestAccounts().length
test.skip(
  usableTestAccounts < 2,
  `Needs 2 usable test accounts, found ${usableTestAccounts}. Create them with ` +
    '`npx deepspace test accounts create --email <name>@deepspace.test --name "<name>" ' +
    '--password-stdin`, or fetch existing pool accounts with `npx deepspace test accounts recover --all`.',
)

test('each browser renders its own signed-in account', async ({ users }) => {
  const [a, b] = await users(2)

  // /home is dynamic (under src/pages/(app)/), so it mounts the nav shell;
  // '/' is the static landing and has no navigation.
  await Promise.all([a.page.goto('/home'), b.page.goto('/home')])

  // Email, not name. The page renders the *session's* `name || email`, while
  // `user.name` here comes from the LOCAL account registry — and the two are
  // not the same fact: a display name is optional, and an account recovered on
  // another machine has none stored locally at all. The email is the credential
  // the context signed in with, so it is the one identity both sides agree on,
  // and asserting it proves the page is showing THIS browser's account.
  // The two accounts are distinct, so two exact matches is also the proof that
  // the contexts are not sharing one session.
  for (const user of [a, b]) {
    await expect(user.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

    // The identity chip shows `name || email`. Its text is not predictable, but
    // its presence is: something must be there once the profile has loaded.
    // (It is `hidden sm:inline` in some templates, so assert text, not
    // visibility.)
    await expect(user.page.getByTestId('nav-user-name')).toHaveText(/\S/, { timeout: 15_000 })

    await user.page.getByRole('button', { name: 'Account menu' }).click()
    await expect(user.page.getByTestId('nav-user-email')).toHaveText(user.email, {
      timeout: 15_000,
    })
  }
})

test('API status page renders loading success and error states', async ({ users }) => {
  const [user] = await users(1)
  let shouldFail = false
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    if (shouldFail) {
      await route.fulfill({
        status: 502,
        contentType: 'application/json',
        body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
      })
      return
    }

    await new Promise((resolve) => setTimeout(resolve, 100))
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { integrations: { openai: {}, wikipedia: {} } } }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()
  await expect(user.page.getByText('2 integrations available.')).toBeVisible()

  shouldFail = true
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect(user.page.getByText('Catalog unavailable')).toBeVisible()
  await expect(user.page.getByText('Showing the last loaded catalog')).toBeVisible()
  await expect(user.page.getByText('Integration catalog ready')).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await user.page.getByRole('button', { name: 'Refresh' }).click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})

test('admin creates session, member joins and sees live status updates', async ({ users }) => {
  // Uses named accounts so the roles are predictable. TA Alice must have
  // admin role set in the app (Settings → Users) before this test can run.
  const [ta, student] = await users(['TA Alice', 'Student Bob'])

  await Promise.all([ta.page.goto('/home'), student.page.goto('/home')])
  await Promise.all([
    expect(ta.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 }),
    expect(student.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 }),
  ])

  // Skip instead of fail when the TA account hasn't been promoted yet
  const taIsAdmin = await ta.page.getByRole('heading', { name: 'TA Dashboard' }).isVisible()
  test.skip(!taIsAdmin, 'TA Alice needs admin role — open Settings → Users in the app and set her role to admin, then rerun')

  // ── 1. TA creates a session ────────────────────────────────────────────────
  const sessionTitle = `E2E Session ${Date.now()}`
  await ta.page.getByPlaceholder('Session title').fill(sessionTitle)

  // End time one hour from now in the yyyy-MM-ddTHH:mm format datetime-local needs
  const endsAt = new Date(Date.now() + 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  const endTimeLocal = `${endsAt.getFullYear()}-${pad(endsAt.getMonth() + 1)}-${pad(endsAt.getDate())}T${pad(endsAt.getHours())}:${pad(endsAt.getMinutes())}`
  await ta.page.locator('input[type="datetime-local"]').fill(endTimeLocal)

  // Wait for mutations to be ready before clicking
  await expect(ta.page.getByRole('button', { name: 'Create session' })).toBeEnabled({ timeout: 10_000 })
  await ta.page.getByRole('button', { name: 'Create session' }).click()

  // ── 2. TA opens the new session ───────────────────────────────────────────
  await expect(ta.page.getByRole('button', { name: new RegExp(sessionTitle) })).toBeVisible({ timeout: 10_000 })
  await ta.page.getByRole('button', { name: new RegExp(sessionTitle) }).click()

  // Read the live join code shown in the queue header
  await expect(ta.page.getByTestId('join-code')).toBeVisible({ timeout: 10_000 })
  const joinCode = (await ta.page.getByTestId('join-code').textContent())?.trim() ?? ''
  expect(joinCode).toMatch(/^[A-Z0-9]{6}$/)

  // ── 3. Student joins with the code ───────────────────────────────────────
  await student.page.getByPlaceholder('Enter join code').fill(joinCode)
  await student.page.getByRole('button', { name: 'Join' }).click()

  // ── 4. Student submits a question ────────────────────────────────────────
  await expect(student.page.getByPlaceholder("What's your question?")).toBeVisible({ timeout: 10_000 })
  await student.page.getByPlaceholder("What's your question?").fill('How do I use async/await?')
  await expect(student.page.getByRole('button', { name: 'Join queue' })).toBeEnabled({ timeout: 10_000 })
  await student.page.getByRole('button', { name: 'Join queue' }).click()

  // Student sees their position in line
  await expect(student.page.getByText(/You are #1 in line/)).toBeVisible({ timeout: 10_000 })

  // ── 5. TA sees the ticket live ────────────────────────────────────────────
  await expect(ta.page.getByText('How do I use async/await?')).toBeVisible({ timeout: 10_000 })

  // ── 6. TA marks helping → student sees the update ────────────────────────
  await ta.page.getByRole('button', { name: 'Help' }).click()
  await expect(student.page.getByText('The TA is helping you now!')).toBeVisible({ timeout: 10_000 })

  // ── 7. TA marks done → student sees the update ───────────────────────────
  await ta.page.getByRole('button', { name: 'Done' }).click()
  await expect(student.page.getByText('Done! Your question was answered.')).toBeVisible({ timeout: 10_000 })
})

test('groupTickets action refuses non-admin callers', async ({ users }) => {
  const [member] = await users(1)
  await member.page.goto('/home')
  await expect(member.page.getByTestId('app-navigation')).toBeVisible({ timeout: 15_000 })

  // Run fetch from inside the browser context so the signed-in session and
  // auth cookies/token are available. The action requires a Bearer JWT; a
  // member caller (or unauthenticated request) must never get success: true.
  const result = await member.page.evaluate(async () => {
    const res = await fetch('/api/actions/groupTickets', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'test-session-id' }),
    })
    const body = await res.json().catch(() => ({}))
    return { status: res.status, body }
  })

  // A non-admin caller must not receive a success response — whether the
  // server returns 401 (no Bearer token) or 403 (member role check), the
  // outcome is the same: the action is guarded.
  expect(result.status).toBeGreaterThanOrEqual(400)
  expect((result.body as { success?: boolean }).success).not.toBe(true)
})

test('API status page shows local retry after first-load API failure', async ({ users }) => {
  const [user] = await users(1)
  let requestCount = 0

  await user.page.route('**/api/integrations', async (route) => {
    requestCount += 1
    await route.fulfill({
      status: 502,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: 'Catalog unavailable' }),
    })
  })

  await user.page.goto('/api-status')
  await expect(user.page.getByText('Loading integration catalog...')).toBeVisible()
  await expect(user.page.getByText('Could not load API data')).toBeVisible()
  await expect(user.page.getByText('Retried 1 time automatically.')).toBeVisible()

  const retryButton = user.page.getByRole('button', { name: 'Retry' })
  await expect(retryButton).toBeVisible()

  const urlAfterFailure = user.page.url()
  const requestsAfterFailure = requestCount
  await retryButton.click()
  await expect.poll(() => requestCount).toBeGreaterThan(requestsAfterFailure)
  expect(user.page.url()).toBe(urlAfterFailure)
})
