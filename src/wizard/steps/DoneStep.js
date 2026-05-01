import { renderPreview } from '../SchedulePreview.js';

export const LAYOUT = 'split';

/**
 * DoneStep (split layout) — sidebar with success message and Download button,
 * stage keeps the schedule preview visible so the user can verify the final
 * placement before downloading.
 */
export function renderDone(stepEl, state, callbacks) {
    const sidebar = stepEl.querySelector('.wizard-sidebar-content');
    const stage   = stepEl.querySelector('.wizard-stage-content');

    const result = state.result || {};
    const breakCount = countBreaks(result.breaks);
    const empCount   = state.upload.detectedDepartments.reduce((n, d) => n + d.employees.length, 0);

    sidebar.innerHTML = `
        <div class="wizard-success-mark"><i class="fas fa-check-circle"></i></div>
        <h2 class="wizard-sidebar-title">All done!</h2>
        <p class="wizard-sidebar-sub">
            Scheduled <strong>${breakCount}</strong> ${breakCount === 1 ? 'break' : 'breaks'}
            across <strong>${empCount}</strong> ${empCount === 1 ? 'employee' : 'employees'}.
            Review the schedule on the right, then download.
        </p>

        <button type="button" class="wizard-btn wizard-btn-primary wizard-btn-large wizard-btn-block" data-action="download">
            <i class="fas fa-download"></i> Download Schedule
        </button>

        <button type="button" class="wizard-btn wizard-btn-ghost wizard-btn-block" data-action="adjust">
            <i class="fas fa-sliders-h"></i> Adjust settings and run again
        </button>

        <button type="button" class="wizard-btn wizard-btn-ghost wizard-btn-block" data-action="restart">
            <i class="fas fa-redo"></i> Run another schedule
        </button>
    `;

    renderPreview(stage, state);

    sidebar.querySelector('[data-action="download"]')?.addEventListener('click', callbacks.onDownload);
    sidebar.querySelector('[data-action="adjust"]')?.addEventListener('click', callbacks.onAdjustSettings);
    sidebar.querySelector('[data-action="restart"]')?.addEventListener('click', callbacks.onRestart);
}

function countBreaks(breaks) {
    if (!breaks) return 0;
    let n = 0;
    for (const slots of Object.values(breaks)) {
        for (const t of Object.values(slots)) {
            if (t != null) n++;
        }
    }
    return n;
}
