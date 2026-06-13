"""
ATLAS MCP server
================

Exposes the ATLAS identity server (an authentik fork) to MCP clients
(Claude Code, Claude desktop/web) so Claude can manage it: read/create
users, groups, applications and OAuth2/OIDC providers, inspect the audit
log, and call any authentik REST endpoint.

The headline tool is `create_oauth2_application`, which onboards a new
service behind ATLAS in a single call — encoding the gotchas learned the
hard way (grant_types must be set explicitly, an RS256 signing key is
needed for JWKS verification, the right scope mappings + authorization /
invalidation flows).

Config (env):
    AUTHENTIK_URL    base URL, e.g. http://localhost:9000 or https://auth.example.com
    AUTHENTIK_TOKEN  an authentik API token (Bearer) with admin rights
    MCP_TRANSPORT    "stdio" (default) or "http" (streamable-HTTP, for hosting)
    MCP_HOST/MCP_PORT host/port when MCP_TRANSPORT=http (default 0.0.0.0:9100)
"""

import os
from typing import Any

import httpx
from mcp.server.fastmcp import FastMCP

AUTHENTIK_URL = os.environ.get("AUTHENTIK_URL", "http://localhost:9000").rstrip("/")
AUTHENTIK_TOKEN = os.environ.get("AUTHENTIK_TOKEN", "")
API = f"{AUTHENTIK_URL}/api/v3"

mcp = FastMCP(
    "ATLAS",
    host=os.environ.get("MCP_HOST", "0.0.0.0"),
    port=int(os.environ.get("MCP_PORT", "9100")),
)


# ── low-level HTTP ─────────────────────────────────────────────────────

def _req(method: str, path: str, *, json: Any = None, params: dict | None = None) -> Any:
    """Authenticated call to the authentik API. `path` is relative to /api/v3."""
    if not AUTHENTIK_TOKEN:
        return {"error": "AUTHENTIK_TOKEN is not set"}
    url = f"{API}/{path.lstrip('/')}"
    headers = {"Authorization": f"Bearer {AUTHENTIK_TOKEN}", "Accept": "application/json"}
    try:
        with httpx.Client(timeout=30) as c:
            r = c.request(method.upper(), url, json=json, params=params, headers=headers)
    except httpx.HTTPError as e:
        return {"error": f"request_failed: {e}"}
    if r.status_code == 204:
        return {"ok": True, "status": 204}
    try:
        data = r.json()
    except ValueError:
        data = {"raw": r.text[:500]}
    if not r.is_success:
        return {"error": f"http_{r.status_code}", "detail": data}
    return data


def _first(path: str, params: dict) -> dict | None:
    """Return the first result of a paginated list endpoint, or None."""
    data = _req("GET", path, params=params)
    results = (data or {}).get("results") if isinstance(data, dict) else None
    return results[0] if results else None


# ── diagnostics ────────────────────────────────────────────────────────

@mcp.tool()
def health() -> dict:
    """Check ATLAS is reachable and the API token works. Returns the authentik
    version and the identity of the token's user."""
    version = _req("GET", "admin/version/")
    me = _req("GET", "core/users/me/")
    return {"authentik_url": AUTHENTIK_URL, "version": version, "me": me.get("user", me) if isinstance(me, dict) else me}


# ── users ──────────────────────────────────────────────────────────────

@mcp.tool()
def list_users(search: str = "", page_size: int = 50) -> dict:
    """List users. Optional `search` matches username/name/email."""
    return _req("GET", "core/users/", params={"search": search, "page_size": page_size})


@mcp.tool()
def get_user(user_id: int) -> dict:
    """Get a single user by numeric id (pk)."""
    return _req("GET", f"core/users/{user_id}/")


@mcp.tool()
def create_user(username: str, name: str, email: str = "", is_active: bool = True, groups: list[str] | None = None) -> dict:
    """Create a user. `groups` is a list of group UUIDs (use list_groups to find them)."""
    body: dict[str, Any] = {"username": username, "name": name, "email": email, "is_active": is_active}
    if groups:
        body["groups"] = groups
    return _req("POST", "core/users/", json=body)


@mcp.tool()
def set_user_password(user_id: int, password: str) -> dict:
    """Set (reset) a user's password."""
    return _req("POST", f"core/users/{user_id}/set_password/", json={"password": password})


# ── groups ─────────────────────────────────────────────────────────────

@mcp.tool()
def list_groups(search: str = "", page_size: int = 100) -> dict:
    """List groups."""
    return _req("GET", "core/groups/", params={"search": search, "page_size": page_size})


@mcp.tool()
def create_group(name: str, is_superuser: bool = False) -> dict:
    """Create a group. Set is_superuser=true to grant its members admin rights."""
    return _req("POST", "core/groups/", json={"name": name, "is_superuser": is_superuser})


# ── applications & providers ───────────────────────────────────────────

@mcp.tool()
def list_applications(page_size: int = 100) -> dict:
    """List applications registered in ATLAS."""
    return _req("GET", "core/applications/", params={"page_size": page_size})


@mcp.tool()
def list_providers(page_size: int = 100) -> dict:
    """List all providers (OAuth2/OIDC, proxy, SAML, etc.)."""
    return _req("GET", "providers/all/", params={"page_size": page_size})


@mcp.tool()
def get_oauth2_provider(provider_id: int) -> dict:
    """Get an OAuth2/OIDC provider's full config (client_id, redirect_uris, grant_types, etc.)."""
    return _req("GET", f"providers/oauth2/{provider_id}/")


@mcp.tool()
def list_flows(page_size: int = 100) -> dict:
    """List authentication/authorization/invalidation flows (slug + designation)."""
    return _req("GET", "flows/instances/", params={"page_size": page_size})


