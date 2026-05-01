/**
 * LandingStep — entry point. Hero with Begin CTA.
 */
export function renderLanding(el, state, callbacks) {
    const cta = state.hasPriorRun ? 'Continue' : 'Begin';
    el.innerHTML = `
        <div class="wizard-hero">
            <div class="wizard-hero-mark" aria-hidden="true">
                <i class="fas fa-clock"></i>
            </div>
            <h1 class="wizard-hero-title">Break Scheduler</h1>
            <ul class="wizard-hero-points">
                <li><i class="fas fa-bolt" aria-hidden="true"></i> Quick and automatic</li>
                <li><i class="fas fa-gavel" aria-hidden="true"></i> Labor law compliant</li>
                <li><i class="fas fa-users" aria-hidden="true"></i> Staggers breaks intelligently</li>
            </ul>
            <div class="wizard-hero-actions">
                <button type="button" class="wizard-btn wizard-btn-primary wizard-btn-large" data-action="start">
                    <span>${cta}</span>
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
            <p class="wizard-hero-meta">© 2026 Kaden Campbell</p>
        </div>
    `;

    el.querySelector('[data-action="start"]')?.addEventListener('click', callbacks.onStart);
}
