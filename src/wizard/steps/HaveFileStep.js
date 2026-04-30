/**
 * HaveFileStep — asks whether the user already has the UKG export.
 * If yes → upload step. If no → export-help tutorial.
 */
export function renderHaveFile(el, state, callbacks) {
    el.innerHTML = `
        <div class="wizard-card">
            <div class="wizard-card-eyebrow">Get started</div>
            <h2 class="wizard-card-title">Do you have the schedule export?</h2>
            <p class="wizard-card-subtitle">
                We need the <strong>Custom Daily Schedule</strong> .xlsx file from the UKG Retail Schedule Planner.
            </p>

            <div class="wizard-choice-grid">
                <button type="button" class="wizard-choice" data-action="have-it">
                    <i class="fas fa-file-excel" aria-hidden="true"></i>
                    <span class="wizard-choice-title">I have the .xlsx file</span>
                    <span class="wizard-choice-sub">Upload it on the next screen</span>
                </button>
                <button type="button" class="wizard-choice" data-action="need-help">
                    <i class="fas fa-question-circle" aria-hidden="true"></i>
                    <span class="wizard-choice-title">I don't have it yet</span>
                    <span class="wizard-choice-sub">Walk me through exporting from UKG</span>
                </button>
            </div>

            <div class="wizard-nav">
                <button type="button" class="wizard-btn wizard-btn-ghost" data-action="back">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
            </div>
        </div>
    `;

    el.querySelector('[data-action="have-it"]')?.addEventListener('click', () => callbacks.onChoice('upload'));
    el.querySelector('[data-action="need-help"]')?.addEventListener('click', () => callbacks.onChoice('export-help'));
    el.querySelector('[data-action="back"]')?.addEventListener('click', callbacks.onBack);
}
