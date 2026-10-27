# Plan: `cf-python-template` — Python Worker (+ static assets + Durable Object) monorepo template

## Goal
Create a **new, standalone template repository** that jump-starts future projects with:
- One **Cloudflare Worker** serving both the static web frontend (**Workers static assets**) and the **all-Python** backend (Python Workers GA since Sept 2026)
- A Python **Durable Object** with WebSocket hibernation for state (no DB)
- GitHub Actions: tests on PRs, auto-deploy to production on merge to `main`
- Deploy needs only a Cloudflare API token + account ID as GitHub secrets — zero CF dashboard setup
- Lean demo feature: a single global **chat** ("a little chat, send message function") — no rooms

Not in scope (explicitly deferred): live PR preview deployments, UAT/staging environment (user wants later), porting quiz-croc features into this template, custom domains, separate Cloudflare Pages hosting (rejected: CF recommends Workers static assets for new projects — https://developers.cloudflare.com/workers/best-practices/workers-best-practices/ — and the same `dist/` can later be pointed at Pages or any static host if requirements change).

## Verified context (for the implementing agent)
- Current quiz-croc backend (TS worker + `QuizCrocGameDO`, WS hibernation, alarms, `assets.directory: ./dist` with SPA fallback) stays untouched; this template is a fresh repo. quiz-croc already proves the worker-serves-assets pattern works in the user's account (`src/index.ts` here handles `/game/*` then falls through to `env.ASSETS.fetch`).
- Python Workers GA: supports Durable Objects (since May 2025) and WebSocket hibernation. Reference docs the agent MUST check for exact API shape:
  - https://developers.cloudflare.com/workers/languages/python/ (Python Workers, requirements.txt / pip handling)
  - https://developers.cloudflare.com/changelog/post/2025-05-14-python-worker-durable-object/ (Python DO example)
  - https://developers.cloudflare.com/durable-objects/best-practices/websockets/ (hibernation API; contains a Python snippet: `from workers import Response, DurableObject; from js import WebSocketPair`, `self.ctx.acceptWebSocket(...)`, snake_case handlers like `web_socket_message`, `web_socket_close`)
  - https://developers.cloudflare.com/workers/static-assets/ (assets config incl. `not_found_handling: single-page-application`)
- User's outer workflow: Kilo (from phone) creates a repo from this template → writes GitHub issues → agent plans/implements on a feature branch → PR → user reviews → merge to main → auto-deploy. The template must ship agent-friendly meta files (see Task 8).

### 0. Handoff & pre-flight (the implementing agent runs this FIRST)
- This plan is executed in a **new session, possibly with a different model**. Step 1: read this plan file end-to-end (`/workspace/app/.kilo/plans/1793131589103-cf-python-worker-pages-template.md`).
- Verify GitHub auth before promising repo creation: `gh auth status`. Note: in the planning session, `GH_TOKEN` was a `kilo-code-bot[bot]` token and was **invalid**. If auth works and can create repos on the user's account → the agent creates the repo (Task 10). If broken → fall back to: user creates the private repo from their phone, OR `gh auth login` device flow (print code, user completes on phone), OR user supplies a PAT as `GH_TOKEN`.
- Verify toolchain: node 22 + npm, python 3.13, `npx wrangler` after `npm ci` (repo-local). CF credentials are NOT needed for any local validation (dry-run needs no auth) and NOT available in this sandbox — deploy is verified by the user after bootstrap (Task 7).
- The user has **explicitly authorized** creating the private GitHub repo on their account and pushing the template to it (Task 10) — they will approve each git/gh command as the sandbox prompts it.

## Decisions (already confirmed with user — do not re-litigate)
| Topic | Decision |
|---|---|
| Static hosting | **Workers static assets** served by the same Python Worker (user approved on my recommendation; replaces earlier Pages choice) |
| Backend language | All Python, incl. DO; TS only exists in the frontend |
| Frontend | Vite + React + TS, web-only; adding an Expo app later is documented as a supported extension |
| Demo feature | Single global chat over WebSocket (no room creation), plus simple REST endpoints |
| PR workflow | Tests + checks only; deploy only on `main` |
| AI/features | No AI endpoint in v1 (sketch the pattern in AGENTS.md as "how to add outbound API + secret") |
| Package manager | npm workspaces (matches user's tooling; wrangler pinned in root devDependencies) |
| Auth for CI | GH secrets `CLOUDFLARE_API_TOKEN` (scopes: **Workers Scripts:Edit**, **Account Settings:Read**) + `CLOUDFLARE_ACCOUNT_ID`. Nothing else — Worker, assets, DO namespace + v1 migration are created by first `wrangler deploy`. No Pages project, no repo vars. |

## Target repo layout
```
cf-python-template/                (repo name: user picks, suggestion: cf-python-template)
├── AGENTS.md                       # Kilo/agent instructions: commands, conventions, rules
├── BOOTSTRAP.md                   # one-time setup runbook (CF token + GH secrets only)
├── package.json                    # npm workspaces root: ["apps/web", "packages/shared"]
├── apps/
│   ├── web/                        # Vite + React + TS (frontend)
│   │   ├── src/
│   │   │   ├── api/client.ts       # REST + WS client, message types from @template/shared
│   │   │   ├── components/Chat.tsx
│   │   │   └── App.tsx
│   │   ├── vite.config.ts          # dev proxy: /api and /ws -> http://localhost:8787 (ws: true)
│   │   └── eslint.config.js, tsconfig.json
│   └── worker/                     # NOT an npm workspace (pure Python + wrangler)
│       ├── wrangler.jsonc          # main: src/main.py, DO binding + migration, assets block
│       ├── requirements.txt        # empty or no deps (keep runtime zero-dependency)
│       ├── requirements-dev.txt    # ruff, pytest (local dev only, never deployed)
│       └── src/
│           ├── main.py             # fetch entry: routing /api/*, /ws/chat -> ChatDO, else ASSETS
│           ├── chat_do.py          # ChatDO: WS hibernation, storage, alarm cleanup
│           ├── types.py            # dataclasses mirroring @template/shared TS types
│           └── validation.py       # pure-python message validation (unit-testable)
├── packages/shared/                # TS wire types: WsMessage union, ChatMessage
│   └── src/index.ts
├── scripts/
│   ├── ensure-dist.mjs             # creates apps/web/dist so wrangler dev/dry-run can run pre-build
│   └── ws-smoke.py                 # local WS smoke client (uses `websockets` pip pkg, NOT on worker)
├── .github/
│   ├── workflows/ci.yml            # PR checks
│   ├── workflows/deploy.yml        # main: build web -> wrangler deploy (assets + python + DO migration)
│   ├── ISSUE_TEMPLATE/feature-request.md
│   └── PULL_REQUEST_TEMPLATE.md
└── .gitignore                       # node_modules, dist, .wrangler, __pycache__, .pyc, .env
```

## Tasks

### 1. Scaffold repo skeleton
- `git init` new directory (e.g. `/workspace/cf-python-template`); npm workspaces root `package.json` with scripts:
  - `dev`: `concurrently "npm:dev:worker" "npm:dev:web"` (add `concurrently` devDep)
  - `predev:worker` + `predeploy`-style guards: `node scripts/ensure-dist.mjs` (wrangler requires the assets dir to exist; create empty dir if no build yet)
  - `dev:worker`: `wrangler dev --config apps/worker/wrangler.jsonc`
  - `dev:web`: `npm run dev --workspace @template/web`
  - `lint`: web eslint + `ruff check apps/worker/src`
  - `test`: `pytest apps/worker` (after `pip install -r apps/worker/requirements-dev.txt`) + `npm test --workspaces` (vitest)
  - `build`: vite build (produces `apps/web/dist` — the worker's asset directory)
- Root `devDependencies`: `wrangler` (pinned ^4.x), `concurrently`. All local & CI deploys use the repo-local wrangler via `npx wrangler` (no version drift).

### 2. Worker (Python) — `apps/worker`
- `wrangler.jsonc`:
  - `name`: `template-api` (placeholder; rename runbook in BOOTSTRAP.md)
  - `main`: `src/main.py`, fresh `compatibility_date` (today's), `observability.enabled: true`
  - `migrations`: `[{ tag: "v1", new_sqlite_classes: ["ChatDO"] }]` (SQLite-backed = free-tier friendly)
  - `durable_objects.bindings`: `[{ name: "CHAT_DO", class_name: "ChatDO" }]`
  - `assets`: `{ directory: "../web/dist", binding: "ASSETS", not_found_handling: "single-page-application" }` (path is relative to the wrangler config; mirrors the working quiz-croc setup)
- `src/main.py` fetch entry (same pattern as quiz-croc's `src/index.ts`, in Python):
  - `GET /api/health` → `{"ok": true, "time": ...}` (proves REST wiring)
  - `GET /ws/chat` → WebSocket upgrade → forward to `env.CHAT_DO.get(env.CHAT_DO.idFromName("global"))` stub (reject non-upgrade requests with 426)
  - Any other path → `await env.ASSETS.fetch(request)` (SPA assets serving; **must be smoke-tested** since it's Pyodide→JS interop)
  - **No CORS in v1** — same-origin in dev (Vite proxy) and prod (assets). AGENTS.md documents the absolute-URL + CORS recipe for adding non-browser clients (e.g. Expo) later.
- `src/chat_do.py` — `class ChatDO(DurableObject)` with WebSocket hibernation (verify exact Python API against docs; expect roughly):
  - `fetch`: create `WebSocketPair`, `self.ctx.acceptWebSocket(server)`, send `{"type":"history", ...}` from storage, return 101 Response with the socket
  - `web_socket_message`: parse JSON via `validation.py`, append to persistent storage (single JSON list key, capped at last 200 messages), broadcast `{"type":"message", ...}` to all `self.ctx.getWebSockets()`
  - `web_socket_close`: no-op (state lives in storage; object can evict)
  - `alarm()`: set alarm on each message (e.g. +7d); on alarm, trim kept history (demonstrates the alarm pattern quiz-croc uses for game timers)
- `src/validation.py` (pure, stdlib only): `validate_message(obj) -> ChatMessage` enforcing: `type == "message"`, text non-empty, `len <= 500`, returns typed dataclass or raises `ValidationError(status=400)`
- Keep all business logic pure-python and framework-free; DO/io handlers stay thin. Zero pip runtime dependencies (avoid Pyodide packaging issues entirely).
- Worker unit tests (`apps/worker/tests/`): `ruff check` passes; `pytest` covers `validation.py` and chat-history cap/trim logic (pure functions).

### 3. Wire protocol + shared types
- `packages/shared/src/index.ts`: `ChatMessage { id: string; text: string; ts: number }`, WS message union: `{ type: "history", messages: ChatMessage[] } | { type: "message"; id; text; ts } | { type: "error"; message: string } | { type: "ping" }`; API response types.
- Worker `src/types.py` dataclasses mirror these shapes **exactly** (field names = JSON keys).
- AGENTS.md rule: any protocol change updates both files in the same PR.

### 4. Frontend — `apps/web`
- Vite `react-ts` template, strict TS, ESLint flat config from the template.
- `vite.config.ts`: dev server proxy `"/api"` and `"/ws"` → `http://localhost:8787` (`ws: true`), so dev uses relative URLs with zero CORS.
- `src/api/client.ts`:
  - **Relative URLs everywhere** (same origin in dev via proxy, in prod via worker assets) — no `VITE_API_URL` env needed
  - `wsUrl()` derives from `window.location` (`ws`/`wss` + same host); WS client with auto-reconnect (backoff, max 5 tries) and "reconnecting…" UI state
  - `getHealth()` REST call used on the landing screen
- `Chat.tsx`: message list, input, send button → `{type:"message", text}`; incoming `history`/`message` rendering; disabled input while disconnected.
- Minimal but real tests: `vitest` — unit test the client's message mapping/reconnect logic (extract pure helpers). `npm run build` (tsc + vite) must pass.

### 5. Local smoke verification (creating agent MUST run these)
1. `npm ci` at root; `pip install -r apps/worker/requirements-dev.txt` (or venv)
2. `node scripts/ensure-dist.mjs && npx wrangler deploy --dry-run --config apps/worker/wrangler.jsonc` — build passes (Python entry + assets bundled)
3. `npx wrangler dev --config apps/worker/wrangler.jsonc` (port 8787):
   - `curl localhost:8787/api/health` → `{"ok":true,...}`
   - `python scripts/ws-smoke.py` → opens `ws://localhost:8787/ws/chat`, sends a message, asserts `history` then echoed `message` broadcast
4. `npm run dev` → open `http://localhost:5173`, send chat messages from two browser tabs, both see live updates through the DO (proxy + WS upgrade work)
5. `npm run build` once, restart wrangler dev → `curl localhost:8787/` serves `index.html` (**asset pass-through via `env.ASSETS.fetch` from Python works**); chat history of last messages still served (storage persistence works)
6. `npm run lint`, `npm test`, `npm run build` all green

### 6. GitHub Actions
- `ci.yml` (on: `pull_request` to main):
  - job `web`: setup-node 22, `npm ci`, `eslint`, `tsc --noEmit` via build, `vitest run`
  - job `worker`: setup-python 3.13, `pip install -r apps/worker/requirements-dev.txt`, `ruff check`, `pytest`; then `node scripts/ensure-dist.mjs && npx wrangler deploy --dry-run --config apps/worker/wrangler.jsonc` (no CF auth needed for dry-run; assets dir must exist)
- `deploy.yml` (on: `push` branches [main] + `workflow_dispatch`), `concurrency: deploy-main`, single job:
  - setup-node 22, `npm ci`
  - `npm run build` (vite build → `apps/web/dist`)
  - `npx wrangler deploy --config apps/worker/wrangler.jsonc` with env `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` (from GH secrets). One command deploys: Python worker + API routes + static assets + DO namespace creation + v1 migration (auto-applied on first deploy).
- Required repo config (set once via BOOTSTRAP.md): GH **secrets** only — `CLOUDFLARE_API_TOKEN` (scopes: Workers Scripts:Edit, Account Settings:Read), `CLOUDFLARE_ACCOUNT_ID`. No CF dashboard steps, no Pages project, no repo variables.

### 7. Bootstrap runbook — `BOOTSTRAP.md`
One-time steps for a NEW repo created from this template (user or agent runs locally; git push needs user approval):
1. Optional: rename worker in `wrangler.jsonc` (+ DO class refs) or keep default `template-api`
2. Create CF API token (My Profile → API Tokens → Create Custom Token) with scopes: **Workers Scripts:Edit**, **Account Settings:Read**
3. `gh secret set CLOUDFLARE_API_TOKEN` and `gh secret set CLOUDFLARE_ACCOUNT_ID`
4. Push to main → `deploy.yml` runs; first `wrangler deploy` auto-creates the Worker, DO namespace, applies migration, uploads assets
5. Verify: open `https://template-api.<subdomain>.workers.dev` → health endpoint green, chat works
Migration between template revisions stays additive: renaming/adding DO classes requires a new migration tag (rules in AGENTS.md).

### 8. Agent-workflow meta files (aligned with user's phone + Kilo loop)
- `AGENTS.md`: repo layout; exact commands (install/dev/lint/test/build/deploy); "never commit secrets"; "protocol changes touch shared TS + python types together"; DO migration rules (new classes only via added migration tag); wrangler pinned at root, CI uses `npx wrangler`; extension recipes: (a) adding an Expo/native app later = new `apps/<x>` workspace + absolute-API-URL + CORS recipe, (b) moving FE to Pages/Netlify later = point host at `apps/web/dist` + same CORS recipe.
- `.github/ISSUE_TEMPLATE/feature-request.md`: Context / Desired behavior / Acceptance criteria / Out of scope — sections an agent can plan directly from when written from a phone.
- `.github/PULL_REQUEST_TEMPLATE.md`: summary, how to run/test, checklist (tests added, protocol sync rule kept, deploy notes).
- `BOOTSTRAP.md` (above) covers the "create new project from template" path end-to-end.

### 9. Publish — create the **private** GitHub repo on the user's account (explicitly authorized)
- From the scaffold directory (Tasks 1–8 complete, all Task 5 checks green) run:
  `gh repo create zol1e/cf-python-template --private --source=. --remote=origin --push`
  (default branch `main`; repo name is a suggestion — use what the user confirms in-session; **private is required**)
- If `gh auth status` fails (the planning session's `GH_TOKEN` was an invalid bot token): fall back in this order —
  1. `gh auth login` device flow: the agent prints the code/URL, the user completes it from their phone, then retry `gh repo create`
  2. the user creates the empty private repo from their phone (30s), gives the agent the URL, and the agent runs `git remote add origin <url> && git push -u origin main` (same auth requirement — resolve with step 1 if push is rejected)
- After publish: `gh repo view --web`-style URL in the final report; remind the user of BOOTSTRAP.md steps (2 GH secrets) so `deploy.yml` goes green on the next push to main.

### 10. README.md (short)
- What this template gives; architecture (browser → workers.dev worker: Python `fetch` entry routes `/api/*` + `/ws/*`, serves Vite build via `ASSETS`, state in ChatDO); dev commands; deploy flow (merge → single `wrangler deploy`); list deferred ideas: UAT/staging env, PR preview deployments (Workers versions/preview URLs or `wrangler versions upload`), same-domain split to Pages/other host, Workers AI / OpenRouter endpoint pattern, Expo app as extra workspace, custom domain.

## Data flow (contract)
- Dev: browser → Vite dev server (5173, relative `/api`, `/ws`) → proxy → `wrangler dev` Python worker → ChatDO (in-memory + storage)
- Prod: browser → `https://<worker>.workers.dev` (same origin) → Python `main.py`: `/api/*`, `/ws/*` handled, everything else → `env.ASSETS.fetch` (SPA fallback to `index.html`)
- WS: JSON frames per `packages/shared`; on connect server sends `history` (last 200 from DO storage); each send broadcasts `message` to all sockets; invalid input → `error` frame, HTTP 400 for REST
- DO eviction/hibernation: safe — messages persisted in DO storage; sockets wake via hibernation API

## Failure modes & risks
- **Python DO / assets interop details** (exact `Response.new(..., webSocket=...)`, `getWebSockets`, `env.ASSETS.fetch` from Pyodide) may differ from docs snippets — the creating agent must verify against cited docs and prove with the Task 5 smoke tests, not just type-check
- **Assets dir missing** breaks `wrangler dev` / dry-run / deploy — mitigated by `scripts/ensure-dist.mjs` pre-hooks; deploy workflow always builds first
- **No pip runtime deps** — Pyodide native-extension packaging is a footgun; deliberately avoided; documented in AGENTS.md
- **DO migration misuse** (renaming class without adding migration) breaks deploys → rules in AGENTS.md
- **Coupled FE/backend deploys** (accepted trade-off of worker-assets): a FE-only change ships on next merge; assets are content-hashed so only changed files re-upload
- Sandbox is ephemeral and the creating agent has no CF credentials: live deploy verification happens during bootstrap by the user (Task 7 step 5), not by the creating agent

## Validation (definition of done for the template repo)
- All Task 5 local checks green; ci.yml green on the initial push (web + worker jobs)
- Dry-run deploy builds Python entry + assets without DO migration warnings beyond intentional v1
- Private repo exists on the user's GitHub account (Task 9) with the full template pushed to `main`; user walked through BOOTSTRAP.md (2 GH secrets → next push to main deploys and they verify the live URL)
