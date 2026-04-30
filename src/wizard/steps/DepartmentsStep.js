import { renderPreview } from '../SchedulePreview.js';

export const LAYOUT = 'split';

/**
 * DepartmentsStep — visually grouped departments with drag-and-drop.
 *
 * Selection model:
 *   • Standalone dept: own checkbox (toggles its inclusion in staggering)
 *   • Group: ONE master checkbox in the header (toggles all members at once;
 *     indeterminate when only some members are checked elsewhere)
 *
 * Drag-and-drop:
 *   • Drag a dept onto a group container → joins that group
 *   • Drag a dept onto another standalone dept → creates a new 2-dept group
 *   • Drag a dept out of a group → ungroups; the group auto-disbands if it
 *     ends up with fewer than 2 depts
 */
export function renderDepartments(stepEl, state, callbacks) {
    const sidebar = stepEl.querySelector('.wizard-sidebar-content');
    const stage   = stepEl.querySelector('.wizard-stage-content');
    renderSidebar(sidebar, state, callbacks);
    renderPreview(stage, state);
}

function renderSidebar(el, state, callbacks) {
    const detected = state.upload.detectedDepartments || [];
    const selected = state.selectedDepartments;
    const groups   = state.coverageGroups || [];

    const detectedKeys = new Set(detected.map(d => `${d.main}|${d.sub}`));
    const groupedKeys  = new Set();
    const groupRows = [];
    for (const g of groups) {
        const inThisGroup = detected.filter(d => g.departments.some(gd => gd.main === d.main && gd.sub === d.sub));
        if (inThisGroup.length < 2) continue; // groups need 2+ to be meaningful
        for (const d of inThisGroup) groupedKeys.add(`${d.main}|${d.sub}`);
        groupRows.push({ group: g, depts: inThisGroup });
    }
    const standaloneDepts = detected.filter(d => !groupedKeys.has(`${d.main}|${d.sub}`));

    const colorFor = (id) => {
        const palette = ['#2f855a', '#3182ce', '#805ad5', '#dd6b20', '#d53f8c', '#0987a0', '#b7791f', '#5a67d8'];
        return palette[id % palette.length];
    };

    el.innerHTML = `
        <div class="wizard-sidebar-eyebrow">Step 3 of 6</div>
        <h2 class="wizard-sidebar-title">Customer facing departments</h2>
        <p class="wizard-sidebar-sub">
            Select departments to intelligently stagger breaks for that department.
            Drag and drop departments to create a department group. Breaks will be
            staggered across the entire group as if it were one department.
        </p>

        <div class="wizard-row">
            <button type="button" class="wizard-btn-tiny" data-action="select-all">Select all</button>
            <button type="button" class="wizard-btn-tiny" data-action="select-none">Deselect all</button>
            ${groupRows.length > 0 ? `
                <button type="button" class="wizard-btn-tiny wizard-btn-tiny-danger" data-action="delete-all-groups">
                    <i class="fas fa-trash"></i> Delete all groups
                </button>
            ` : ''}
        </div>

        <div class="wizard-dept-stagger-header">
            <span class="wizard-dept-stagger-label">Enable staggering</span>
        </div>

        <div class="wizard-dept-area" data-drop-standalone>
            ${groupRows.map(({ group, depts }) => groupBoxHtml(group, depts, selected, colorFor)).join('')}

            ${standaloneDepts.length > 0 ? `
                <div class="wizard-dept-standalone">
                    ${groupRows.length > 0 ? '<div class="wizard-dept-standalone-label">Standalone</div>' : ''}
                    ${standaloneDepts.map(d => standaloneItemHtml(d, selected)).join('')}
                </div>
            ` : ''}
        </div>

        <div class="wizard-nav">
            <button type="button" class="wizard-btn wizard-btn-ghost" data-action="back">
                ${state.editMode ? 'Cancel' : '<i class="fas fa-arrow-left"></i> Back'}
            </button>
            <button type="button" class="wizard-btn wizard-btn-primary" data-action="continue">
                ${state.editMode ? 'Save <i class="fas fa-check"></i>' : 'Next <i class="fas fa-arrow-right"></i>'}
            </button>
        </div>
    `;

    attachListeners(el, callbacks, detectedKeys);
}

function groupBoxHtml(group, depts, selected, colorFor) {
    const memberKeys = depts.map(d => `${d.main}|${d.sub}`);
    const checkedCount = memberKeys.filter(k => selected.has(k)).length;
    const allChecked  = checkedCount === memberKeys.length;
    const someChecked = checkedCount > 0 && !allChecked;

    return `
        <div class="wizard-dept-group-box ${allChecked ? 'is-checked' : ''}" data-drop-group="${group.id}" style="--group-color: ${colorFor(group.id)};">
            <div class="wizard-dept-group-head">
                <input type="checkbox" class="wizard-switch wizard-dept-group-master"
                       data-group-master="${group.id}"
                       ${allChecked ? 'checked' : ''}
                       ${someChecked ? 'data-indeterminate="true"' : ''}>
                <span class="wizard-dept-group-name">${escape(group.name)}</span>
                <button type="button" class="wizard-dept-group-iconbtn" data-rename="${group.id}" title="Rename group">
                    <i class="fas fa-pen"></i>
                </button>
                <button type="button" class="wizard-dept-group-iconbtn" data-ungroup="${group.id}" title="Disband group">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="wizard-dept-group-items">
                ${depts.map(d => groupedDeptItemHtml(d)).join('')}
            </div>
        </div>
    `;
}

