import { minutesToTime } from '../core/helpers.js';
import { escapeHtml as escape, colorForGroupId } from './util.js';

/**
 * SchedulePreview — visual representation of the uploaded schedule with
 * inline per-dept break controls (Write Breaks + Stagger switches).
 *
 * Supports two modes of break rendering:
 *  - Declarative (initial render): pass `breaks` in state; pills render directly
 *  - Imperative (animation): call `addBreakToPreview` for each newly-placed
 *    break so it animates in one at a time without a full re-render
 */

const CSS_BREAK      = 'wizard-preview-break';
const CSS_BREAK_MEAL = 'wizard-preview-break-meal';

export function renderPreview(container, state, callbacks) {
    if (!container) return;

    const upload   = state.upload || {};
    const detected = upload.detectedDepartments || [];
    const selected = state.selectedDepartments || new Set();
    const enabled  = state.enabledDepartments  || new Set();
    const breaks   = state.result?.breaks || null;
    const groups   = state.coverageGroups || [];

    if (!detected.length) {
        container.innerHTML = renderSkeleton();
        return;
    }

    // Index dept-key → coverage group for quick lookup
    const groupByDept = new Map();
    for (const g of groups) {
        for (const d of g.departments) {
            groupByDept.set(`${d.main}|${d.sub}`, g);
        }
    }

    const totalEmployees = detected.reduce((n, d) => n + d.employees.length, 0);

    // Group by main department for display sections
    const byMain = new Map();
    for (const d of detected) {
        if (!byMain.has(d.main)) byMain.set(d.main, []);
        byMain.get(d.main).push(d);
    }

    container.innerHTML = `
        <div class="wizard-preview" data-preview>
            <header class="wizard-preview-header">
                <div class="wizard-preview-title">${escape(formatDate(upload.date) || 'Schedule')}</div>
                <div class="wizard-preview-meta">
                    <span><strong>${totalEmployees}</strong> ${totalEmployees === 1 ? 'employee' : 'employees'}</span>
                    <span class="wizard-preview-meta-sep">·</span>
                    <span><strong>${detected.length}</strong> ${detected.length === 1 ? 'department' : 'departments'}</span>
                </div>
            </header>
            <div class="wizard-preview-body">
                ${Array.from(byMain.entries()).map(([main, depts]) => `
                    <div class="wizard-preview-main-group">
                        <div class="wizard-preview-main-label">${escape(main)}</div>
                        ${depts.map(d => renderDept(d, selected, enabled, breaks, groupByDept)).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    // Attach toggle listeners if callbacks provided
    if (callbacks) {
        container.querySelectorAll('[data-preview-enable]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                callbacks.onToggleBreakEnabled(cb.getAttribute('data-preview-enable'));
            });
        });
        container.querySelectorAll('[data-preview-stagger]').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                callbacks.onToggleDept(cb.getAttribute('data-preview-stagger'));
            });
        });
    }
}

/**
 * Imperatively add a break pill to a specific employee's row.
 * Used during the running animation.
 */
export function addBreakToPreview(container, employeeName, slot, time) {
    if (!container) return;
    const li = container.querySelector(`[data-emp="${cssEscape(employeeName)}"]`);
    if (!li) return;
    const breaksCell = li.querySelector('.wizard-preview-emp-breaks');
    if (!breaksCell) return;

    const isMeal = slot === 'meal';
    const pill   = document.createElement('span');
    pill.className = `${CSS_BREAK}${isMeal ? ' ' + CSS_BREAK_MEAL : ''} is-entering`;
    pill.dataset.slot = slot;
    pill.textContent  = minutesToTime(time);
    breaksCell.appendChild(pill);

    li.classList.add('is-flashing');
    setTimeout(() => li.classList.remove('is-flashing'), 600);
}

export function setSelectedInPreview(container, selectedDeptKeys) {
    if (!container) return;
    container.querySelectorAll('.wizard-preview-dept').forEach(el => {
        const key = el.dataset.deptKey;
        el.classList.toggle('is-selected', selectedDeptKeys.has(key));
    });
}

// ── Internal renderers ─────────────────────────────────────────────────────

