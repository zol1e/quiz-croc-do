# Plan: `cf-python-template` — Cloudflare Pages + Python Worker + Durable Object monorepo template

## Goal
Create a **new, standalone template repository** that jump-starts future projects with:
- **Cloudflare Pages** hosting a static web frontend (Vite + React + TS)
- **Cloudflare Worker** backend written in **all-Python** (Python Workers are GA since Sept 2026)
- A Python **Durable Object** with WebSocket hibernation for state (no DB)
- GitHub Actions: tests on PRs, auto-deploy to production on merge to `main`
- Lean demo feature: a single global **chat** ("a little chat, send message function") — no rooms

Not in scope (explicitly deferred): live PR preview deployments, UAT/staging environment (user wants later), porting quiz-croc features into this template, custom domains.

## Verified context (for the implementing agent)
- Current quiz-croc backend (TS worker + `QuizCrocGameDO`, WS hibernation, alarms) stays untouched; this template is a fresh repo.
- Python Workers GA: supports Durable Objects (since May 2025) and WebSocket hibernation. Reference docs the agent MUST check for exact API shape:
  - https://developers.cloudflare.com/workers/languages/python/ (Python Workers, requirements.txt / pip handling)
  - https://developers.cloudflare.com/changelog/post/2025-05-14-python-worker-durable-object/ (Python DO example)
  - https://developers.cloudflare.com/durable-objects/best-practices/websockets/ (hibernation API; contains a Python snippet: `from workers import Response, DurableObject; from js import WebSocketPair`, `self.ctx.acceptWebSocket(...)`, snake_case handlers like `web_socket_message`, `web_socket_close`)
- Cloudflare recommends Workers static assets over Pages for new projects; user explicitly chose **Pages** (independent FE deploys, host-agnostic `dist/`). Respect that.
- User's outer workflow: Kilo (from phone) creates a repo from this template → writes GitHub issues → agent plans/implements on a feature branch → PR → user reviews → merge to main → auto-deploy. The template must therefore ship agent-friendly meta files (see Task 8).

## Target repo layout
```
cf-python-template/                (repo name: user picks, suggestion: cf-python-template)
├── AGENTS.md                       # Kilo/agent instructions: commands, conventions, rules
├── BOOTSTRAP.md                   # one-time setup runbook (CF resources + GH secrets/vars)
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
│       ├── wrangler.jsonc
│       ├── requirements.txt        # empty or no deps (keep runtime zero-dependency)
│       ├── requirements-dev.txt    # ruff, pytest (local dev only, never deployed)
│       └── src/
│           ├── main.py             # fetch entry: CORS, routing /api/*, /ws/chat -> ChatDO
│           ├── chat_do.py          # ChatDO: WS hibernation, storage, alarm cleanup
│           ├── types.py            # dataclasses mirroring @template/shared TS types
│           └── validation.py       # pure-python message validation (unit-testable)
├── packages/shared/                # TS wire types: WsMessage union, ChatMessage
│   └── src/index.ts
├── scripts/
│   ├── bootstrap.sh                 # one-time CF Pages project creation + GH var/secret helper
│   └── ws-smoke.py                 # local WS smoke client (uses `websockets` pip pkg, NOT on worker)
├── .github/
│   ├── workflows/ci.yml            # PR checks
│   ├── workflows/deploy.yml         # main: deploy worker, then Pages
│   ├── ISSUE_TEMPLATE/feature-request.md
│   └── PULL_REQUEST_TEMPLATE.md
└── .gitignore                       # node_modules, dist, .wrangler, __pycache__, .pyc, .env
```