function groupedDeptItemHtml(dept) {
    const key = `${dept.main}|${dept.sub}`;
    return `
        <div class="wizard-dept-item wizard-dept-item-grouped" draggable="true" data-dept-key="${escape(key)}">
            <i class="fas fa-grip-vertical wizard-dept-grip" aria-hidden="true"></i>
            <div class="wizard-dept-info">
                <div class="wizard-dept-name">${escape(dept.sub || dept.main)}</div>
                <div class="wizard-dept-meta">${dept.employees.length} ${dept.employees.length === 1 ? 'employee' : 'employees'}</div>
            </div>
        </div>
    `;
}

function standaloneItemHtml(dept, selected) {
    const key = `${dept.main}|${dept.sub}`;
    const checked = selected.has(key);
    return `
        <label class="wizard-dept-item ${checked ? 'is-checked' : ''}" draggable="true" data-dept-key="${escape(key)}">
            <i class="fas fa-grip-vertical wizard-dept-grip" aria-hidden="true"></i>
            <div class="wizard-dept-info">
                <div class="wizard-dept-name">${escape(dept.sub || dept.main)}</div>
                <div class="wizard-dept-meta">${dept.employees.length} ${dept.employees.length === 1 ? 'employee' : 'employees'}</div>
            </div>
            <input type="checkbox" class="wizard-switch" data-dept-key="${escape(key)}" ${checked ? 'checked' : ''}>
        </label>
    `;
}

function attachListeners(el, callbacks, detectedKeys) {
    // Set indeterminate state on master checkboxes (can't be done via HTML attribute)
    el.querySelectorAll('[data-group-master]').forEach(cb => {
        if (cb.dataset.indeterminate === 'true') cb.indeterminate = true;
    });

    // Standalone checkboxes (regular dept toggle)
    el.querySelectorAll('input[type="checkbox"][data-dept-key]').forEach(input => {
        input.addEventListener('change', (e) => {
            e.stopPropagation();
            callbacks.onToggleDept(input.getAttribute('data-dept-key'));
        });
    });

    // Group master checkbox: toggle all members
    el.querySelectorAll('[data-group-master]').forEach(cb => {
        cb.addEventListener('change', (e) => {
            e.stopPropagation();
            const groupId = parseInt(cb.dataset.groupMaster, 10);
            callbacks.onSetGroupSelection(groupId, cb.checked);
        });
    });

    // Action buttons
    el.querySelector('[data-action="select-all"]')?.addEventListener('click', callbacks.onSelectAllDepts);
    el.querySelector('[data-action="select-none"]')?.addEventListener('click', callbacks.onSelectNoneDepts);
    el.querySelector('[data-action="delete-all-groups"]')?.addEventListener('click', callbacks.onDeleteAllGroups);
    el.querySelector('[data-action="back"]')?.addEventListener('click', callbacks.onBack);
    el.querySelector('[data-action="continue"]')?.addEventListener('click', callbacks.onContinue);

    el.querySelectorAll('[data-ungroup]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onUngroup(parseInt(btn.dataset.ungroup, 10));
        });
    });
    el.querySelectorAll('[data-rename]').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            callbacks.onRenameGroup(parseInt(btn.dataset.rename, 10));
        });
    });

    // ── Drag and drop ──────────────────────────────────────────────────────
    const items   = el.querySelectorAll('.wizard-dept-item[draggable="true"]');
    const groups  = el.querySelectorAll('[data-drop-group]');
    const standaloneArea = el.querySelector('[data-drop-standalone]');

    items.forEach(item => {
        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', item.dataset.deptKey);
            e.dataTransfer.effectAllowed = 'move';
            item.classList.add('is-dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('is-dragging');
            el.querySelectorAll('.is-dragover').forEach(n => n.classList.remove('is-dragover'));
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
        });
        item.addEventListener('dragenter', () => {
            if (!item.classList.contains('is-dragging')) item.classList.add('is-dragover');
        });
        item.addEventListener('dragleave', () => item.classList.remove('is-dragover'));
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            e.stopPropagation();
            item.classList.remove('is-dragover');
            const sourceKey = e.dataTransfer.getData('text/plain');
            const targetKey = item.dataset.deptKey;
            if (sourceKey && targetKey && sourceKey !== targetKey && detectedKeys.has(targetKey)) {
                callbacks.onDropDeptOnDept(sourceKey, targetKey);
            }
        });
    });

    groups.forEach(box => {
        box.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            box.classList.add('is-dragover');
        });
        box.addEventListener('dragleave', (e) => {
            if (!box.contains(e.relatedTarget)) box.classList.remove('is-dragover');
        });
        box.addEventListener('drop', (e) => {
            e.preventDefault();
            box.classList.remove('is-dragover');
            const sourceKey = e.dataTransfer.getData('text/plain');
            const groupId = parseInt(box.dataset.dropGroup, 10);
            if (sourceKey) callbacks.onMoveDeptToGroup(sourceKey, groupId);
        });
    });

    standaloneArea?.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    });
    standaloneArea?.addEventListener('drop', (e) => {
        e.preventDefault();
        const sourceKey = e.dataTransfer.getData('text/plain');
        if (sourceKey) callbacks.onMoveDeptToStandalone(sourceKey);
    });
}

function escape(s) {
    const div = document.createElement('div');
    div.textContent = String(s ?? '');
    return div.innerHTML;
}
