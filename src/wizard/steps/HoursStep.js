import { renderPreview } from '../SchedulePreview.js';

export const LAYOUT = 'split';

/**
 * HoursStep — operating hours configured as named "schedules" rather than 7
 * separate day-rows. Days already assigned to a schedule are disabled in the
 * checkbox grid. Continue is locked until all 7 days are covered.
 */
const DAY_KEYS  = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function renderHours(stepEl, state, callbacks) {
    const sidebar = stepEl.querySelector('.wizard-sidebar-content');
    const stage   = stepEl.querySelector('.wizard-stage-content');
    renderSidebar(sidebar, state, callbacks);
    renderPreview(stage, state);
}

function renderSidebar(el, state, callbacks) {
    const schedules    = state.schedules || [];
    const assignedDays = state.assignedDays || new Set();
    const editingId    = state.editingScheduleId ?? null;
    const editing      = editingId != null ? schedules.find(s => s.id === editingId) : null;
    const showForm     = editing != null || assignedDays.size < 7 || schedules.length === 0;
    const allCovered   = assignedDays.size === 7;
    const nextNumber   = editing ? editing.id : (schedules.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;

    const availableDays = new Set(DAY_KEYS.filter(d => !assignedDays.has(d)));
    if (editing) for (const d of editing.days) availableDays.add(d);

    el.innerHTML = `
        <div class="wizard-sidebar-eyebrow">
            Step 4 of 6 · ${assignedDays.size} of 7 covered
        </div>
        <h2 class="wizard-sidebar-title">Operating hours</h2>
        <p class="wizard-sidebar-sub">
            Enter the operating hours of your business.
        </p>

        ${schedules.length > 0 ? `
            <div class="wizard-schedule-list">
                ${schedules.map(s => renderScheduleCard(s, editingId === s.id)).join('')}
            </div>
        ` : ''}

        ${showForm ? renderForm(editing, nextNumber, availableDays, assignedDays) : `
            <div class="wizard-callout wizard-callout-success">
                <i class="fas fa-check-circle"></i>
                All 7 days covered.
            </div>
            <button type="button" class="wizard-btn-link" data-action="add-another">
                <i class="fas fa-plus"></i> Add another schedule
            </button>
        `}

        <div class="wizard-nav">
            <button type="button" class="wizard-btn wizard-btn-ghost" data-action="back">
                ${state.editMode ? 'Cancel' : '<i class="fas fa-arrow-left"></i> Back'}
            </button>
            <button type="button" class="wizard-btn wizard-btn-primary" data-action="continue" ${allCovered ? '' : 'disabled'}>
                ${state.editMode ? 'Save <i class="fas fa-check"></i>' : 'Next <i class="fas fa-arrow-right"></i>'}
            </button>
        </div>
    `;

    attachListeners(el, callbacks, editing);
}

function renderScheduleCard(schedule, isEditing) {
    const dayLabels = DAY_KEYS
        .filter(d => schedule.days.includes(d))
        .map(d => DAY_SHORT[DAY_KEYS.indexOf(d)])
        .join(' · ');

    return `
        <div class="wizard-schedule-card ${isEditing ? 'is-editing' : ''}" data-schedule-id="${schedule.id}">
            <div class="wizard-schedule-card-body">
                <div class="wizard-schedule-card-title">Schedule ${schedule.id}</div>
                <div class="wizard-schedule-card-hours">${formatTime(schedule.open)} – ${formatTime(schedule.close)}</div>
                <div class="wizard-schedule-card-days">${escape(dayLabels)}</div>
            </div>
            <div class="wizard-schedule-card-actions">
                <button type="button" class="wizard-btn-tiny" data-action="edit" data-id="${schedule.id}">
                    <i class="fas fa-pen"></i> Edit
                </button>
                <button type="button" class="wizard-btn-tiny wizard-btn-tiny-danger" data-action="delete" data-id="${schedule.id}">
                    <i class="fas fa-trash"></i> Delete
                </button>
            </div>
        </div>
    `;
}

function renderForm(editing, scheduleNumber, availableDays, assignedDays) {
    const open  = editing?.open  || '10:00';
    const close = editing?.close || '21:00';
    const checked = new Set(editing?.days || []);

    return `
        <div class="wizard-schedule-form" data-form>
            <div class="wizard-schedule-form-header">
                <div class="wizard-schedule-form-title">
                    ${editing ? `Editing Schedule ${editing.id}` : `Schedule ${scheduleNumber}`}
                </div>
                ${editing ? `
                    <button type="button" class="wizard-btn-link wizard-btn-link-small" data-action="cancel-edit">
                        Cancel
                    </button>
                ` : ''}
            </div>

            <div class="wizard-schedule-time-row">
                <label class="wizard-schedule-time">
                    <span>Opens</span>
                    <input type="time" data-field="open" value="${escape(open)}">
                </label>
                <label class="wizard-schedule-time">
                    <span>Closes</span>
                    <input type="time" data-field="close" value="${escape(close)}">
                </label>
            </div>

            <div class="wizard-schedule-days-label">Apply to</div>
            <div class="wizard-schedule-day-grid">
                ${DAY_KEYS.map((day, i) => {
                    const isAvailable = availableDays.has(day);
                    const isAssignedElsewhere = !isAvailable && assignedDays.has(day);
                    return `
                        <label class="wizard-day-checkbox ${isAvailable ? '' : 'is-disabled'} ${checked.has(day) ? 'is-checked' : ''}"
                               title="${isAssignedElsewhere ? 'Already in another schedule' : ''}">
                            <input type="checkbox" data-day="${day}"
                                ${checked.has(day) ? 'checked' : ''}
                                ${isAvailable ? '' : 'disabled'}>
                            <span>${DAY_SHORT[i]}</span>
                        </label>
                    `;
                }).join('')}
            </div>

            <div class="wizard-row">
                <button type="button" class="wizard-btn-tiny" data-action="select-remaining">
                    Select all available
                </button>
            </div>

            <div class="wizard-schedule-form-actions">
                <button type="button" class="wizard-btn wizard-btn-primary" data-action="save-schedule">
                    ${editing ? 'Save changes' : 'Save schedule'}
                </button>
            </div>
        </div>
    `;
}

function attachListeners(el, callbacks, editing) {
    const form = el.querySelector('[data-form]');

    if (form) {
        form.querySelectorAll('input[data-day]').forEach(cb => {
            cb.addEventListener('change', () => {
                cb.closest('.wizard-day-checkbox')?.classList.toggle('is-checked', cb.checked);
            });
        });

        form.querySelector('[data-action="select-remaining"]')?.addEventListener('click', () => {
            form.querySelectorAll('input[data-day]:not(:disabled)').forEach(cb => {
                cb.checked = true;
                cb.closest('.wizard-day-checkbox')?.classList.add('is-checked');
            });
        });

        form.querySelector('[data-action="save-schedule"]')?.addEventListener('click', () => {
            const open  = form.querySelector('[data-field="open"]').value;
            const close = form.querySelector('[data-field="close"]').value;
            const days  = Array.from(form.querySelectorAll('input[data-day]:checked')).map(cb => cb.dataset.day);

            if (!open || !close) {
                window.alert('Please set both open and close times.');
                return;
            }
            if (days.length === 0) {
                window.alert('Pick at least one day to apply this schedule to.');
                return;
            }
            if (editing) {
                callbacks.onUpdateSchedule(editing.id, { open, close, days });
            } else {
                callbacks.onSaveSchedule({ open, close, days });
            }
        });

        form.querySelector('[data-action="cancel-edit"]')?.addEventListener('click', () => {
            callbacks.onCancelEdit();
        });
    }

    el.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => callbacks.onEditSchedule(parseInt(btn.dataset.id, 10)));
    });
    el.querySelectorAll('[data-action="delete"]').forEach(btn => {
        btn.addEventListener('click', () => callbacks.onDeleteSchedule(parseInt(btn.dataset.id, 10)));
    });

    el.querySelector('[data-action="add-another"]')?.addEventListener('click', () => callbacks.onAddAnother());
    el.querySelector('[data-action="back"]')?.addEventListener('click', callbacks.onBack);
    el.querySelector('[data-action="continue"]')?.addEventListener('click', callbacks.onContinue);
}

function formatTime(hhmm) {
    if (!hhmm) return '';
    const [h, m] = hhmm.split(':').map(Number);
    const ap = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

function escape(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
}
