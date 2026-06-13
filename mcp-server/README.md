# ATLAS MCP server

Lets **Claude** manage your ATLAS identity server (the authentik fork) over
[MCP](https://modelcontextprotocol.io): read/create users, groups,
applications and OAuth2/OIDC providers, read the audit log, and call any
authentik REST endpoint.

The headline tool is **`create_oauth2_application`** — it puts a new service
behind ATLAS in a single call, with the correct defaults baked in
(`grant_types` set, an RS256 signing key attached for JWKS verification, the
standard OIDC scope mappings, the right authorization/invalidation flows).

## Tools

| Tool | What it does |
|------|--------------|
| `health` | Check ATLAS is reachable + the token works |
| `list_users` / `get_user` / `create_user` / `set_user_password` | Manage users |
| `list_groups` / `create_group` | Manage groups (incl. superuser) |
| `list_applications` / `list_providers` / `get_oauth2_provider` | Inspect apps & providers |
| `create_oauth2_application` | **Onboard a new OIDC service in one call** |
| `list_flows` | List auth/authz/invalidation flows |
| `list_events` | Read the audit log |
| `authentik_api` | Escape hatch — call any `/api/v3` endpoint |

## Configure

Needs an authentik **API token** with admin rights. A `claude-mcp` service
account + token is created in this project; or create one in ATLAS
(Directory → Tokens) / via `ak shell`.

```bash
cp .env.example .env   # then fill in AUTHENTIK_URL + AUTHENTIK_TOKEN
```

## Run

### Local (stdio) — for Claude Code

```bash
python -m venv .venv && ./.venv/bin/pip install -r requirements.txt
claude mcp add atlas --env AUTHENTIK_URL=http://localhost:9000 \
  --env AUTHENTIK_TOKEN=<token> -- ./.venv/bin/python /abs/path/to/server.py
```

### Hosted (streamable-HTTP) — for remote Claude / the VPS

Runs as part of the ATLAS compose stack:

```bash
# in .env.atlas:
#   MCP_AUTHENTIK_TOKEN=<token>
#   MCP_AUTHENTIK_URL=https://auth.your-domain.com   # public URL (used in returned endpoints)
docker compose --env-file .env.atlas -f docker-compose.atlas.yml up -d --build mcp
```

The server listens on `:9100` (streamable-HTTP). **Put it behind your reverse
proxy with TLS and access control** before exposing it — the token grants full
admin over your identity server. Add it to Claude as a remote MCP server at
`https://<host>/mcp` (or the path your proxy maps to `:9100`).

## Security

The MCP token is a full-admin authentik API token. Treat it like a root
credential: keep `.env`/`.env.atlas` out of git (they are gitignored), don't
expose `:9100` without auth + TLS, and rotate the token if it leaks
(Directory → Tokens in ATLAS).