function renderDept(dept, selected, enabled, breaks, groupByDept) {
    const key       = `${dept.main}|${dept.sub}`;
    const isEnabled = enabled.has(key);   // Write Breaks on/off
    const isStagger = selected.has(key);  // Stagger Breaks on/off
    const group     = groupByDept?.get(key);
    const isInGroup = !!group;
    const groupColor = isInGroup ? colorForGroupId(group.id) : null;

    const styleAttr  = groupColor ? `style="--preview-group-color: ${groupColor};"` : '';
    const groupClass = isInGroup   ? 'has-group'    : '';
    const breaksClass = !isEnabled  ? 'is-breaks-off' : '';
    const staggerClass = isStagger  ? 'is-selected'  : '';

    // Stagger switch: locked-on for grouped depts, disabled if breaks are off
    const staggerDisabled = !isEnabled || isInGroup;
    const staggerLocked   = isInGroup;

    return `
        <div class="wizard-preview-dept ${staggerClass} ${groupClass} ${breaksClass}"
             data-dept-key="${escape(key)}" ${styleAttr}>
            <div class="wizard-preview-dept-head">
                <div class="wizard-preview-dept-name-wrap">
                    <span class="wizard-preview-dept-name">${escape(dept.sub || dept.main)}</span>
                    ${isInGroup ? `<span class="wizard-preview-dept-group">${escape(group.name)}</span>` : ''}
                    <span class="wizard-preview-dept-count">${dept.employees.length} ${dept.employees.length === 1 ? 'employee' : 'employees'}</span>
                </div>
                <div class="wizard-preview-dept-controls">
                    <label class="wizard-preview-toggle" title="Generate breaks for this department">
                        <span class="wizard-preview-toggle-label">Write Breaks</span>
                        <input type="checkbox" class="wizard-switch wizard-switch-sm"
                               data-preview-enable="${escape(key)}"
                               ${isEnabled ? 'checked' : ''}>
                    </label>
                    <label class="wizard-preview-toggle ${staggerLocked ? 'is-group-locked' : ''}"
                           title="${isInGroup ? 'Stagger is locked on for coverage groups' : 'Stagger breaks for customer coverage'}">
                        <span class="wizard-preview-toggle-label">${isInGroup ? 'Stagger 🔒' : 'Stagger'}</span>
                        <input type="checkbox" class="wizard-switch wizard-switch-sm"
                               data-preview-stagger="${escape(key)}"
                               ${isStagger ? 'checked' : ''}
                               ${staggerDisabled ? 'disabled' : ''}>
                    </label>
                </div>
            </div>
            ${renderEmployeeList(dept.employees, breaks)}
        </div>
    `;
}

function renderEmployeeList(employees, breaks) {
    const cap   = 6;
    const shown = employees.slice(0, cap);
    const extra = employees.length - shown.length;

    return `
        <ul class="wizard-preview-emp-list">
            ${shown.map(emp => renderEmployee(emp, breaks)).join('')}
            ${extra > 0 ? `<li class="wizard-preview-emp-more">+${extra} more</li>` : ''}
        </ul>
    `;
}

function renderEmployee(emp, breaks) {
    const name      = typeof emp === 'string' ? emp : emp.name;
    const shift     = typeof emp === 'string' ? '' : (emp.shift || '');
    const empBreaks = breaks?.[name];
    const items     = [];
    if (empBreaks?.rest1 != null) items.push(`<span class="${CSS_BREAK}" data-slot="rest1">${escape(minutesToTime(empBreaks.rest1))}</span>`);
    if (empBreaks?.meal  != null) items.push(`<span class="${CSS_BREAK} ${CSS_BREAK_MEAL}" data-slot="meal">${escape(minutesToTime(empBreaks.meal))}</span>`);
    if (empBreaks?.rest2 != null) items.push(`<span class="${CSS_BREAK}" data-slot="rest2">${escape(minutesToTime(empBreaks.rest2))}</span>`);
    if (empBreaks?.rest3 != null) items.push(`<span class="${CSS_BREAK}" data-slot="rest3">${escape(minutesToTime(empBreaks.rest3))}</span>`);

    return `
        <li class="wizard-preview-emp" data-emp="${escape(name)}">
            <span class="wizard-preview-emp-name">${escape(name)}</span>
            <span class="wizard-preview-emp-shift">${escape(formatShift(shift))}</span>
            <span class="wizard-preview-emp-breaks">${items.join('')}</span>
        </li>
    `;
}

function renderSkeleton() {
    return `
        <div class="wizard-preview wizard-preview-skeleton">
            <header class="wizard-preview-header">
                <div class="wizard-skeleton-bar wizard-skeleton-bar-w-40"></div>
                <div class="wizard-skeleton-bar wizard-skeleton-bar-w-60"></div>
            </header>
            <div class="wizard-preview-body">
                ${Array.from({ length: 3 }).map(() => `
                    <div class="wizard-preview-main-group">
                        <div class="wizard-skeleton-bar wizard-skeleton-bar-w-30"></div>
                        ${Array.from({ length: 2 }).map(() => `
                            <div class="wizard-preview-dept">
                                <div class="wizard-preview-dept-head">
                                    <div class="wizard-skeleton-bar wizard-skeleton-bar-w-50"></div>
                                </div>
                                <ul class="wizard-preview-emp-list">
                                    ${Array.from({ length: 3 }).map(() => `
                                        <li class="wizard-preview-emp">
                                            <div class="wizard-skeleton-bar wizard-skeleton-bar-w-70"></div>
                                        </li>
                                    `).join('')}
                                </ul>
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(raw) {
    if (!raw) return '';
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
    if (!match) return raw;
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const [, y, m, d] = match;
    const monthName = months[parseInt(m, 10) - 1];
    if (!monthName) return raw;
    return `${monthName} ${parseInt(d, 10)}, ${y}`;
}

function formatShift(raw) {
    if (!raw) return '';
    return raw
        .replace(/(\d)(AM|PM)/gi, '$1 $2')
        .replace(/\s*-\s*/, ' – ');
}

function cssEscape(s) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(s);
    return String(s).replace(/(["'\\#.~+>$@:[\]])/g, '\\$1');
}
