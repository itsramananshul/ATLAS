import type { WizardStepState } from "./shared.js";

import { createContext } from "@lit/context";

export const wizardStepContext = createContext<WizardStepState>(
    Symbol("ARIA-wizard-step-labels"),
);
