import "#elements/buttons/SpinnerButton/ak-spinner-button";

import { aki } from "#common/api/client";

import { AKElement } from "#elements/Base";
import { showAPIErrorMessage } from "#elements/messages/MessageContainer";
import { SlottedTemplateResult } from "#elements/types";

import { CoreApi, EventsApi, type Token, type Event as AKEvent } from "@goauthentik/api";

import { msg } from "@lit/localize";
import { CSSResult, css, html, nothing } from "lit";
import { customElement, state } from "lit/decorators.js";

import PFBase from "@patternfly/patternfly/patternfly-base.css";
import PFButton from "@patternfly/patternfly/components/Button/button.css";
import PFCard from "@patternfly/patternfly/components/Card/card.css";
import PFContent from "@patternfly/patternfly/components/Content/content.css";
import PFForm from "@patternfly/patternfly/components/Form/form.css";
import PFFormControl from "@patternfly/patternfly/components/FormControl/form-control.css";
import PFPage from "@patternfly/patternfly/components/Page/page.css";
import PFTable from "@patternfly/patternfly/components/Table/table.css";

/**
 * Admin page to see and manage what is connected to ATLAS over MCP.
 *
 * "MCP access" = the authentik service-account API tokens that MCP clients
 * (e.g. Claude) authenticate with. From here you can see those tokens, copy or
 * revoke them, mint a new one, and review what those identities have been doing
 * (the audit log). MCP identities are matched by the "mcp" naming convention.
 */
@customElement("ak-mcp-access")
export class MCPAccessPage extends AKElement {
    static styles: CSSResult[] = [
        PFBase, PFPage, PFCard, PFContent, PFButton, PFTable, PFForm, PFFormControl,
        css`
            .pf-c-card { margin-bottom: 1.5rem; }
            code, .mono { font-family: var(--pf-global--FontFamily--monospace); }
            .connect { background: var(--pf-global--BackgroundColor--200); padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; }
            .muted { opacity: 0.7; }
            .token-key { font-family: var(--pf-global--FontFamily--monospace); word-break: break-all; }
            .new-form { display: flex; gap: 0.5rem; align-items: flex-end; flex-wrap: wrap; }
            .new-form label { display: block; font-size: 0.85rem; margin-bottom: 0.25rem; }
        `,
    ];

    @state() protected tokens: Token[] = [];
    @state() protected events: AKEvent[] = [];
    @state() protected loading = true;
    @state() protected newName = "";
    @state() protected fullAdmin = false;
    @state() protected createdKey: string | null = null;

    public firstUpdated(): void {
        this.load();
    }

    protected async load(): Promise<void> {
        this.loading = true;
        try {
            const core = aki(CoreApi);
            const events = aki(EventsApi);
            const tokenList = await core.coreTokensList({ search: "mcp", pageSize: 100 });
            this.tokens = tokenList.results;
            // Recent activity by MCP identities (matched by username convention).
            const recent = await events.eventsEventsList({ pageSize: 100, ordering: "-created" });
            this.events = recent.results
                .filter((e) => String((e.user as Record<string, unknown>)?.username ?? "").toLowerCase().includes("mcp"))
                .slice(0, 25);
        } catch (error) {
            showAPIErrorMessage(error);
        } finally {
            this.loading = false;
        }
    }