@mcp.tool()
def list_events(action: str = "", page_size: int = 50) -> dict:
    """Read the audit log. Optional `action` filters (e.g. 'login', 'login_failed', 'authorize_application')."""
    params: dict[str, Any] = {"page_size": page_size, "ordering": "-created"}
    if action:
        params["action"] = action
    return _req("GET", "events/events/", params=params)


# ── the headline tool: onboard a service behind ATLAS in one call ──────

@mcp.tool()
def create_oauth2_application(
    name: str,
    slug: str,
    redirect_uris: list[str],
    logout_redirect_uris: list[str] | None = None,
    launch_url: str = "",
    client_type: str = "confidential",
    scopes: list[str] | None = None,
    consent: str = "implicit",
) -> dict:
    """Create an OAuth2/OIDC provider + application to put a new service behind
    ATLAS — in one call, with the correct defaults.

    Encodes the hard-won gotchas:
      - grant_types is set explicitly (authorization_code + refresh_token);
        authentik leaves it empty otherwise and authorize fails with
        'invalid_request'.
      - an RS256 signing key is attached so clients can verify id_tokens via JWKS.
      - the standard OIDC scope mappings are attached.

    Args:
      redirect_uris: allowed callback URLs (strict match), e.g.
        ["https://app.example.com/api/auth/callback"]
      logout_redirect_uris: optional post-logout URLs (strict).
      client_type: "confidential" (server keeps a secret) or "public" (SPA, PKCE only).
      scopes: scope names; default ["openid","email","profile","offline_access"].
      consent: "implicit" (no prompt) or "explicit" (show a consent screen).

    Returns the client_id, client_secret and the OIDC endpoints to wire into the app.
    """
    scopes = scopes or ["openid", "email", "profile", "offline_access"]

    # Resolve the authorization + invalidation flows.
    authz_slug = (
        "default-provider-authorization-implicit-consent"
        if consent == "implicit"
        else "default-provider-authorization-explicit-consent"
    )
    authz = _first("flows/instances/", {"slug": authz_slug})
    inval = _first("flows/instances/", {"slug": "default-invalidation-flow"})
    if not authz or not inval:
        return {"error": "could_not_resolve_flows", "authz": authz_slug, "found_authz": bool(authz), "found_inval": bool(inval)}

    # An RS256 signing key (so JWKS verification works downstream).
    cert = _first("crypto/certificatekeypairs/", {"search": "self-signed", "has_key": "true"})
    if not cert:
        cert = _first("crypto/certificatekeypairs/", {"has_key": "true"})
    signing_key = cert["pk"] if cert else None

    # The OIDC scope mappings (by scope_name).
    sm = _req("GET", "propertymappings/provider/scope/", params={"page_size": 100})
    wanted = {s: None for s in scopes}
    for m in (sm.get("results", []) if isinstance(sm, dict) else []):
        if m.get("scope_name") in wanted:
            wanted[m["scope_name"]] = m["pk"]
    scope_pks = [pk for pk in wanted.values() if pk]

    provider_body: dict[str, Any] = {
        "name": name,
        "authorization_flow": authz["pk"],
        "invalidation_flow": inval["pk"],
        "client_type": client_type,
        "grant_types": ["authorization_code", "refresh_token"],
        "redirect_uris": (
            [{"matching_mode": "strict", "url": u} for u in redirect_uris]
            + [{"matching_mode": "strict", "url": u, "redirect_uri_type": "logout"} for u in (logout_redirect_uris or [])]
        ),
        "property_mappings": scope_pks,
        "sub_mode": "hashed_user_id",
    }
    if signing_key:
        provider_body["signing_key"] = signing_key

    provider = _req("POST", "providers/oauth2/", json=provider_body)
    if isinstance(provider, dict) and provider.get("error"):
        return {"step": "create_provider", **provider}

    app_body = {"name": name, "slug": slug, "provider": provider["pk"], "meta_launch_url": launch_url}
    app = _req("POST", "core/applications/", json=app_body)
    if isinstance(app, dict) and app.get("error"):
        return {"step": "create_application", "provider_created": provider.get("pk"), **app}

    base = f"{AUTHENTIK_URL}/application/o/{slug}"
    return {
        "ok": True,
        "client_id": provider.get("client_id"),
        "client_secret": provider.get("client_secret"),
        "application_slug": slug,
        "signing_key_attached": bool(signing_key),
        "scopes": [s for s, pk in wanted.items() if pk],
        "endpoints": {
            "issuer": f"{base}/",
            "discovery": f"{base}/.well-known/openid-configuration",
            "authorization": f"{AUTHENTIK_URL}/application/o/authorize/",
            "token": f"{AUTHENTIK_URL}/application/o/token/",
            "userinfo": f"{AUTHENTIK_URL}/application/o/userinfo/",
            "jwks": f"{base}/jwks/",
            "end_session": f"{base}/end-session/",
        },
    }


# ── generic escape hatch ───────────────────────────────────────────────

@mcp.tool()
def authentik_api(method: str, path: str, body: dict | None = None, params: dict | None = None) -> dict:
    """Call ANY authentik REST endpoint under /api/v3 — the full admin API.
    method: GET/POST/PATCH/PUT/DELETE. path: e.g. 'core/users/', 'providers/oauth2/3/'.
    Use this for anything the dedicated tools don't cover."""
    return _req(method, path, json=body, params=params)


if __name__ == "__main__":
    transport = os.environ.get("MCP_TRANSPORT", "stdio")
    mcp.run(transport="streamable-http" if transport == "http" else "stdio")
