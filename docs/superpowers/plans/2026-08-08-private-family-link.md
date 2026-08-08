# Private Family Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a revocable fragment-based family login link that creates a secure 30-day family session without exposing the shared password or link token.

**Architecture:** Keep token hashing, constant-time verification, signing-key derivation, and generation in one server security module. Extend authentication with a separately rate-limited exchange route and a second family-session codec whose key changes when the link hash rotates. Extract and erase the browser fragment before React or analytics start, then pass the one-use token into the existing family authentication flow.

**Tech Stack:** TypeScript, React 19, Fastify 5, Node crypto, Zod, Vitest, Testing Library, Docker/Dockge

---

## File Structure

- Create `src/server/security/family-link.ts`: canonical token rules, SHA-256 digest, timing-safe verification, derived session secret, and deterministic generation helper.
- Create `src/server/tools/create-family-link.ts`: compiled owner command that prints a new environment hash and private URL.
- Create `tests/unit/family-link.test.ts`: security primitive and generator tests.
- Modify `src/server/config.ts`, `.env.example`: optional canonical `FAMILY_LINK_TOKEN_HASH` configuration.
- Modify `src/server/routes/auth.ts`, `src/server/app.ts`: isolated exchange limiter, dual family-session verification, 30-day link sessions, and exchange route.
- Modify `tests/integration/auth.test.ts`: exchange, cookie, limiter isolation, log secrecy, compatibility, and revocation coverage.
- Create `src/client/family-link.ts`: strict fragment extraction and synchronous erasure.
- Modify `src/client/api.ts`, `src/client/App.tsx`, `src/client/main.tsx`: one-use exchange before the existing welcome flow.
- Create `tests/unit/client-family-link.test.ts` and modify `tests/unit/client-api.test.ts`, `tests/unit/app-family-flow.test.tsx`: browser and API regression coverage.
- Modify `docs/DOCKGE_SETUP.md`: generation, deployment, sharing, and revocation instructions.

### Task 1: Add canonical token security and optional configuration

**Files:**
- Create: `src/server/security/family-link.ts`
- Create: `src/server/tools/create-family-link.ts`
- Create: `tests/unit/family-link.test.ts`
- Modify: `src/server/config.ts`
- Modify: `tests/unit/config.test.ts`
- Modify: `.env.example`

- [ ] **Step 1: Write failing configuration and security tests**

Add config assertions proving empty/absent `FAMILY_LINK_TOKEN_HASH` becomes `undefined`, exactly 64 lowercase hexadecimal characters are accepted, and uppercase, short, long, whitespace-padded, or non-hex values are rejected.

Create `tests/unit/family-link.test.ts` with deterministic inputs:

```ts
import {createHash} from "node:crypto";
import {describe,expect,it} from "vitest";
import {createFamilyLink,deriveFamilyLinkSessionSecret,hashFamilyLinkToken,isFamilyLinkToken,verifyFamilyLinkToken} from "../../src/server/security/family-link.js";

const token="ab".repeat(32);
const hash=createHash("sha256").update(token,"utf8").digest("hex");

describe("private family links",()=>{
 it("accepts only canonical 32-byte lowercase hex tokens",()=>{
  expect(isFamilyLinkToken(token)).toBe(true);
  for(const value of ["",token.toUpperCase(),token.slice(1),`${token}0`,` ${token}`])expect(isFamilyLinkToken(value)).toBe(false);
 });
 it("hashes and verifies without accepting malformed tokens",()=>{
  expect(hashFamilyLinkToken(token)).toBe(hash);
  expect(verifyFamilyLinkToken(token,hash)).toBe(true);
  expect(verifyFamilyLinkToken("cd".repeat(32),hash)).toBe(false);
  expect(verifyFamilyLinkToken("invalid",hash)).toBe(false);
 });
 it("changes the link-session key when either secret or token hash rotates",()=>{
  expect(deriveFamilyLinkSessionSecret("s".repeat(32),hash)).toBe(deriveFamilyLinkSessionSecret("s".repeat(32),hash));
  expect(deriveFamilyLinkSessionSecret("s".repeat(32),hash)).not.toBe(deriveFamilyLinkSessionSecret("t".repeat(32),hash));
  expect(deriveFamilyLinkSessionSecret("s".repeat(32),hash)).not.toBe(deriveFamilyLinkSessionSecret("s".repeat(32),"0".repeat(64)));
 });
 it("generates the configuration hash and fragment URL from injected randomness",()=>{
  expect(createFamilyLink("https://baby.example.com",()=>Buffer.alloc(32,0xab))).toEqual({token,tokenHash:hash,url:`https://baby.example.com/#family=${token}`});
 });
});
```

- [ ] **Step 2: Run tests to verify RED**

Run: `npm test -- tests/unit/family-link.test.ts tests/unit/config.test.ts`

Expected: FAIL because the family-link module and config field do not exist.

- [ ] **Step 3: Implement the security module**

Create `src/server/security/family-link.ts` using:

```ts
import {createHash,createHmac,randomBytes,timingSafeEqual} from "node:crypto";

