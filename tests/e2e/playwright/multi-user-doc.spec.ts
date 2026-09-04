/**
 * Multi-user document collaboration, end to end, in two real browsers.
 *
 * This is the only test in the repo that exercises the actual stack a user
 * touches: Next.js, Tiptap, the y-websocket provider, ws-gateway, Redis. The
 * integration tests below it use headless Y.Doc clients, which prove the CRDT
 * and the wire protocol but say nothing about whether the editor is wired up
 * correctly. This one catches "the CRDT is fine but the provider was never
 * attached", which is a real and easy mistake.
 *
 * Prerequisites: a running stack. See tests/e2e/playwright/README.md.
 *
 * Run: npm run test:e2e
 */

import { test, expect, type Page, type BrowserContext, type Browser } from '@playwright/test';
import { createHmac } from 'node:crypto';

// -- Test users --------------------------------------------------------------

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-in-production';

const USERS = [
  { id: 'e2e-user-alice', name: 'Alice Example', email: 'alice@collabspace.test' },
  { id: 'e2e-user-bob', name: 'Bob Example', email: 'bob@collabspace.test' },
] as const;

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signToken(userId: string, email: string): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64url(
    JSON.stringify({ sub: userId, email, role: 'member', iat: now, exp: now + 3600 }),
  );
  const sig = b64url(createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest());
  return `${header}.${payload}.${sig}`;
}

/**
 * Seeds the zustand auth store directly in localStorage.
 *
 * Deliberately not going through the login form. A collaboration test should
 * fail when collaboration breaks, not when the login page changes or the demo
 * user is missing from the database. The shape matches the `persist` config in
 * apps/web/src/stores/auth-store.ts (`name: 'collabspace-auth'`) — if that
 * store's partialize changes, this needs to change with it, and the test will
 * fail obviously (redirected to /login) rather than subtly.
 */
async function authenticateAs(
  context: BrowserContext,
  user: (typeof USERS)[number],
  baseURL: string,
): Promise<void> {
  const token = signToken(user.id, user.email);

  await context.addInitScript(
    ([storageKey, authState]) => {
      window.localStorage.setItem(storageKey as string, authState as string);
    },
    [
      'collabspace-auth',
      JSON.stringify({
        state: {
          token,
          refreshToken: token,
          user: { id: user.id, name: user.name, email: user.email, avatar: null },
          isAuthenticated: true,
        },
        version: 0,
      }),
    ],
  );

  // addInitScript only applies to pages created afterwards, so nothing to load
  // here. baseURL is taken as a parameter to keep the signature honest about
  // needing it if this ever does a real navigation.
  void baseURL;
}

/** The Tiptap editable surface. */
function editor(page: Page) {
  return page.locator('.ProseMirror').first();
}

/**
 * Remote collaborator carets rendered by @tiptap/extension-collaboration-cursor.
 * The class name comes from the extension's own CSS, which the document page
 * styles at apps/web/src/components/documents/editor.tsx.
 *
 * This selector is the most brittle thing in the file: it is a third-party
 * implementation detail with no data-testid behind it. If the extension renames
 * its classes on upgrade, this test breaks without the product breaking.
 */
function remoteCarets(page: Page) {
  return page.locator('.collaboration-cursor__caret');
}

// -- Tests -------------------------------------------------------------------

