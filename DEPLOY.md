# Deploying ATLAS

ATLAS ships as two prebuilt images you can run on any Docker host:

- `ghcr.io/itsramananshul/atlas-server` — the identity server (authentik fork, runs `server` and `worker`)
- `ghcr.io/itsramananshul/atlas-mcp` — the MCP server for Claude

`docker-compose.prod.yml` pulls these + Postgres + Redis. No building on the VPS.

## Option A — Coolify (recommended; e.g. Hostinger VPS)

Coolify deploys the compose stack and gives you domains + TLS automatically.

1. Publish the images to GHCR (see "Publish the images" below) — once.
2. Coolify → **New Resource → Docker Compose (Empty)** → paste
   `docker-compose.coolify.yml` (or connect this repo and pick that file).
3. If the GHCR packages are **private**, add the registry creds in Coolify
   (Keys & Tokens → add a Docker registry: `ghcr.io`, user `itsramananshul`,
   a PAT with `read:packages`) — or make the packages public.
4. **Environment Variables** (Coolify UI): set `PG_PASS`,
   `AUTHENTIK_SECRET_KEY` (`openssl rand -base64 60`), `ATLAS_VERSION`,
   `MCP_AUTHENTIK_TOKEN`, and `MCP_AUTHENTIK_URL=https://<your auth domain>`.
5. **Domains**: Coolify shows `SERVICE_FQDN_SERVER_9000` (the ATLAS UI) and
   `SERVICE_FQDN_MCP_9100` (the MCP, path `/mcp`) — set them to your domains;
   Coolify provisions Let's Encrypt TLS and proxies to the containers.
6. **Deploy.** Then bootstrap the admin (Coolify → the `server` container →
   Terminal/Exec): `ak create_recovery_key 10 akadmin` → open the printed link.
   Mint the MCP token there too (the `ak shell` snippet below), put it in
   `MCP_AUTHENTIK_TOKEN`, and redeploy.

Notes: no host ports are published — Coolify's proxy handles ingress.
`MCP_AUTHENTIK_URL` must be your **public** auth domain so OIDC endpoints are
correct. The MCP endpoint carries an admin token — keep it scoped
(`ATLAS_MCP_*`) and/or add Basic Auth in Coolify's proxy settings. Once ATLAS
has its public domain, point ARIA's `ATLAS_ISSUER`/`ATLAS_REDIRECT_URI` at it.

## Option B — plain Docker Compose (manual)

### 1. Publish the images (once, from your build machine)

The images are built locally as `atlas/server:<ver>` (see project README) and
tagged for GHCR. To push, your GitHub token needs the **`write:packages`** scope:

```bash
# grant the scope (interactive, one-time)
gh auth refresh -h github.com -s write:packages,read:packages
# log Docker into GHCR with the gh token
gh auth token | docker login ghcr.io -u itsramananshul --password-stdin

VER=2026.8.0-rc1
docker push ghcr.io/itsramananshul/atlas-server:$VER
docker push ghcr.io/itsramananshul/atlas-server:latest
docker push ghcr.io/itsramananshul/atlas-mcp:$VER
docker push ghcr.io/itsramananshul/atlas-mcp:latest
```

Make the packages public (so the VPS can pull without auth), or `docker login`
on the VPS too: GitHub → your profile → Packages → each package → Package
settings → Change visibility / link to the ATLAS repo.

> Prefer Docker Hub? Retag `docker tag atlas/server:$VER <user>/atlas-server:$VER`,
> `docker login`, push, and change the `image:` lines in `docker-compose.prod.yml`.

## 2. On the VPS

```bash
# install Docker + compose plugin first
git clone https://github.com/itsramananshul/ATLAS.git && cd ATLAS
cp .env.atlas.example .env.atlas        # then edit: set PG_PASS, AUTHENTIK_SECRET_KEY,
                                        # MCP_AUTHENTIK_TOKEN, MCP_AUTHENTIK_URL
docker compose --env-file .env.atlas -f docker-compose.prod.yml pull
docker compose --env-file .env.atlas -f docker-compose.prod.yml up -d
```

First-run admin: set the `akadmin` password via a recovery link

```bash
docker compose --env-file .env.atlas -f docker-compose.prod.yml exec server \
  ak create_recovery_key 10 akadmin       # prints a /recovery/use-token/... link (10 min)
```

Create the MCP token on the VPS (if you didn't carry one over):

```bash
docker compose --env-file .env.atlas -f docker-compose.prod.yml exec server ak shell -c "
from authentik.core.models import User, Token, TokenIntents, UserTypes, Group
sa,_=User.objects.get_or_create(username='claude-mcp', defaults={'name':'Claude MCP','type':UserTypes.SERVICE_ACCOUNT})
sa.type=UserTypes.SERVICE_ACCOUNT; sa.is_active=True; sa.save()
g=Group.objects.filter(is_superuser=True).first()
if g: sa.ak_groups.add(g)
Token.objects.filter(identifier='claude-mcp-token').delete()
print(Token.objects.create(identifier='claude-mcp-token', user=sa, intent=TokenIntents.INTENT_API, expiring=False).key)"
```

Put that value in `.env.atlas` as `MCP_AUTHENTIK_TOKEN` and `up -d` again.

## 3. TLS + domains (reverse proxy)

Keep `:9000` and `:9100` bound to localhost and terminate TLS at a proxy. Caddy:

```caddyfile
auth.example.com {
    reverse_proxy 127.0.0.1:9000
}
mcp.example.com {
    reverse_proxy 127.0.0.1:9100      # MCP endpoint is /mcp — add auth!
}
```

Set `.env.atlas`: `ATLAS_HTTP_BIND=127.0.0.1:9000`, `MCP_BIND=127.0.0.1:9100`,
and `MCP_AUTHENTIK_URL=https://auth.example.com` (so the MCP returns correct
OIDC endpoints). The MCP holds an admin token — never expose `:9100` without
auth + TLS, and prefer a scoped token (see mcp-server/README.md → Permissions).

## 4. Updating

Rebuild + push a new tag from your build machine, then on the VPS:

```bash
docker compose --env-file .env.atlas -f docker-compose.prod.yml pull
docker compose --env-file .env.atlas -f docker-compose.prod.yml up -d
```

Postgres/Redis data lives in named volumes and survives updates.

## Architecture note

Images are built `linux/amd64` (most VPS). For ARM hosts, rebuild with
`docker buildx build --platform linux/arm64` (or `linux/amd64,linux/arm64` for
a multi-arch manifest) and push.