    #username(t: Token): string {
        const obj = t.userObj as { username?: string } | undefined;
        return obj?.username ?? (t.user != null ? `#${t.user}` : "—");
    }

    #revoke = async (identifier: string) => {
        if (!confirm(msg(`Revoke MCP token "${identifier}"? Any client using it loses access immediately.`))) return;
        try {
            await aki(CoreApi).coreTokensDestroy({ identifier });
            await this.load();
        } catch (error) {
            showAPIErrorMessage(error);
        }
    };

    #copyKey = async (identifier: string) => {
        try {
            const view = await aki(CoreApi).coreTokensViewKeyRetrieve({ identifier });
            if (view.key) {
                await navigator.clipboard.writeText(view.key);
                this.createdKey = null;
            }
        } catch (error) {
            showAPIErrorMessage(error);
        }
    };

    #create = async () => {
        const name = this.newName.trim();
        if (!name) return;
        const ident = name.toLowerCase().startsWith("mcp") ? name : `mcp-${name}`;
        try {
            const core = aki(CoreApi);
            const resp = await core.coreUsersServiceAccountCreate({
                userServiceAccountRequest: { name: ident, createGroup: false, expiring: false },
            });
            // Optionally grant full admin by adding it to a superuser group.
            const userPk = (resp as { userPk?: number }).userPk;
            if (this.fullAdmin && userPk != null) {
                const groups = await core.coreGroupsList({ isSuperuser: true, pageSize: 1 });
                const adminGroup = groups.results[0]?.pk;
                if (adminGroup) {
                    await core.coreUsersPartialUpdate({ id: userPk, patchedUserRequest: { groups: [adminGroup] } });
                }
            }
            this.createdKey = resp.token ?? null;
            this.newName = "";
            this.fullAdmin = false;
            await this.load();
        } catch (error) {
            showAPIErrorMessage(error);
        }
    };

    protected renderConnectCard(): SlottedTemplateResult {
        const host = window.location.hostname;
        const httpUrl = `https://${host}/mcp`;
        return html`<div class="pf-c-card">
            <div class="pf-c-card__title">${msg("MCP server")}</div>
            <div class="pf-c-card__body pf-c-content">
                <p>
                    ${msg(
                        "ATLAS exposes an MCP server so Claude (and other AI clients) can manage this identity system — users, applications, OAuth2/OIDC providers, and the audit log. Clients authenticate with one of the access tokens below.",
                    )}
                </p>
                <p class="muted">${msg("Hosted (streamable-HTTP), behind your reverse proxy:")}</p>
                <div class="connect mono">${httpUrl}</div>
                <p class="muted" style="margin-top:0.75rem">${msg("Local (stdio) for Claude Code:")}</p>
                <div class="connect mono">
                    claude mcp add atlas --env AUTHENTIK_URL=https://${host} --env
                    AUTHENTIK_TOKEN=&lt;token&gt; -- python server.py
                </div>
                <p class="muted" style="margin-top:0.75rem">
                    ${msg(
                        "Scope what a client can do with ATLAS_MCP_READONLY / ATLAS_MCP_ALLOW / ATLAS_MCP_DENY, or by limiting the token's role below.",
                    )}
                </p>
            </div>
        </div>`;
    }

    protected renderTokensCard(): SlottedTemplateResult {
        return html`<div class="pf-c-card">
            <div class="pf-c-card__title">${msg("MCP access tokens")}</div>
            <div class="pf-c-card__body">
                ${this.createdKey
                    ? html`<div class="connect" style="margin-bottom:1rem">
                          <strong>${msg("New token (copy it now — shown once):")}</strong>
                          <div class="token-key">${this.createdKey}</div>
                      </div>`
                    : nothing}
                <table class="pf-c-table pf-m-compact" role="grid">
                    <thead>
                        <tr role="row">
                            <th role="columnheader">${msg("Identifier")}</th>
                            <th role="columnheader">${msg("Service account")}</th>
                            <th role="columnheader">${msg("Expires")}</th>
                            <th role="columnheader">${msg("Actions")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.tokens.length === 0
                            ? html`<tr role="row">
                                  <td role="cell" colspan="4" class="muted">
                                      ${this.loading ? msg("Loading…") : msg("No MCP tokens yet.")}
                                  </td>
                              </tr>`
                            : this.tokens.map(
                                  (t) => html`<tr role="row">
                                      <td role="cell" class="mono">${t.identifier}</td>
                                      <td role="cell">${this.#username(t)}</td>
                                      <td role="cell" class="muted">
                                          ${t.expiring && t.expires ? t.expires.toLocaleString() : msg("Never")}
                                      </td>
                                      <td role="cell">
                                          <button class="pf-c-button pf-m-secondary pf-m-small" @click=${() => this.#copyKey(t.identifier)}>
                                              ${msg("Copy key")}
                                          </button>
                                          <button class="pf-c-button pf-m-danger pf-m-small" @click=${() => this.#revoke(t.identifier)}>
                                              ${msg("Revoke")}
                                          </button>
                                      </td>
                                  </tr>`,
                              )}
                    </tbody>
                </table>

                <div class="new-form" style="margin-top:1.5rem">
                    <div>
                        <label for="mcp-new">${msg("New MCP access (creates a service account + token)")}</label>
                        <input id="mcp-new" class="pf-c-form-control" placeholder="claude-laptop"
                            .value=${this.newName} @input=${(e: Event) => (this.newName = (e.target as HTMLInputElement).value)} />
                    </div>
                    <label style="display:flex;align-items:center;gap:0.4rem;margin-bottom:0.4rem">
                        <input type="checkbox" .checked=${this.fullAdmin}
                            @change=${(e: Event) => (this.fullAdmin = (e.target as HTMLInputElement).checked)} />
                        ${msg("Full admin")}
                    </label>
                    <button class="pf-c-button pf-m-primary" ?disabled=${!this.newName.trim()} @click=${this.#create}>
                        ${msg("Create")}
                    </button>
                </div>
                <p class="muted" style="margin-top:0.5rem;font-size:0.85rem">
                    ${msg("Without \"Full admin\", the new account has no permissions until you add it to a group (Directory → Users) — useful for least-privilege MCP clients.")}
                </p>
            </div>
        </div>`;
    }

    protected renderActivityCard(): SlottedTemplateResult {
        return html`<div class="pf-c-card">
            <div class="pf-c-card__title">${msg("Recent MCP activity")}</div>
            <div class="pf-c-card__body">
                <table class="pf-c-table pf-m-compact" role="grid">
                    <thead>
                        <tr role="row">
                            <th role="columnheader">${msg("When")}</th>
                            <th role="columnheader">${msg("Action")}</th>
                            <th role="columnheader">${msg("By")}</th>
                            <th role="columnheader">${msg("From")}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.events.length === 0
                            ? html`<tr role="row">
                                  <td role="cell" colspan="4" class="muted">
                                      ${this.loading ? msg("Loading…") : msg("No MCP activity recorded yet.")}
                                  </td>
                              </tr>`
                            : this.events.map((e) => {
                                  const user = (e.user as Record<string, unknown>) || {};
                                  return html`<tr role="row">
                                      <td role="cell" class="muted">${e.created?.toLocaleString() ?? "—"}</td>
                                      <td role="cell" class="mono">${e.action}</td>
                                      <td role="cell">${String(user.username ?? "—")}</td>
                                      <td role="cell" class="muted">${e.clientIp ?? "—"}</td>
                                  </tr>`;
                              })}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    protected render(): SlottedTemplateResult {
        return html`<section class="pf-c-page__main-section pf-m-light">
                <div class="pf-c-content">
                    <h1><i class="pf-icon pf-icon-plugged"></i>&nbsp;${msg("MCP")}</h1>
                    <p>${msg("Manage and audit AI clients connected to ATLAS over MCP.")}</p>
                </div>
            </section>
            <section class="pf-c-page__main-section pf-m-no-padding-mobile">
                ${this.renderConnectCard()} ${this.renderTokensCard()} ${this.renderActivityCard()}
            </section>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-mcp-access": MCPAccessPage;
    }
}
