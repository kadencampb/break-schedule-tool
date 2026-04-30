/**
 * LandingStep — entry point. Hero + Get Started / Continue buttons.
 *
 * If the user has been here before (any wizardRemember flag set or selected
 * departments persisted), show "Continue" alongside "Get Started".
 */
export function renderLanding(el, state, callbacks) {
    const hasPriorRun = state.hasPriorRun;
    el.innerHTML = `
        <div class="wizard-hero">
            <div class="wizard-hero-mark" aria-hidden="true">
                <i class="fas fa-clock"></i>
            </div>
            <h1 class="wizard-hero-title">Intelligent Break Scheduler</h1>
            <p class="wizard-hero-tagline">
                Instantly schedule breaks to comply with labor laws and keep departments staffed.
            </p>
            <div class="wizard-hero-actions">
                <button type="button" class="wizard-btn wizard-btn-primary" data-action="start">
                    <span>${hasPriorRun ? 'Next' : 'Get Started'}</span>
                    <i class="fas fa-arrow-right"></i>
                </button>
            </div>
            <p class="wizard-hero-meta">© 2026 Kaden Campbell</p>
        </div>
    `;

    el.querySelector('[data-action="start"]')?.addEventListener('click', callbacks.onStart);
    el.querySelector('[data-action="restart"]')?.addEventListener('click', callbacks.onRestart);
}