const TOKEN_PATTERN=/^[a-f0-9]{64}$/;
const HASH_PATTERN=/^[a-f0-9]{64}$/;
const SESSION_KEY_DOMAIN="immich-baby-slideshow/family-link-session/v1";

export const isFamilyLinkToken=(value:string)=>TOKEN_PATTERN.test(value);
export const isFamilyLinkTokenHash=(value:string)=>HASH_PATTERN.test(value);
export function hashFamilyLinkToken(token:string){return createHash("sha256").update(token,"utf8").digest("hex")}
export function verifyFamilyLinkToken(token:string,storedHash:string){
 if(!isFamilyLinkToken(token)||!isFamilyLinkTokenHash(storedHash))return false;
 return timingSafeEqual(Buffer.from(hashFamilyLinkToken(token),"hex"),Buffer.from(storedHash,"hex"));
}
export function deriveFamilyLinkSessionSecret(sessionSecret:string,tokenHash:string){
 return createHmac("sha256",sessionSecret).update(SESSION_KEY_DOMAIN).update("\0").update(tokenHash).digest("base64url");
}
export function createFamilyLink(publicOrigin:string,generateBytes=()=>randomBytes(32)){
 const bytes=generateBytes();if(bytes.length!==32)throw new Error("Family link token source must return 32 bytes");
 const token=bytes.toString("hex");
 return {token,tokenHash:hashFamilyLinkToken(token),url:`${publicOrigin}/#family=${token}`};
}
```

- [ ] **Step 4: Parse the optional hash and add the example parameter**

Add `familyLinkTokenHash?: string` to `AppConfig`. In `envSchema`, preprocess `""` and `undefined` to `undefined`, otherwise require `/^[a-f0-9]{64}$/`. Return the parsed value from `parseConfig`. Add this line beside the password hashes in `.env.example`:

```dotenv
FAMILY_LINK_TOKEN_HASH=
```

- [ ] **Step 5: Add the compiled generator command**

Create `src/server/tools/create-family-link.ts`. Export a `formatFamilyLinkOutput(publicOrigin, generateBytes?)` helper returning exactly two newline-separated lines:

```text
FAMILY_LINK_TOKEN_HASH='<hash>'
FAMILY_LINK_URL='https://baby.example.com/#family=<token>'
```

When executed directly, require `PUBLIC_ORIGIN`, validate it as an HTTPS origin without credentials/query/fragment/path, print only those two lines to stdout, and send validation errors to stderr with exit code 1. Use an `import.meta.url` direct-execution guard so unit imports have no side effects.

- [ ] **Step 6: Run focused tests, typecheck, and build**

Run: `npm test -- tests/unit/family-link.test.ts tests/unit/config.test.ts && npm run typecheck && npm run build`

Expected: focused tests pass and `dist/server/tools/create-family-link.js` exists.

- [ ] **Step 7: Commit Task 1**

```bash
git add .env.example src/server/config.ts src/server/security/family-link.ts src/server/tools/create-family-link.ts tests/unit/config.test.ts tests/unit/family-link.test.ts
git commit -m "feat: configure private family links"
```

### Task 2: Exchange private links for revocable family sessions

**Files:**
- Modify: `src/server/routes/auth.ts`
- Modify: `src/server/app.ts`
- Modify: `tests/integration/auth.test.ts`

- [ ] **Step 1: Write failing integration tests**

Extend the auth integration harness to accept optional `familyLinkTokenHash` and create two app instances with the same `SESSION_SECRET` but different link hashes. Add tests proving:

- POST `/api/auth/family-link` with the exact configured token and Origin returns 200 and a `family_session` cookie with `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/`, and `Max-Age=2592000`.
- The cookie authenticates family status and family-guarded probes but not admin probes.
- Disabled, wrong, malformed, oversized, missing-body, invalid-media-type, and wrong-Origin attempts return only generic 4xx bodies and never echo the token.
- Five failed family-link attempts block the sixth for that IP, while normal family password login from the same IP still succeeds because quotas are isolated.
- A password-created family cookie remains valid after changing the link hash; a link-created cookie becomes 401 after changing the hash.
- Captured logs contain neither the raw token nor configured token hash.

- [ ] **Step 2: Run the integration file to verify RED**

Run: `npm test -- tests/integration/auth.test.ts`

Expected: FAIL because `/api/auth/family-link` does not exist and family guards accept only the normal codec.

- [ ] **Step 3: Extend auth options with an optional family-link credential**

Add this optional shape to `AuthRouteOptions`:

```ts
familyLink?:{
 tokenHash:string;
 sessions:SessionCodec;
 failedLogins:FailedLoginLimiter;
};
```

Create one `verifyFamilySession(token)` function that accepts either the normal family codec or the optional link codec. Use it consistently in the reusable family guard and `/api/auth/family/status`. Admin verification and password-session issuance remain normal-codec-only.

- [ ] **Step 4: Register the hardened exchange route**

Only when `familyLink` is configured, register POST `/api/auth/family-link` with exact-Origin enforcement, 8 KiB body limit, private/no-store response, generic malformed handling, and the separate limiter. Accept only an object with exactly one `token` string property no longer than 64 characters. Verify with `verifyFamilyLinkToken`; record isolated success/failure; issue `familyLink.sessions.issue("family")`; and set `family_session` using the existing secure cookie attributes with `maxAge:2592000`.

Use the same known Fastify malformed-content error-code set as password login. Never log the body, token, digest, or a token-specific error.

- [ ] **Step 5: Build the link codec in `buildApp`**

When `config.familyLinkTokenHash` exists, create a second session codec with:

```ts
secret:deriveFamilyLinkSessionSecret(config.sessionSecret,config.familyLinkTokenHash),
durationSeconds:2_592_000,
now,
generateNonce:options.dependencies?.generateNonce
```

Pass it, the hash, and a new `createFailedLoginLimiter({now})` instance into `registerAuthRoutes`. Keeping a separate limiter instance is required so link abuse cannot lock out password login.

- [ ] **Step 6: Run focused integration and all server checks**

Run: `npm test -- tests/integration/auth.test.ts tests/unit/session.test.ts && npm run typecheck`

Expected: all auth/session tests and typechecks pass.

- [ ] **Step 7: Commit Task 2**

```bash
git add src/server/app.ts src/server/routes/auth.ts tests/integration/auth.test.ts
git commit -m "feat: exchange private family links"
```

### Task 3: Consume and erase the fragment before analytics

**Files:**
- Create: `src/client/family-link.ts`
- Create: `tests/unit/client-family-link.test.ts`
- Modify: `src/client/api.ts`
- Modify: `src/client/main.tsx`
- Modify: `src/client/App.tsx`
- Modify: `tests/unit/client-api.test.ts`
- Modify: `tests/unit/app-family-flow.test.tsx`

- [ ] **Step 1: Write failing fragment and family-flow tests**

Create jsdom tests showing `takeFamilyLinkToken(location,history)` returns only an exact lowercase 64-hex token from `#family=...`, synchronously clears the hash while preserving pathname/query, and clears malformed/unknown fragments while returning `undefined`.

