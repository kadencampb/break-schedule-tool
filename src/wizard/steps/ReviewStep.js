import { renderPreview } from '../SchedulePreview.js';

export const LAYOUT = 'split';

const DAY_KEYS  = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * ReviewStep — final confirmation before running. Shows every setting
 * (state, hours, departments, advanced) with a "Change" link on each so the
 * user can hop to the relevant step, edit, and return.
 */
export function renderReview(stepEl, state, callbacks) {
    const sidebar = stepEl.querySelector('.wizard-sidebar-content');
    const stage   = stepEl.querySelector('.wizard-stage-content');
    renderSidebar(sidebar, state, callbacks);
    renderPreview(stage, state);
}

function renderSidebar(el, state, callbacks) {
    const adv = state.advancedSettings;
    const totalDepts    = state.upload.detectedDepartments?.length || 0;
    const selectedDepts = state.selectedDepartments?.size || 0;

    el.innerHTML = `
        <div class="wizard-sidebar-eyebrow">Step 5 of 6</div>
        <h2 class="wizard-sidebar-title">Looks good?</h2>
        <p class="wizard-sidebar-sub">
            Review last used settings before running.
        </p>

        <div class="wizard-summary-stack">
            ${summaryRow({
                icon: 'fas fa-map-marker-alt',
                label: 'State',
                value: emph('California'),
                action: 'state'
            })}
            ${summaryRow({
                icon: 'far fa-clock',
                label: 'Operating hours',
                value: formatHoursSummary(state.schedules),
                action: 'hours'
            })}
            ${summaryRow({
                icon: 'fas fa-sitemap',
                label: 'Customer facing departments',
                value: `${emph(`${selectedDepts} of ${totalDepts}`)} staggered`,
                action: 'departments'
            })}

            <div class="wizard-summary-divider">Advanced</div>

            ${summaryRow({
                icon: 'fas fa-coffee',
                label: 'Rest break placement',
                value: `${emph(`${120 - adv.maxEarly}–${120 + adv.maxDelay}m`)} after period start`,
                action: 'customize:rest'
            })}
            ${summaryRow({
                icon: 'fas fa-utensils',
                label: 'Meal placement',
                value: `${emph(`${formatMinutes(adv.idealMealOffset)}h`)} after clock-in`,
                action: 'customize:meal'
            })}
            ${summaryRow({
                icon: 'fas fa-users',
                label: 'Group coverage priority',
                value: emph(formatDeptMode(adv.deptCoverageMode)),
                action: 'customize:dept-coverage'
            })}
            ${summaryRow({
                icon: 'fas fa-balance-scale',
                label: 'Predictable timing priority',
                value: emph(formatTimeMode(adv.timeCoverageMode)),
                action: 'customize:time-coverage'
            })}
        </div>

        <div class="wizard-nav">
            <button type="button" class="wizard-btn wizard-btn-ghost" data-action="back">
                <i class="fas fa-arrow-left"></i> Back
            </button>
            <button type="button" class="wizard-btn wizard-btn-primary wizard-btn-large" data-action="run">
                Run <i class="fas fa-play"></i>
            </button>
        </div>
    `;

    // Wire "Change" links. "customize:<anchor>" opens the advanced-settings
    // modal scrolled to the matching section; anything else jumps to a step.
    el.querySelectorAll('[data-change]').forEach(btn => {
        btn.addEventListener('click', () => {
            const target = btn.getAttribute('data-change');
            if (target.startsWith('customize')) {
                const anchor = target.split(':')[1] || null;
                callbacks.onCustomize(anchor);
            } else {
                callbacks.onChangeStep(target);
            }
        });
    });

    el.querySelector('[data-action="back"]')?.addEventListener('click', callbacks.onBack);
    el.querySelector('[data-action="run"]')?.addEventListener('click', callbacks.onContinue);
}

function emph(text) {
    return `<strong class="wizard-summary-emph">${text}</strong>`;
}

function summaryRow({ icon, label, value, action }) {
    return `
        <div class="wizard-summary-row">
            <i class="${icon}"></i>
            <div class="wizard-summary-body">
                <div class="wizard-summary-label">${label}</div>
                <div class="wizard-summary-value">${value}</div>
            </div>
            <button type="button" class="wizard-summary-change" data-change="${action}">Change</button>
        </div>
    `;
}

// ── Formatters ─────────────────────────────────────────────────────────────

function formatMinutes(min) {
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
}

function formatDeptMode(mode) {
    return ({
        individual: 'Individual department',
        balanced:   'Balanced',
        group:      'Whole department group'
    })[mode] || 'Balanced';
}

function formatTimeMode(mode) {
    return ({
        predictable: 'Predictable times',
        balanced:    'Balanced',
        coverage:    'Maximum coverage'
    })[mode] || 'Balanced';
}

function formatHoursSummary(schedules) {
    if (!schedules || schedules.length === 0) return 'Not configured';

    if (schedules.length === 1) {
        const s = schedules[0];
        return `${emph(`${formatTime12(s.open)}–${formatTime12(s.close)}`)}, every day`;
    }

    // Multi-schedule: render as a 2-column grid so day labels (col 1) align
    // across all rows and the time ranges (col 2) start in the same place.
    const rows = schedules.map(s => {
        const days = DAY_KEYS
            .filter(d => s.days.includes(d))
            .map(d => DAY_SHORT[DAY_KEYS.indexOf(d)]);
        return `<span>${condenseDays(days)}</span>${emph(`${formatTime12(s.open)}–${formatTime12(s.close)}`)}`;
    });
    return `<span class="wizard-summary-hours">${rows.join('')}</span>`;
}

function condenseDays(days) {
    if (days.length === 1) return days[0];
    if (days.length === 7) return 'Every day';
    // Quick run of consecutive days, e.g. ['Mon','Tue','Wed','Thu','Fri'] → 'Mon–Fri'
    const week = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const indexes = days.map(d => week.indexOf(d)).sort((a, b) => a - b);
    let consecutive = true;
    for (let i = 1; i < indexes.length; i++) {
        if (indexes[i] !== indexes[i - 1] + 1) { consecutive = false; break; }
    }
    if (consecutive) return `${days[0]}–${days[days.length - 1]}`;
    return days.join(', ');
}

function formatTime12(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}
