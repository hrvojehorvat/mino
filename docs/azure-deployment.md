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
**Status:** done

- [x] Added packages scope to existing `gh` auth (default `gh auth login` scopes don't include it):
  ```bash
  gh auth refresh -h github.com -s write:packages,read:packages
  ```
- [x] Logged Docker into GHCR using that token:
  ```bash
  echo $(gh auth token) | docker login ghcr.io -u hrvojehorvat --password-stdin
  ```
- [x] Built and tagged all three images for GHCR (from repo root):
  ```bash
  docker build -f apps/api/Dockerfile -t ghcr.io/hrvojehorvat/mino-api:latest .
  docker build -t ghcr.io/hrvojehorvat/mino-ml:latest services/ml
  docker build -t ghcr.io/hrvojehorvat/mino-llm-explain:latest services/llm-explain
  ```
- [x] Pushed all three:
  ```bash
  docker push ghcr.io/hrvojehorvat/mino-api:latest
  docker push ghcr.io/hrvojehorvat/mino-ml:latest
  docker push ghcr.io/hrvojehorvat/mino-llm-explain:latest
  ```
  All private packages, visible at `https://github.com/hrvojehorvat?tab=packages`.

## Step 5 — Run the containers
**Status:** done

- [x] Container Apps CLI extension + resource provider registration:
  ```bash
  az extension add --name containerapp --upgrade
  az provider register --namespace Microsoft.App
  az provider register --namespace Microsoft.OperationalInsights
  ```
- [x] Container Apps environment (shared internal network for all three containers):
  ```bash
  az containerapp env create --name mino-env --resource-group mino-rg --location northeurope
  ```
- [x] `mino-ml` deployed, internal-only ingress (port 5001):
  ```bash
  az containerapp create \
    --name mino-ml --resource-group mino-rg --environment mino-env \
    --image ghcr.io/hrvojehorvat/mino-ml:latest \
    --registry-server ghcr.io --registry-username hrvojehorvat --registry-password $(gh auth token) \
    --ingress internal --target-port 5001 --min-replicas 1 --max-replicas 1
  ```
  Internal FQDN: `mino-ml.internal.politemoss-f6a702bb.northeurope.azurecontainerapps.io`
- [x] `mino-llm-explain` deployed the same way (port 5002):
  ```bash
  az containerapp create \
    --name mino-llm-explain --resource-group mino-rg --environment mino-env \
    --image ghcr.io/hrvojehorvat/mino-llm-explain:latest \
    --registry-server ghcr.io --registry-username hrvojehorvat --registry-password $(gh auth token) \
    --ingress internal --target-port 5002 --min-replicas 1 --max-replicas 1
  ```
  Internal FQDN: `mino-llm-explain.internal.politemoss-f6a702bb.northeurope.azurecontainerapps.io`
- [x] `mino-api` deployed with **external** ingress (public), wired to the database and both internal services:
  ```bash
  az containerapp create \
    --name mino-api --resource-group mino-rg --environment mino-env \
    --image ghcr.io/hrvojehorvat/mino-api:latest \
    --registry-server ghcr.io --registry-username hrvojehorvat --registry-password $(gh auth token) \
    --ingress external --target-port 3000 --min-replicas 1 --max-replicas 1 \
    --secrets db-url='postgresql://minoadmin:<DB_PASSWORD>@mino-db-hrvoje.postgres.database.azure.com:5432/mino?sslmode=require' jwt-secret='<JWT_SECRET>' \
    --env-vars \
      DATABASE_URL=secretref:db-url \
      JWT_SECRET=secretref:jwt-secret \
      ML_SERVICE_URL=https://mino-ml.internal.politemoss-f6a702bb.northeurope.azurecontainerapps.io \
      LLM_SERVICE_URL=https://mino-llm-explain.internal.politemoss-f6a702bb.northeurope.azurecontainerapps.io
  ```
  Public URL: `https://mino-api.politemoss-f6a702bb.northeurope.azurecontainerapps.io`. `JWT_SECRET` generated with `openssl rand -base64 32`. DB password/JWT secret stored as Container Apps secrets, not plaintext env vars.
- **Issue hit:** `mino-api` crash-looped on startup with `PrismaClientInitializationError: Can't reach database server` (`P1001`) — the Postgres firewall only allowed the one IP added in Step 2 (your own machine), not Azure's own network. Fixed with a second firewall rule (the CLI equivalent of the Portal's "Allow public access from any Azure service within Azure to this server" checkbox under the server's **Networking** blade):
  ```bash
  az postgres flexible-server firewall-rule create \
    --resource-group mino-rg \
    --server-name mino-db-hrvoje \
    --name AllowAzureServices \
    --start-ip-address 0.0.0.0 \
    --end-ip-address 0.0.0.0
  ```
  (First attempt used `--rule-name` instead of `--name`, and was missing `--server-name` — this subcommand's flags are `--server-name` for the server and `--name` for the rule itself, easy to mix up with the server-create command's own flag names.) After adding the rule, forced an immediate retry rather than waiting for the crash-loop backoff:
  ```bash
  az containerapp revision restart --name mino-api --resource-group mino-rg \
    --revision $(az containerapp revision list --name mino-api --resource-group mino-rg --query '[0].name' -o tsv)
  ```
- [x] Verified end-to-end against the live URL: signup wrote a real row to the Azure database, and the returned JWT was accepted by the protected `/batches` route (`200`).

## Step 6 — Web frontend
**Status:** done

Goal: `apps/mobile` exported as a static web build, hosted on Azure Static Web Apps (free tier), pointed at the live `mino-api` URL from Step 5.

- [x] Built the web export locally first, twice, to catch a real bug before handing off Azure commands: Expo inlines `EXPO_PUBLIC_*` vars into the JS bundle at build time (`apps/mobile/src/config.ts` reads `EXPO_PUBLIC_API_URL`). The first build picked up `apps/mobile/.env`'s dev value (`http://192.168.0.123:3000`) instead of the production URL; the second attempt set the right env var but Metro reused a cached bundle (same output hash) and kept the stale IP anyway. Fixed by adding `--clear`:
  ```bash
  cd apps/mobile
  EXPO_PUBLIC_API_URL=https://mino-api.politemoss-f6a702bb.northeurope.azurecontainerapps.io \
    npx expo export -p web --output-dir dist --clear
  ```
  Confirmed by grepping the built bundle for both strings (production URL present, dev IP absent) before proceeding. Output: `apps/mobile/dist/` (`index.html` + JS bundle + assets).
- [x] First attempt to create the Static Web App in `westeurope` failed the same way Step 2's Postgres server did — `RequestDisallowedByAzure`, region not accepting new customers. Static Web Apps only supports a small region set anyway (Central US, East US 2, West US 2, West Europe, East Asia — confirmed via `az provider show --namespace Microsoft.Web --query "resourceTypes[?resourceType=='staticSites'].locations"`), so switched to `eastus2`:
  ```bash
  az staticwebapp create \
    --name mino-web \
    --resource-group mino-rg \
    --location eastus2 \
    --sku Free
  ```
  Also needed a one-time provider registration first (same pattern as `Microsoft.DBforPostgreSQL` in Step 2):
  ```bash
  az provider register --namespace Microsoft.Web
  ```
  Note: the resource's creation region has no effect on serving latency — Static Web Apps serves from Azure's global CDN edge network regardless of which region the resource itself was created in.
- [x] Retrieved the deployment token (content is pushed to SWA, there's no registry-style pull auth like GHCR):
  ```bash
  az staticwebapp secrets list \
    --name mino-web \
    --resource-group mino-rg \
    --query "properties.apiKey" -o tsv
  ```
- [x] Deployed the built `dist/` folder to the production slot:
  ```bash
  npx -y @azure/static-web-apps-cli deploy apps/mobile/dist \
    --deployment-token <TOKEN> \
    --env production
  ```
- [x] Retrieved the live URL:
  ```bash
  az staticwebapp show \
    --name mino-web \
    --resource-group mino-rg \
    --query "defaultHostname" -o tsv
  ```
  Live at `https://green-dune-0665e610f.5.azurestaticapps.net` — verified by Claude with `curl` (`200`, correct `index.html` with `react-native-web`'s reset styles and `#root` mount point).

## Step 7 — Test it
**Status:** not started

Open the Static Web Apps URL in a browser, run through the app for real, confirm data lands in the Azure Postgres database from Step 2.
