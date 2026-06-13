import { aki } from "#common/api/client";
import { EVENT_REFRESH } from "#common/constants";

import { AKElement } from "#elements/Base";
import { showAPIErrorMessage } from "#elements/messages/MessageContainer";
import { WithSession } from "#elements/mixins/session";
import { SlottedTemplateResult } from "#elements/types";

import { CoreApi } from "@goauthentik/api";

import { msg } from "@lit/localize";
import { CSSResult, html } from "lit";
import { customElement, state } from "lit/decorators.js";

import PFButton from "@patternfly/patternfly/components/Button/button.css";
import PFCard from "@patternfly/patternfly/components/Card/card.css";
import PFForm from "@patternfly/patternfly/components/Form/form.css";
import PFFormControl from "@patternfly/patternfly/components/FormControl/form-control.css";

/** Max size for an uploaded avatar — stored as a data URI in the user's
 * attributes, so keep it small. */
const MAX_AVATAR_BYTES = 1024 * 1024; // 1 MB

/**
 * Lets a user change their profile picture by uploading an image, which is
 * stored as a data URI in `attributes.avatar`. Requires the brand's avatar
 * mode to include `attributes.avatar`.
 */
@customElement("ak-user-settings-avatar")
export class UserAvatarSettings extends WithSession(AKElement) {
    static styles: CSSResult[] = [PFCard, PFButton, PFForm, PFFormControl];

    protected coreAPI = aki(CoreApi);

    @state()
    protected preview: string | null = null;

    @state()
    protected saving = false;

    #onFile = (event: Event) => {
        const input = event.target as HTMLInputElement;
        const file = input.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
            showAPIErrorMessage(msg("Please choose an image file."));
            return;
        }
        if (file.size > MAX_AVATAR_BYTES) {
            showAPIErrorMessage(msg("Image is too large. Please choose a file under 1 MB."));
            return;
        }
        const reader = new FileReader();
        reader.onload = () => {
            this.preview = reader.result as string;
        };
        reader.readAsDataURL(file);
    };

    async #patchAttributes(mutate: (attrs: Record<string, unknown>) => void): Promise<void> {
        const user = this.currentUser;
        if (!user) return;
        this.saving = true;
        try {
            // Fetch the full record so we merge rather than overwrite attributes.
            const full = await this.coreAPI.coreUsersRetrieve({ id: user.pk });
            const attributes = { ...(full.attributes || {}) } as Record<string, unknown>;
            mutate(attributes);
            await this.coreAPI.coreUsersPartialUpdate({
                id: user.pk,
                patchedUserRequest: { attributes },
            });
            this.preview = null;
            this.dispatchEvent(
                new CustomEvent(EVENT_REFRESH, { bubbles: true, composed: true }),
            );
        } catch (error) {
            showAPIErrorMessage(error);
        } finally {
            this.saving = false;
        }
    }

    #save = () => {
        if (!this.preview) return;
        return this.#patchAttributes((attrs) => {
            attrs.avatar = this.preview;
        });
    };

    #remove = () => {
        return this.#patchAttributes((attrs) => {
            delete attrs.avatar;
        });
    };

    protected override render(): SlottedTemplateResult {
        const current = this.preview || this.currentUser?.avatar;
        return html`<div class="pf-c-card">
            <div class="pf-c-card__title">${msg("Profile picture")}</div>
            <div class="pf-c-card__body">
                <div style="display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;">
                    <img
                        src=${current ?? ""}
                        alt=${msg("Current profile picture")}
                        style="width:96px;height:96px;border-radius:50%;object-fit:cover;border:1px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.04);"
                    />
                    <div>
                        <input
                            type="file"
                            accept="image/*"
                            class="pf-c-form-control"
                            ?disabled=${this.saving}
                            @change=${this.#onFile}
                        />
                        <p style="opacity:0.7;font-size:0.85rem;margin-top:0.5rem;">
                            ${msg("PNG, JPG or GIF, up to 1 MB.")}
                        </p>
                    </div>
                </div>
            </div>
            <div class="pf-c-card__footer" style="display:flex;gap:0.5rem;">
                <button
                    class="pf-c-button pf-m-primary"
                    ?disabled=${!this.preview || this.saving}
                    @click=${this.#save}
                >
                    ${msg("Save picture")}
                </button>
                <button
                    class="pf-c-button pf-m-secondary"
                    ?disabled=${this.saving}
                    @click=${this.#remove}
                >
                    ${msg("Remove")}
                </button>
            </div>
        </div>`;
    }
}

declare global {
    interface HTMLElementTagNameMap {
        "ak-user-settings-avatar": UserAvatarSettings;
    }
}
