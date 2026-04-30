/**
 * StateStep — confirm the labor-law jurisdiction. Only California is currently
 * supported; other states are visible but disabled with "Coming soon".
 */
export function renderState(el, state, callbacks) {
    el.innerHTML = `
        <div class="wizard-card">
            <div class="wizard-card-eyebrow">Step 2 of 6</div>
            <h2 class="wizard-card-title">Which state are you scheduling for?</h2>
            <p class="wizard-card-subtitle">
                Break compliance rules vary by state. We'll apply the rules for the state you pick.
            </p>

            <div class="wizard-state-options">
                <button type="button" class="wizard-state-option is-selected" data-state="california">
                    <i class="fas fa-check-circle wizard-state-tick"></i>
                    <div class="wizard-state-body">
                        <div class="wizard-state-name">California</div>
                        <div class="wizard-state-desc">Currently supported</div>
                    </div>
                </button>
                <button type="button" class="wizard-state-option is-disabled" disabled>
                    <i class="far fa-clock wizard-state-tick"></i>
                    <div class="wizard-state-body">
                        <div class="wizard-state-name">Other states</div>
                        <div class="wizard-state-desc">Coming soon</div>
                    </div>
                </button>
            </div>

            <div class="wizard-law-preview">
                <div class="wizard-law-head">
                    <i class="fas fa-balance-scale"></i>
                    <h3>California labor law</h3>
                </div>

                <div class="wizard-law-rule">
                    <div class="wizard-law-rule-title"><i class="fas fa-coffee"></i> Rest periods</div>
                    <p>
                        At least one 10-minute paid break per 4 hours worked (or major fraction).
                        No break required for shifts ≤ 3.5 hours. Breaks should fall near the middle of each 4-hour segment.
                    </p>
                </div>

                <div class="wizard-law-rule">
                    <div class="wizard-law-rule-title"><i class="fas fa-utensils"></i> Meal periods</div>
                    <p>
                        A 30-minute meal break is required for shifts longer than 5 hours. Meals can be waived for shifts of 6 hours or less by mutual consent.
                    </p>
                </div>

                <a class="wizard-law-link" href="https://www.dir.ca.gov/dlse/RestAndMealPeriods.pdf" target="_blank" rel="noopener">
                    Read the official CA DLSE summary
                    <i class="fas fa-external-link-alt"></i>
                </a>
            </div>

            <div class="wizard-nav">
                <button type="button" class="wizard-btn wizard-btn-ghost" data-action="back">
                    ${state.editMode ? 'Cancel' : '<i class="fas fa-arrow-left"></i> Back'}
                </button>
                <button type="button" class="wizard-btn wizard-btn-primary" data-action="continue">
                    ${state.editMode ? 'Save <i class="fas fa-check"></i>' : 'Next <i class="fas fa-arrow-right"></i>'}
                </button>
            </div>
        </div>
    `;

    el.querySelector('[data-action="back"]')?.addEventListener('click', callbacks.onBack);
    el.querySelector('[data-action="continue"]')?.addEventListener('click', callbacks.onContinue);
}