Add a client API assertion that `loginWithFamilyLink(token)` POSTs `/api/auth/family-link` with JSON `{token}` and same-origin credentials.

Extend the real App family-flow test: pass a token prop, assert password status is not requested first, make the link exchange resolve, then verify welcome loading. Add failure coverage that the password form appears with no token detail. Capture `window.location.hash` when analytics `track("page_view")` runs and assert it is already empty.

- [ ] **Step 2: Run the client tests to verify RED**

Run: `npm test -- tests/unit/client-family-link.test.ts tests/unit/client-api.test.ts tests/unit/app-family-flow.test.tsx`

Expected: FAIL because the fragment helper, API method, and App prop do not exist.

- [ ] **Step 3: Implement strict synchronous fragment removal**

Create `src/client/family-link.ts`:

```ts
const FAMILY_FRAGMENT=/^#family=([a-f0-9]{64})$/;
export function takeFamilyLinkToken(location:Pick<Location,"hash"|"pathname"|"search">=window.location,history:Pick<History,"state"|"replaceState">=window.history){
 const hash=location.hash;if(!hash)return undefined;
 history.replaceState(history.state,"",`${location.pathname}${location.search}`);
 return FAMILY_FRAGMENT.exec(hash)?.[1];
}
```

In `main.tsx`, call it before `createRoot` and pass the result as `<App familyLinkToken={familyLinkToken}/>` so React Strict Mode cannot double-consume the fragment.

