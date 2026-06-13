# Security Policy

ATLAS takes security seriously. Please follow [responsible disclosure](https://en.wikipedia.org/wiki/Responsible_disclosure)
and do not report vulnerabilities publicly, so issues can be patched before
they're widely known.

## Reporting a vulnerability

Report privately via a GitHub Security Advisory:
[github.com/itsramananshul/ATLAS/security/advisories/new](https://github.com/itsramananshul/ATLAS/security/advisories/new).

Please include:

- **Affected version(s)** and deployment details.
- **Steps to reproduce** / proof of concept.
- **Impact** — how it could be exploited and the effect.
- Any logs, relevant configuration, or suggested mitigations.

Please don't disclose publicly until the issue is confirmed and fixed.

## Severity

Severity is assessed with the [NVD CVSS v3 calculator](https://nvd.nist.gov/vuln-metrics/cvss/v3-calculator):

| Score      | Severity |
| ---------- | -------- |
| 0.0        | None     |
| 0.1 – 3.9  | Low      |
| 4.0 – 6.9  | Medium   |
| 7.0 – 8.9  | High     |
| 9.0 – 10.0 | Critical |

## Intended functionality (not vulnerabilities)

ATLAS is built on the authentik engine and inherits these intentional, by-design
behaviors — please do **not** report them as vulnerabilities:

- **Expressions** (property mappings / policies / prompts) execute arbitrary
  Python. Any user permitted to create/modify these can run code. A privilege
  escalation that lets an *unauthorized* user do so **is** a valid report.
- **Blueprints** can read the filesystem and modify objects by design; importing
  untrusted blueprints is the operator's responsibility.
- **Prompt HTML** is not escaped (prompts may contain scripts) — intentional for
  custom UI.
- **Open redirects** that expose no tokens/secrets are not treated as vulns.
- **Outgoing requests** (OAuth sources, providers, etc.) are not destination-
  filtered; restrict at the network level per your threat model.

## Upstream

Security fixes from upstream [authentik](https://goauthentik.io) are tracked and
cherry-picked into ATLAS as needed.
