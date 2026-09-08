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

## Pausing / resuming (cost control)

Everything in this deployment bills continuously by default: the Postgres server runs 24/7 regardless of use, and all three Container Apps were created with `--min-replicas 1` (always at least one instance up). Use these when not actively using/testing the app, instead of deleting anything.

**Pause everything except the web frontend** (Postgres stopped, all three backend containers scaled to zero — nothing to redeploy, just restart/rescale when resuming):
```bash
az postgres flexible-server stop --name mino-db-hrvoje --resource-group mino-rg && \
az containerapp update --name mino-api --resource-group mino-rg --min-replicas 0 --max-replicas 1 && \
az containerapp update --name mino-ml --resource-group mino-rg --min-replicas 0 --max-replicas 1 && \
az containerapp update --name mino-llm-explain --resource-group mino-rg --min-replicas 0 --max-replicas 1
```

**Pause everything, web included** (same as above, plus deletes the Static Web App — note this one is *not* symmetric with the resume below: Static Web Apps has no stop/start, so bringing `mino-web` back means re-running Step 6's create/secrets/deploy commands again, not just a rescale. Its Free tier costs $0 either way, so this only matters if you want it not publicly reachable, not for cost):
```bash
az postgres flexible-server stop --name mino-db-hrvoje --resource-group mino-rg && \
az containerapp update --name mino-api --resource-group mino-rg --min-replicas 0 --max-replicas 1 && \
az containerapp update --name mino-ml --resource-group mino-rg --min-replicas 0 --max-replicas 1 && \
az containerapp update --name mino-llm-explain --resource-group mino-rg --min-replicas 0 --max-replicas 1 && \
az staticwebapp delete --name mino-web --resource-group mino-rg --yes
```

**Resume** (Postgres + all three containers back to a normal always-on state; note Azure also auto-restarts a stopped Postgres server on its own after 7 days regardless of this command):
```bash
az postgres flexible-server start --name mino-db-hrvoje --resource-group mino-rg && \
az containerapp update --name mino-api --resource-group mino-rg --min-replicas 1 --max-replicas 1 && \
az containerapp update --name mino-ml --resource-group mino-rg --min-replicas 1 --max-replicas 1 && \
az containerapp update --name mino-llm-explain --resource-group mino-rg --min-replicas 1 --max-replicas 1
```
If `mino-web` was deleted, re-run Step 6's create/secrets/deploy/show sequence to bring it back (the local `apps/mobile/dist/` build doesn't need to be rebuilt unless the API URL or app code changed).

**Note on `flexible-server stop`:** Azure hard-codes a 7-day auto-restart on a stopped Postgres Flexible Server — there's no flag to disable it, so a `stop` left alone longer than a week will silently start billing again on its own. Fine for short pauses (just re-run `stop` every ~6 days to reset the clock); for anything longer, delete the server entirely instead — see below.

### Long pause: back up and delete the database entirely

For a pause longer than a week, this is the only way to guarantee zero cost with no surprise restart — no server at all means no storage or compute billing.

**Back up, then delete:**
```bash
pg_dump 'postgresql://minoadmin:<PASSWORD>@mino-db-hrvoje.postgres.database.azure.com:5432/mino?sslmode=require' -f mino-backup.sql
az postgres flexible-server delete --name mino-db-hrvoje --resource-group mino-rg --yes
```
`pg_dump` writes every table's data and schema to a local file — keep `mino-backup.sql` somewhere safe (it's not tracked in git; it contains real user data once there's any). The `delete` is permanent: the server, all its data, and its firewall rules are gone for good, which is exactly the point here — this trades convenience for guaranteed zero billing.

**Recreate and restore later** (same server-creation commands as Step 2, then load the backup back in):
```bash
az postgres flexible-server create \
  --resource-group mino-rg \
  --name mino-db-hrvoje \
  --location northeurope \
  --admin-user minoadmin \
  --admin-password '<NEW_PASSWORD>' \
  --sku-name Standard_B1ms \
  --tier Burstable \
  --storage-size 32 \
  --version 16 \
  --public-access <MY_IP> \
  --yes

az postgres flexible-server firewall-rule create \
  --resource-group mino-rg \
  --server-name mino-db-hrvoje \
  --name AllowAzureServices \
  --start-ip-address 0.0.0.0 \
  --end-ip-address 0.0.0.0

psql 'postgresql://minoadmin:<NEW_PASSWORD>@mino-db-hrvoje.postgres.database.azure.com:5432/mino?sslmode=require' -f mino-backup.sql
```
The two firewall rules (your own IP + `AllowAzureServices`) need re-adding since they belonged to the deleted server, not the resource group. If `mino-api` is still running (or resumed) with the old `DATABASE_URL` secret pointing at this same server name, no redeploy is needed — the hostname is identical once the new server exists again; only the password changes if you pick a new one, which means updating the `db-url` secret on `mino-api`:
```bash
az containerapp secret set --name mino-api --resource-group mino-rg --secrets db-url='postgresql://minoadmin:<NEW_PASSWORD>@mino-db-hrvoje.postgres.database.azure.com:5432/mino?sslmode=require'
```

### Full teardown: delete everything

Deletes the whole `mino-rg` resource group in one shot — the Postgres server (and all its data), the Container Apps environment and all three containers, and the Static Web App. **Irreversible** — this is not a pause, there is nothing left to resume; rebuilding means redoing Steps 2-6 from scratch (the GHCR images from Step 4 survive, since they live on GitHub, not in this resource group, so at least the container images don't need rebuilding):

```bash
az group delete --name mino-rg --yes --no-wait
```

`--no-wait` returns immediately instead of blocking the terminal for the several minutes the actual deletion takes. Check progress:
```bash
az group exists --name mino-rg
```
Returns `true` while deleting, `false` once fully gone. **Portal:** the resource groups list shows `mino-rg` with a "Deleting" status banner, then it disappears entirely.

## Step 7 — Test it
**Status:** not started

Open the Static Web Apps URL in a browser, run through the app for real, confirm data lands in the Azure Postgres database from Step 2.
