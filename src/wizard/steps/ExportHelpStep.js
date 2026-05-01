import { TUTORIAL_STEPS } from '../UkgMock.js';

export const LAYOUT = 'split';

/**
 * ExportHelpStep — interactive walk-through of the UKG export. Sidebar holds
 * the prose + nav, stage shows a skeleton mockup of the corresponding UKG
 * screen with the next-action element pulsing.
 */
export function renderExportHelp(stepEl, state, callbacks) {
    const sidebar = stepEl.querySelector('.wizard-sidebar-content');
    const stage   = stepEl.querySelector('.wizard-stage-content');

    const idx = Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, state.tutorialStep ?? 0));
    const step = TUTORIAL_STEPS[idx];
    const isFirst = idx === 0;
    const isLast  = idx === TUTORIAL_STEPS.length - 1;

    sidebar.innerHTML = `
        <div class="wizard-sidebar-eyebrow">Tutorial · ${idx + 1} of ${TUTORIAL_STEPS.length}</div>
        <h2 class="wizard-sidebar-title">${step.title}</h2>
        <p class="wizard-sidebar-sub">${step.body}</p>

        ${isFirst ? `
            <div class="wizard-callout wizard-callout-warn">
                <i class="fas fa-user-shield"></i>
                <div>
                    <strong>Manager or admin access required.</strong>
                    Schedule access at your organization is required to access this report.
                    If you're not a manager or admin, ask your manager or admin to send you this file.
                </div>
            </div>
        ` : ''}

        <div class="wizard-tutorial-progress" aria-hidden="true">
            ${TUTORIAL_STEPS.map((_, i) => `
                <span class="wizard-tutorial-dot ${i === idx ? 'is-active' : ''} ${i < idx ? 'is-done' : ''}"></span>
            `).join('')}
        </div>

        <div class="wizard-nav">
            <button type="button" class="wizard-btn wizard-btn-ghost" data-action="prev">
                <i class="fas fa-arrow-left"></i> ${isFirst ? 'Back' : 'Previous'}
            </button>
            <button type="button" class="wizard-btn wizard-btn-primary" data-action="next">
                ${isLast ? 'I have the file' : 'Next'} <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `;

    stage.innerHTML = `
        <div class="ukg-mock">
            ${step.render()}
        </div>
    `;

    sidebar.querySelector('[data-action="next"]')?.addEventListener('click', callbacks.onTutorialNext);
    sidebar.querySelector('[data-action="prev"]')?.addEventListener('click', callbacks.onTutorialPrev);

    // Clicking the highlighted target advances the tutorial — feels like
    // actually navigating UKG.
    stage.querySelectorAll('.is-target').forEach(el => {
        el.addEventListener('click', callbacks.onTutorialNext);
    });

    stage.querySelector('[data-tutorial-action="next"]')
        ?.addEventListener('click', callbacks.onTutorialNext);
}