## Decisions (already confirmed with user — do not re-litigate)
| Topic | Decision |
|---|---|
| Static hosting | Cloudflare Pages, direct upload via `wrangler pages deploy` (no git-connected Pages builds) |
| Backend language | All Python, incl. DO; TS only exists in the frontend |
| Frontend | Vite + React + TS, web-only; adding an Expo app later is documented as a supported extension |
| Demo feature | Single global chat over WebSocket (no room creation), plus simple REST endpoints |
| PR workflow | Tests + checks only; deploys only on `main` |
| AI/features | No AI endpoint in v1 (sketch the pattern in AGENTS.md as "how to add outbound API + secret") |
| Package manager | npm workspaces (matches user's tooling; wrangler pinned in root devDependencies) |

## Tasks

### 1. Scaffold repo skeleton
- `git init` new directory (e.g. `/workspace/cf-python-template`); npm workspaces root `package.json` with scripts:
  - `dev`: `concurrently "npm:dev:worker" "npm:dev:web"` (add `concurrently` devDep)
  - `dev:worker`: `wrangler dev --config apps/worker/wrangler.jsonc`
  - `dev:web`: `npm run dev --workspace @template/web`
  - `lint`: web eslint (skip for worker dir) + `ruff check apps/worker/src`
  - `test`: `pytest apps/worker` (via venv or `pip install -r apps/worker/requirements-dev.txt`) + `npm test --workspaces` (vitest)
  - `build`: vite build
- `devDependencies` at root: `wrangler` (pinned ^4.x), `concurrently`. All deploys in CI use the repo-local wrangler via `npx wrangler` (no version drift).

### 2. Worker (Python) — `apps/worker`
- `wrangler.jsonc`:
  - `name`: `template-api` (placeholder; bootstrap/rename runbook covers it)
  - `main`: `src/main.py`, fresh `compatibility_date` (today's), `observability.enabled: true`
  - `migrations`: `[{ tag: "v1", new_sqlite_classes: ["ChatDO"] }]` (SQLite-backed = free-tier friendly)
  - `durable_objects.bindings`: `[{ name: "CHAT_DO", class_name: "ChatDO" }]`
  - `vars`: `ALLOWED_ORIGINS` default `http://localhost:5173` (bootstrap sets prod Pages origin)
- `src/main.py` fetch entry:
  - CORS: OPTIONS preflight + reflect `Origin` if it matches `ALLOWED_ORIGINS` (comma-separated; support `*` suffix entries like `*.pages.dev` for future PR previews) else no CORS headers
  - `GET /api/health` → `{"ok": true, "time": ...}` (proves REST wiring)
  - `GET /ws/chat` → WebSocket upgrade → forward to `env.CHAT_DO.get(env.CHAT_DO.idFromName("global"))` stub
  - Any other path → 404 JSON
- `src/chat_do.py` — `class ChatDO(DurableObject)` with WebSocket hibernation (verify exact Python API against docs; expect roughly):
  - `fetch`: create `WebSocketPair`, `self.ctx.acceptWebSocket(server)`, send `{"type":"history", ...}` from storage, return 101 Response with the socket
  - `web_socket_message`: parse JSON via `validation.py`, append to persistent storage (single JSON list key, capped at last 200 messages), broadcast `{"type":"message", ...}` to all `self.ctx.getWebSockets()`
  - `web_socket_close`: no-op (state lives in storage; object can evict)
  - `alarm()`: set alarm on each message (e.g. +7d); on alarm, trim kept history (demonstrates the alarm pattern quiz-croc uses for game timers)
- `src/validation.py` (pure, no runtime imports beyond stdlib): `validate_message(obj) -> ChatMessage` enforcing: `type == "message"`, text non-empty, `len <= 500`, returns typed dataclass or raises `ValidationError(status=400)`
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
  - `API_URL = import.meta.env.VITE_API_URL ?? ""` (relative in dev via proxy; absolute `https://…workers.dev` in prod baked at CI build time)
  - `wsUrl()` derives `ws(s)://` from `API_URL`; WS client with auto-reconnect (backoff, max 5 tries) and "reconnecting…" UI state
  - `getHealth()` REST call used on the landing screen
- `Chat.tsx`: message list, input, send button → `{type:"message", text}`; incoming `history`/`message` rendering; disabled input while disconnected.
- Minimal but real tests: `vitest` — unit test the client's message mapping/reconnect logic (extract pure helpers). `npm run build` (tsc + vite) must pass.

### 5. Local smoke verification (creating agent MUST run these)
1. `npm ci` at root; `pip install -r apps/worker/requirements-dev.txt` (or venv)
2. `npx wrangler deploy --dry-run --config apps/worker/wrangler.jsonc` — build passes (Python entry bundled)
3. `npx wrangler dev --config apps/worker/wrangler.jsonc` (port 8787):
   - `curl localhost:8787/api/health` → `{"ok":true,...}`
   - `python scripts/ws-smoke.py` → opens `ws://localhost:8787/ws/chat`, sends a message, asserts `history` then echoed `message` broadcast
4. `npm run dev` → open `http://localhost:5173`, send chat messages from two browser tabs, both see live updates through the DO
5. Restart wrangler dev → history of last messages still served (storage persistence works)
6. `npm run lint`, `npm test`, `npm run build` all green

### 6. GitHub Actions
- `ci.yml` (on: `pull_request` to main): 
  - job `web`: setup-node 22, `npm ci`, `eslint`, `tsc --noEmit` via build, `vitest run`
  - job `worker`: setup-python 3.13, `pip install -r apps/worker/requirements-dev.txt`, `ruff check`, `pytest`; then `npx wrangler deploy --dry-run --config apps/worker/wrangler.jsonc` (no CF auth needed for dry-run)
- `deploy.yml` (on: `push` branches [main] + `workflow_dispatch`), `concurrency: deploy-main`, jobs:
  1. `deploy-worker`: `npx wrangler deploy --config apps/worker/wrangler.jsonc` with env `CLOUDFLARE_API_TOKEN` (secret) + `CLOUDFLARE_ACCOUNT_ID` (secret). Wrangler applies the v1 DO migration automatically on first deploy.
  2. `deploy-pages` (needs deploy-worker): `VITE_API_URL=${{ vars.API_URL }} npm run build` then `npx wrangler pages deploy apps/web/dist --project-name=${{ vars.PAGES_PROJECT }} --branch=main` (API_TOKEN must have Pages:Edit scope)
- Required repo config (set by bootstrap, documented in BOOTSTRAP.md):
  - Secrets: `CLOUDFLARE_API_TOKEN` (scopes: Workers Scripts:Edit, Cloudflare Pages:Edit, Account Settings:Read), `CLOUDFLARE_ACCOUNT_ID`
  - Variables: `PAGES_PROJECT` (Pages project name), `API_URL` (the worker's `*.workers.dev` URL, known after first worker deploy)

### 7. Bootstrap runbook — `BOOTSTRAP.md` + `scripts/bootstrap.sh`
One-time steps for a NEW repo created from this template (user or agent runs locally; git commands need user approval):
1. Optional: rename worker in `wrangler.jsonc` + DO class refs (or keep defaults)
2. `npx wrangler deploy` once → note `https://<name>.<subdomain>.workers.dev`
3. `npx wrangler pages project create $PAGES_PROJECT --production-branch main`
4. `wrangler secret`/var: set `ALLOWED_ORIGINS` to prod Pages origin (`https://$PAGES_PROJECT.pages.dev`) — via dashboard or `wrangler.jsonc` vars
5. `gh secret set CLOUDFLARE_API_TOKEN/CLOUDFLARE_ACCOUNT_ID` and `gh variable set PAGES_PROJECT/API_URL`
6. Push to main → verify both Actions jobs deploy; open Pages URL, health check green, chat works
Script automates steps 2–5 where non-interactive, prints manual steps otherwise.

### 8. Agent-workflow meta files (aligned with user's phone + Kilo loop)
- `AGENTS.md`: repo layout; exact commands (install/dev/lint/test/build/deploy); "never commit secrets"; "protocol changes touch shared TS + python types together"; DO migration rules (new classes only via added migration tag); note that wrangler is pinned at root and CI uses `npx wrangler`; extension recipe: "adding an Expo/native app later = new `apps/<x>` workspace + same API_URL pattern".
- `.github/ISSUE_TEMPLATE/feature-request.md`: Context / Desired behavior / Acceptance criteria / Out of scope — sections an agent can plan directly from when written from a phone.
- `.github/PULL_REQUEST_TEMPLATE.md`: summary, how to run/test, checklist (tests added, protocol sync rule kept, deploy notes).
- `BOOTSTRAP.md` covers the "create new project from template" path end-to-end.

### 9. README.md (short)
- What this template gives; architecture diagram (Pages → browser → workers.dev worker → ChatDO); dev commands; deploy flow; list of deferred ideas: UAT/staging env, PR preview deploys (Pages `--branch`), same-origin Pages Function service-binding proxy, Workers AI / OpenRouter endpoint pattern, Expo app as extra workspace.

## Data flow (contract)
- Dev: browser → Vite proxy (relative `/api`, `/ws`) → `wrangler dev` Python worker → ChatDO (in-memory + storage)
- Prod: browser (Pages) → `https://<worker>.workers.dev` (absolute, CORS-validated via `ALLOWED_ORIGINS`) → ChatDO
- WS: JSON frames per `packages/shared`; on connect server sends `history` (last 200 from DO storage); each send broadcasts `message` to all sockets; invalid input → `error` frame, HTTP 400 for REST
- DO eviction/hibernation: safe — messages persisted in DO storage; sockets resume via hibernation API

## Failure modes & risks
- **Python DO API details** (exact `Response.new(..., webSocket=...)`, `getWebSockets`, storage JSON interop in Pyodide) may differ slightly from docs snippets — the creating agent must verify against the cited docs and prove with the Task 5 smoke tests, not just type-check
- **No pip runtime deps** — Pyodide native-extension packaging is a footgun; deliberately avoided; document in AGENTS.md
- **Pages project must exist before first `deploy.yml` run** → bootstrap order enforced in runbook
- **`API_URL` race**: FE deploy needs worker URL before first pages deploy → bootstrap deploys worker first; deploy.yml also orders worker→pages
- **DO migration misuse** (renaming class without adding migration) breaks deploys → rules in AGENTS.md
- Sandbox is ephemeral and the creating agent will not have CF credentials: live deploy verification happens during bootstrap by the user (Task 7 step 6), not by the creating agent

## Validation (definition of done for the template repo)
- All Task 5 local checks green in the template repo's own CI (ci.yml green on the initial PR/first push)
- Dry-run deploy builds the Python worker; no missing DO migrations warnings beyond intentional v1
- Repo pushed to user's GitHub (name suggested: `cf-python-template`) only when the user asks/authorizes; otherwise deliver the local repo and runbook
