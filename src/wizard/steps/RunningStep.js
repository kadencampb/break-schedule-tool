import { renderPreview } from '../SchedulePreview.js';

export const LAYOUT = 'split';

/**
 * RunningStep — sidebar shows live progress; stage shows the preview that
 * fills in as the optimizer's events are replayed by WizardController.
 */
export function renderRunning(stepEl, state) {
    const sidebar = stepEl.querySelector('.wizard-sidebar-content');
    const stage   = stepEl.querySelector('.wizard-stage-content');

    const empCount = state.upload.detectedDepartments.reduce((n, d) => n + d.employees.length, 0);

    sidebar.innerHTML = `
        <div class="wizard-sidebar-eyebrow">Running</div>
        <h2 class="wizard-sidebar-title">Scheduling breaks…</h2>
        <p class="wizard-sidebar-sub">
            Computing meal periods and rest breaks for ${empCount} employees.
        </p>

        <div class="wizard-running-card">
            <div class="wizard-running-row">
                <div class="wizard-spinner" aria-hidden="true"></div>
                <div class="wizard-running-text">
                    <div class="wizard-running-label">Now placing</div>
                    <div class="wizard-running-name" data-running-name>Starting…</div>
                </div>
            </div>

            <div class="wizard-progress" aria-hidden="true">
                <div class="wizard-progress-fill" data-running-progress style="width: 0%"></div>
            </div>
            <div class="wizard-progress-meta">
                <span data-running-stat>0 of 0 breaks placed</span>
            </div>
        </div>
    `;

    renderPreview(stage, state);
}