- [ ] **Step 4: Exchange the token once in the family flow**

Add `loginWithFamilyLink(token)` to `api.ts`. Give `App` and `Family` an optional `familyLinkToken` prop. In Family's initial authentication effect, call the link exchange instead of status when a token exists. On success set `ready=true`; on any failure set `ready=false`. Preserve the existing public-config/analytics effect, welcome-copy flow, password login, admin route, and generic loading/error behavior.

- [ ] **Step 5: Run focused client tests and typecheck**

Run: `npm test -- tests/unit/client-family-link.test.ts tests/unit/client-api.test.ts tests/unit/app-family-flow.test.tsx && npm run typecheck`

Expected: fragment, exchange, fallback, and analytics-order tests pass.

- [ ] **Step 6: Commit Task 3**

```bash
git add src/client/family-link.ts src/client/api.ts src/client/main.tsx src/client/App.tsx tests/unit/client-family-link.test.ts tests/unit/client-api.test.ts tests/unit/app-family-flow.test.tsx
git commit -m "feat: open slideshow from private links"
```

### Task 4: Document, verify, and scan the deployment

**Files:**
- Modify: `docs/DOCKGE_SETUP.md`
- Test: existing complete suite

- [ ] **Step 1: Document generation and revocation**

Add these owner steps without including a real secret:

```bash
docker exec immich-baby-slideshow-baby-slideshow-1 \
  node dist/server/tools/create-family-link.js
```

Explain that the first output line goes into `.env`, the second is the private link to save/share, the container must be force-recreated after changing `.env`, and rotating the hash immediately revokes the old link and link-created sessions. Warn that anyone with the URL has family access. State that no Cloudflare configuration changes are needed.

- [ ] **Step 2: Run the complete verification gate**

Run: `npm run verify`

Expected: every typecheck, unit/integration test, production client/server build, and browser gate exits 0.

- [ ] **Step 3: Smoke-test the compiled generator**

Run with a non-secret test origin:

```bash
PUBLIC_ORIGIN=https://baby.example.com node dist/server/tools/create-family-link.js
```

Expected: exactly one canonical hash assignment and one HTTPS fragment URL; no token appears in the hash line.

- [ ] **Step 4: Scan for credential leakage**

Generate a known test token in a test-only command, build, and confirm that neither that token nor any real-looking `#family=` URL appears in `dist/client`, server logs, tracked `.env` files, or git diff. Run `git diff --check` and verify the worktree contains only intended files.

- [ ] **Step 5: Commit documentation**

```bash
git add docs/DOCKGE_SETUP.md
git commit -m "docs: deploy private family links"
```
