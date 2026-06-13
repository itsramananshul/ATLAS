<p align="center">
    <img src="web/src/assets/icons/icon.svg" height="120" alt="ATLAS">
</p>

<h1 align="center">ATLAS</h1>

<p align="center"><strong>A</strong>ria <strong>T</strong>rust &amp; <strong>L</strong>ogin <strong>A</strong>uthentication <strong>S</strong>tandard</p>

<p align="center">
    A self-hosted single sign-on &amp; identity provider — one login in front of all your services.
</p>

---

## What is ATLAS?

ATLAS is a self-hosted **Identity Provider (IdP)** for modern single sign-on. It
speaks **OAuth2/OIDC, SAML, LDAP, RADIUS, SCIM** and forward-auth, runs entirely
on your own infrastructure (home lab → VPS), and is themed end-to-end for the
ARIA aesthetic — there's no third-party branding anywhere a user sees.

It also ships an **MCP server** so AI assistants (like Claude) can manage the
identity system — create applications, OAuth providers and users, read the audit
log — with per-client permission scoping and an in-app management tab.

## Features

- **Protocols:** OAuth2 / OIDC, SAML 2.0, LDAP, RADIUS, SCIM, proxy / forward-auth
- **Auth:** flows, policies, MFA (TOTP/WebAuthn), brands, federation & social login
- **ARIA theme** across the login, admin, and user dashboards (Apple-style dark)
- **ARIA OIDC login** integrated out of the box
- **MCP server** + an **MCP admin tab** to see, create, scope and revoke AI-client
  access, and audit what they did
- **Deploy anywhere:** prebuilt images on GHCR + one-command Coolify / Docker
  Compose deploy

## Run it

### Coolify (recommended)

New Resource → Docker Compose → use **`docker-compose.coolify.yml`**. Coolify
provides the domains + TLS automatically. Full walkthrough in **[DEPLOY.md](DEPLOY.md)**.

### Docker Compose

```bash
git clone https://github.com/itsramananshul/ATLAS.git && cd ATLAS
cp .env.atlas.example .env.atlas      # set PG_PASS, AUTHENTIK_SECRET_KEY, MCP token/url
docker compose --env-file .env.atlas -f docker-compose.prod.yml pull
docker compose --env-file .env.atlas -f docker-compose.prod.yml up -d
```

Prebuilt images:
`ghcr.io/itsramananshul/atlas-server` and `ghcr.io/itsramananshul/atlas-mcp`.
First-run admin + TLS + the MCP token are covered in **[DEPLOY.md](DEPLOY.md)**.

### Build from source

The server image is built from `lifecycle/container/Dockerfile`; the web UI lives
in `web/` (TypeScript + Lit). To build locally:

```bash
docker build -f lifecycle/container/Dockerfile -t atlas/server:dev \
  --build-arg VERSION=dev --build-arg GIT_BUILD_HASH=$(git rev-parse --short HEAD) .
docker compose --env-file .env.atlas -f docker-compose.atlas.yml up -d
```

## MCP server

A streamable-HTTP / stdio MCP server (`mcp-server/`) exposes ATLAS to Claude:
manage users, groups, applications and OAuth2/OIDC providers, read the audit log,
or call any endpoint. Full admin by default; scope it with
`ATLAS_MCP_READONLY` / `ATLAS_MCP_ALLOW` / `ATLAS_MCP_DENY`, or limit the token's
role. See **[mcp-server/README.md](mcp-server/README.md)**.

## Built on

ATLAS is built on the open-source [authentik](https://goauthentik.io) engine,
restyled and extended for ARIA. Upstream security fixes are cherry-picked as
needed. Licenses: [MIT](LICENSE) (core), [CC BY-SA 4.0](website/LICENSE) (docs),
and the [Enterprise license](authentik/enterprise/LICENSE) for `enterprise/`.
