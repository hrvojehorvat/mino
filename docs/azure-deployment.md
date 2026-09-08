# Azure Deployment

Operational runbook for putting Mino on Azure. Unlike other `docs/` files, this one is a log of what was actually typed and why — kept as the deployment happens, not written up after the fact.

**Workflow note:** for every `az`/`gh` provisioning or deployment command, the user runs it themselves (this is a deliberate learning-the-platform exercise) and pastes the output back. Only read-only inspection commands (`az group show`, `az *  list-skus`, etc.) get run directly. Command blocks below are shown as given to the user; placeholders like `<PASSWORD>` and `<MY_IP>` were filled in by them, not recorded here.

Status legend: not started / in progress / done.

## Step 1 — Setup
**Status:** done

- [x] Azure CLI installed, logged in.
- [x] Resource group created:
  ```bash
  az group create --name mino-rg --location westeurope
  ```
- [x] GitHub repo for the project — needed before Step 4 (image registry):
  ```bash
  gh auth login
  gh repo create mino --private --source=. --remote=origin --push
  ```
  (`git@github.com:hrvojehorvat/mino.git`, used since Phase 0 — this just made sure `gh` itself was authenticated and the `origin` remote set up.)

## Step 2 — Database
**Status:** done

Goal: a Postgres server on Azure, with the existing Prisma migrations run against it once from a local machine.

- [x] Found public IP (for the server firewall rule):
  ```bash
  curl -s https://api.ipify.org
  ```
- [x] First attempt, `westeurope`, failed — Azure is not accepting new PostgreSQL Flexible Server customers in that region right now (`RequestDisallowedByAzure` / "selected region is currently not accepting new customers"). This is a capacity restriction on the resource type in that region, unrelated to the account. Fix: put the *server* in a different region — a resource group's location is just metadata, it doesn't constrain where resources inside it live. Confirmed `Standard_B1ms` available in both candidate regions via a read-only check:
  ```bash
  az postgres flexible-server list-skus --location swedencentral -o json
  az postgres flexible-server list-skus --location northeurope -o json
  ```
  Picked `northeurope` (closer to `westeurope`, same jurisdiction).
- [x] Second attempt failed with `MissingSubscriptionRegistration` — the subscription had never used the `Microsoft.DBforPostgreSQL` resource provider before, so it needs a one-time registration:
  ```bash
  az provider register --namespace Microsoft.DBforPostgreSQL
  ```
  Checked progress with:
  ```bash
  az provider show --namespace Microsoft.DBforPostgreSQL --query registrationState -o tsv
  ```
  (Portal equivalent: Subscription → Settings → Resource providers → filter `Microsoft.DBforPostgreSQL`, watch the Status column go `Registering` → `Registered`.)
- [x] Re-ran server creation once the provider showed `Registered` — succeeded:
  ```bash
  az postgres flexible-server create \
    --resource-group mino-rg \
    --name mino-db-hrvoje \
    --location northeurope \
    --admin-user minoadmin \
    --admin-password '<PASSWORD>' \
    --sku-name Standard_B1ms \
    --tier Burstable \
    --storage-size 32 \
    --version 16 \
    --public-access <MY_IP> \
    --yes
  ```
  Server `mino-db-hrvoje` is up in `mino-rg`, firewall rule added for the local IP. Visible in the Portal under **Resource groups → mino-rg**, or by searching the server name directly.
- [ ] Create the `mino` database inside the server (note: the flag is `--name`, not `--database-name` — the help text initially suggested `--database-name` but the CLI rejected it with "the following arguments are required: --name/-n"):
  ```bash
  az postgres flexible-server db create \
    --resource-group mino-rg \
    --server-name mino-db-hrvoje \
    --name mino
  ```
- [x] Ran existing Prisma migrations against it once, from `apps/api`:
  ```bash
  cd apps/api
  DATABASE_URL='postgresql://minoadmin:<PASSWORD>@mino-db-hrvoje.postgres.database.azure.com:5432/mino?sslmode=require' npx prisma migrate deploy
  ```
  (Connection string needs `?sslmode=require` — Azure Postgres Flexible Server requires SSL.) All 12 existing migrations applied successfully, including `add_user_auth`. Database schema is now fully in place.

## Step 3 — Package the three backend pieces
**Status:** done

- [x] `apps/api/Dockerfile` — multi-stage Node build. Build context must be the **repo root** (needs sibling `packages/shared-types`, npm workspaces):
  ```bash
  docker build -f apps/api/Dockerfile -t mino-api .
  ```
  Runs `npm ci`, builds `@mino/shared-types`, runs `prisma generate`, runs `nest build`, then a slim production stage with `--omit=dev` deps + a fresh `prisma generate` (needs its own copy since it's a separate `npm ci`). Needed an explicit `apt-get install openssl` in both stages — Prisma's query engine can't detect libssl on `node:20-slim` without it and silently defaults to the wrong engine otherwise. Listens on `$PORT` (default 3000).
- [x] `services/ml/Dockerfile` — Python + `uv`, build context is `services/ml/`:
  ```bash
  docker build -t mino-ml services/ml
  ```
  `uv sync --frozen --no-dev` installs from the existing `uv.lock`. Added `gunicorn` as a real dependency (`pyproject.toml` + re-locked) since Flask's own dev server isn't meant for production — served as `gunicorn --bind 0.0.0.0:5001 mino_ml.app:app`.
- [x] `services/llm-explain/Dockerfile` — packages **only `mino_llm/dev_stub.py`** (the local canned-response stand-in — see `decisions/0007-llm-hosting-and-guardrail.md`), not the real vLLM-backed `app.py`, which stays on Modal. The stub is stdlib-only, so the image needs no dependency install at all:
  ```bash
  docker build -t mino-llm-explain services/llm-explain
  ```
- [x] Root `.dockerignore` added (excludes `node_modules`, `apps/mobile`, `.env*`, etc. from the `apps/api` build context).
- [x] All three images built and smoke-tested locally by Claude (`docker run` + `curl /health` / boot-log inspection) — `mino-ml` and `mino-llm-explain` respond on `/health`; `mino-api` boots, registers every route, and correctly reaches Prisma's connection layer (verified it fails with a clean "can't reach database server" against a fake host, and boots the same way against the real Azure hostname — not tested with the real password, since that wasn't necessary to verify the image itself). Test images removed after (`docker rmi`) — this was a one-off local build/run to verify the Dockerfiles, not something left running.

## Step 4 — Upload the images
**Status:** not started

Build and push the three images to GHCR (GitHub's container registry) — reuses the existing repo from Step 1.

## Step 5 — Run the containers
**Status:** not started

One Azure Container Apps environment, all three images deployed inside it. Only `apps/api` gets a public ingress address; `services/ml` and `services/llm-explain` stay internal-only.

## Step 6 — Web frontend
**Status:** not started

`apps/mobile` exported as a static web build, hosted on Azure Static Web Apps (free tier), pointed at the live `apps/api` URL from Step 5.

## Step 7 — Test it
**Status:** not started

Open the Static Web Apps URL in a browser, run through the app for real, confirm data lands in the Azure Postgres database from Step 2.