test.describe('two users editing one document', () => {
  let aliceCtx: BrowserContext;
  let bobCtx: BrowserContext;
  let alice: Page;
  let bob: Page;
  let documentId: string;

  test.beforeAll(async ({ browser }: { browser: Browser }, testInfo) => {
    const baseURL = (testInfo.project.use.baseURL as string) ?? 'http://localhost:3000';

    // A fresh document id per run, so a rerun never inherits leftover text.
    documentId = `e2e-doc-${Date.now()}`;

    aliceCtx = await browser.newContext();
    bobCtx = await browser.newContext();

    await authenticateAs(aliceCtx, USERS[0], baseURL);
    await authenticateAs(bobCtx, USERS[1], baseURL);

    alice = await aliceCtx.newPage();
    bob = await bobCtx.newPage();
  });

  test.afterAll(async () => {
    await aliceCtx?.close();
    await bobCtx?.close();
  });

  test('both users see each other cursors and converge on the same text', async () => {
    // -- Open the same document in both browsers --------------------------

    await Promise.all([
      alice.goto(`/documents/${documentId}`),
      bob.goto(`/documents/${documentId}`),
    ]);

    await expect(editor(alice)).toBeVisible({ timeout: 30_000 });
    await expect(editor(bob)).toBeVisible({ timeout: 30_000 });

    // The provider connects asynchronously after mount. Give it a moment to
    // finish the initial sync before asserting anything about collaboration.
    await alice.waitForTimeout(2000);
    await bob.waitForTimeout(2000);

    // -- Alice types; Bob must see it -------------------------------------

    await editor(alice).click();
    await editor(alice).pressSequentially('Alice was here. ', { delay: 20 });

    await expect(editor(bob)).toContainText('Alice was here.', { timeout: 15_000 });

    // -- Bob types; Alice must see it -------------------------------------

    await editor(bob).click();
    await editor(bob).pressSequentially('Bob was here too. ', { delay: 20 });

    await expect(editor(alice)).toContainText('Bob was here too.', { timeout: 15_000 });

    // -- Cursor presence --------------------------------------------------

    // Each page should show exactly the *other* user's caret. The local user's
    // own cursor is not rendered as a collaboration caret.
    await expect(remoteCarets(alice).first()).toBeVisible({ timeout: 15_000 });
    await expect(remoteCarets(bob).first()).toBeVisible({ timeout: 15_000 });

    // The caret label carries the peer's name, which is what actually makes
    // presence useful — a caret with the wrong name is worse than no caret.
    await expect(alice.locator('.collaboration-cursor__label').first()).toContainText(
      USERS[1].name,
      { timeout: 15_000 },
    );
    await expect(bob.locator('.collaboration-cursor__label').first()).toContainText(
      USERS[0].name,
      { timeout: 15_000 },
    );

    // -- Simultaneous typing ----------------------------------------------

    await Promise.all([
      editor(alice).pressSequentially('AAAA', { delay: 30 }),
      editor(bob).pressSequentially('BBBB', { delay: 30 }),
    ]);

    // -- Final state matches on both --------------------------------------

    await expect
      .poll(
        async () => {
          const [a, b] = await Promise.all([
            editor(alice).innerText(),
            editor(bob).innerText(),
          ]);
          return a === b ? 'converged' : `diverged:\nALICE: ${a}\nBOB:   ${b}`;
        },
        {
          timeout: 30_000,
          message: 'documents never converged to identical text',
        },
      )
      .toBe('converged');

    const finalText = await editor(alice).innerText();
    expect(finalText).toContain('Alice was here.');
    expect(finalText).toContain('Bob was here too.');
    expect(finalText).toContain('AAAA');
    expect(finalText).toContain('BBBB');
  });

  test('cursor movement propagates to the peer', async () => {
    // Presence updates on selection change, not only on text entry. A common
    // regression is awareness being published on edit but not on cursor move,
    // which makes carets appear frozen.
    await editor(alice).click();
    await alice.keyboard.press('Home');

    const caretBox = async () => {
      const caret = remoteCarets(bob).first();
      await expect(caret).toBeVisible({ timeout: 15_000 });
      return caret.boundingBox();
    };

    const before = await caretBox();

    await alice.keyboard.press('End');
    // Awareness is throttled; allow for the debounce.
    await bob.waitForTimeout(1500);

    const after = await caretBox();

    expect(before, 'no caret bounding box before the move').not.toBeNull();
    expect(after, 'no caret bounding box after the move').not.toBeNull();
    expect(
      before!.x !== after!.x || before!.y !== after!.y,
      `peer caret did not move: before=${JSON.stringify(before)} after=${JSON.stringify(after)}`,
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Limitations of this file
// ---------------------------------------------------------------------------
//
// - **The "<100ms cursor latency" claim is not asserted here.** The task that
//   prompted this file asked for it, and I did not implement it, because
//   Playwright cannot measure it honestly: `expect().toBeVisible()` resolves on
//   a polling interval, and the poll granularity is larger than the quantity
//   being measured. Asserting "under 100ms" with a 100ms-resolution instrument
//   produces a number that looks like evidence and is not. Cursor/sync latency
//   is measured properly in benchmarks/crdt-sync-latency.ts, which times
//   convergence directly with performance.now(). If this assertion matters, the
//   honest implementation is an in-page performance.mark() on awareness
//   send/receive, read back via page.evaluate() — that is worth doing and is
//   not done yet.
// - Selectors depend on Tiptap's internal class names (`.ProseMirror`,
//   `.collaboration-cursor__caret`). There are no data-testid hooks in the
//   editor components. A Tiptap upgrade can break this test without breaking
//   the product.
// - Auth is seeded straight into localStorage, so the login flow is never
//   exercised. That is a deliberate trade for reliability, but it does mean a
//   broken login page passes this suite.
// - Two users only. Nothing here covers the room-capacity path, cross-shard
//   behaviour (both browsers hit the same gateway), or reconnect in the browser.
// - Chromium only. No Firefox or WebKit coverage, so browser-specific issues in
//   the editor or WebSocket handling are invisible here.
