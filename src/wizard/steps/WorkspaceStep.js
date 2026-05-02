import { escapeHtml as escape, colorForGroupId } from '../util.js';
import { renderPreview } from '../SchedulePreview.js';
import { mountCustomizeInto, unmountCustomize } from '../CustomizeOverlay.js';

export const LAYOUT = 'workspace';

const NAV_ITEMS = [
    { id: 'file',        icon: 'fas fa-file-excel',   label: 'File'     },
    { id: 'departments', icon: 'fas fa-sitemap',       label: 'Groups'   },
    { id: 'state',       icon: 'fas fa-balance-scale', label: 'State'    },
    { id: 'advanced',    icon: 'fas fa-sliders-h',     label: 'Settings' }
];

export function renderWorkspace(stepEl, state, callbacks) {
    if (state.openPanel !== 'advanced') unmountCustomize();

    const navEl     = stepEl.querySelector('.wizard-workspace-nav');
    const panelEl   = stepEl.querySelector('.wizard-workspace-panel');
    const previewEl = stepEl.querySelector('.wizard-workspace-preview-area');

    renderNav(navEl, state, callbacks);
    renderPanel(panelEl, state, callbacks);
    renderPreviewArea(previewEl, state, callbacks);
}

// ── Left nav rail ─────────────────────────────────────────────────────────────

function renderNav(el, state, callbacks) {
    el.innerHTML = NAV_ITEMS.map(item => `
        <button type="button"
                class="wizard-nav-item ${state.openPanel === item.id ? 'is-active' : ''}"
                data-panel="${item.id}"
                title="${item.id.charAt(0).toUpperCase() + item.id.slice(1)}">
            <i class="${item.icon}" aria-hidden="true"></i>
            <span>${item.label}</span>
        </button>
    `).join('');

    el.querySelectorAll('[data-panel]').forEach(btn => {
        btn.addEventListener('click', () => callbacks.onSelectPanel(btn.dataset.panel));
    });
}

// ── Middle config panel ───────────────────────────────────────────────────────

function renderPanel(el, state, callbacks) {
    const panel = state.openPanel;
    if (!panel) { el.hidden = true; return; }
    el.hidden = false;

    switch (panel) {
        case 'file':        renderFilePanel(el, state, callbacks); break;
        case 'departments': renderGroupsPanel(el, state, callbacks); break;
        case 'state':       renderStatePanel(el);                   break;
        case 'advanced':    renderAdvancedPanel(el);                break;
    }
}

function renderFilePanel(el, state, callbacks) {
    const upload     = state.upload;
    const totalDepts = upload.detectedDepartments?.length || 0;
    const empCount   = upload.detectedDepartments?.reduce((n, d) => n + d.employees.length, 0) || 0;
    const dateStr    = upload.date
        ? new Date(`${upload.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
        : '—';

    el.innerHTML = `
        <div class="wizard-panel-head">Current File</div>
        <div class="wizard-panel-body">
            ${upload.file ? `
                <div class="wizard-panel-file-info">
                    <i class="fas fa-file-excel" style="font-size:1.75rem;color:var(--wiz-green);flex-shrink:0"></i>
                    <div>
                        <div class="wizard-panel-filename">${escape(upload.file.name)}</div>
                        <div class="wizard-panel-filemeta">${dateStr} &nbsp;·&nbsp; ${empCount} employees &nbsp;·&nbsp; ${totalDepts} depts</div>
                    </div>
                </div>
            ` : `<p style="color:var(--wiz-muted);font-size:0.85rem">No file loaded.</p>`}
            <button type="button" class="wizard-btn wizard-btn-ghost" style="margin-top:0.75rem;width:100%" data-action="restart">
                <i class="fas fa-file-upload"></i> Upload different file
            </button>
        </div>
    `;
    el.querySelector('[data-action="restart"]')?.addEventListener('click', callbacks.onRestart);
}

function renderStatePanel(el) {
    el.innerHTML = `
        <div class="wizard-panel-head">Labor Law</div>
        <div class="wizard-panel-body">
            <div class="wizard-law-preview">
                <div class="wizard-law-head">
                    <i class="fas fa-balance-scale"></i>
                    <h3>California</h3>
                </div>
                <div class="wizard-law-rule">
                    <div class="wizard-law-rule-title"><i class="fas fa-coffee"></i> Rest periods</div>
                    <p>One 10-minute paid break per 4 hours worked (or major fraction). No break for shifts ≤ 3.5 hours.</p>
                </div>
                <div class="wizard-law-rule">
                    <div class="wizard-law-rule-title"><i class="fas fa-utensils"></i> Meal periods</div>
                    <p>30-minute unpaid meal required for shifts over 5 hours. Must start before the end of the 5th hour worked.</p>
                </div>
                <a class="wizard-law-link" href="https://www.dir.ca.gov/dlse/RestAndMealPeriods.pdf" target="_blank" rel="noopener">
                    CA DLSE summary <i class="fas fa-external-link-alt"></i>
                </a>
            </div>
            <p style="font-size:0.75rem;color:var(--wiz-muted);margin-top:1rem">
                Only California is currently supported. Other states coming soon.
            </p>
        </div>
    `;
}

function renderAdvancedPanel(el) {
    el.innerHTML = `
        <div class="wizard-panel-head">Advanced Settings</div>
        <div class="wizard-panel-body wizard-panel-adv-slot" data-adv-slot></div>
    `;
    mountCustomizeInto(el.querySelector('[data-adv-slot]'));
}

// ── Groups panel ──────────────────────────────────────────────────────────────

function renderGroupsPanel(el, state, callbacks) {
    const detected = state.upload.detectedDepartments || [];
    const groups   = state.coverageGroups || [];

    const detectedKeys = new Set(detected.map(d => `${d.main}|${d.sub}`));
    const groupedKeys  = new Set();
    const groupRows    = [];

    for (const g of groups) {
        const inGroup = detected.filter(d => g.departments.some(gd => gd.main === d.main && gd.sub === d.sub));
        if (inGroup.length < 2) continue;
        for (const d of inGroup) groupedKeys.add(`${d.main}|${d.sub}`);
        groupRows.push({ group: g, depts: inGroup });
    }

    const standaloneDepts = detected.filter(d => !groupedKeys.has(`${d.main}|${d.sub}`));
    const hasGroups = groupRows.length > 0;

    el.innerHTML = `
        <div class="wizard-panel-head">Coverage Groups</div>
        <div class="wizard-panel-body" style="padding-top:0.5rem">
            <div class="wizard-dept-area" data-drop-standalone>
                ${detected.length === 0 ? `
                    <p style="color:var(--wiz-muted);font-size:0.82rem;padding:0.5rem 0">
                        Upload a file to see departments here.
                    </p>
                ` : `
                    ${hasGroups ? groupRows.map(({ group, depts }) => groupHtml(group, depts)).join('') : ''}

                    ${standaloneDepts.length > 0 ? `
                        <div class="wizard-dept-standalone">
                            ${hasGroups ? `<div class="wizard-dept-section-label" style="margin:0.6rem 0 0.35rem">Unassigned</div>` : ''}
                            ${standaloneDepts.map(d => standaloneHtml(d)).join('')}
                        </div>
                    ` : ''}
                `}
            </div>

            ${hasGroups ? `
                <div style="padding-top:0.75rem;border-top:1px solid var(--wiz-border);margin-top:0.5rem">
                    <button type="button" class="wizard-btn-tiny wizard-btn-tiny-danger" style="width:100%" data-action="delete-all-groups">
                        <i class="fas fa-trash"></i> Delete all groups
                    </button>
                </div>
            ` : `
                <p style="font-size:0.75rem;color:var(--wiz-muted);margin-top:1rem;line-height:1.5">
                    Drag one department onto another to create a coverage group.
                    Employees in the same group have their breaks staggered together.
                </p>
            `}
        </div>
    `;

    attachGroupListeners(el, callbacks, detectedKeys);
}

function groupHtml(group, depts) {
    return `
        <div class="wizard-dept-group-box"
             data-drop-group="${group.id}"
             style="--group-color:${colorForGroupId(group.id)}">
            <div class="wizard-dept-group-head">
                <span class="wizard-dept-group-name">${escape(group.name)}</span>
                <button type="button" class="wizard-dept-group-iconbtn" data-rename="${group.id}" title="Rename">
                    <i class="fas fa-pen"></i>
                </button>
                <button type="button" class="wizard-dept-group-iconbtn" data-ungroup="${group.id}" title="Disband group">
                    <i class="fas fa-times"></i>
                </button>
            </div>
            <div class="wizard-dept-group-items">
                ${depts.map(d => groupMemberHtml(d)).join('')}
            </div>
        </div>
    `;
}

function groupMemberHtml(dept) {
    const key = `${dept.main}|${dept.sub}`;
    return `
        <div class="wizard-dept-item wizard-dept-item-grouped"
             draggable="true" data-dept-key="${escape(key)}">
            <i class="fas fa-grip-vertical wizard-dept-grip" aria-hidden="true"></i>
            <div class="wizard-dept-info">
                <div class="wizard-dept-name">${escape(dept.sub || dept.main)}</div>
                <div class="wizard-dept-meta">${dept.employees.length} ${dept.employees.length === 1 ? 'employee' : 'employees'}</div>
            </div>
        </div>
    `;
}

function standaloneHtml(dept) {
    const key = `${dept.main}|${dept.sub}`;
    return `
        <div class="wizard-dept-item" draggable="true" data-dept-key="${escape(key)}">
            <i class="fas fa-grip-vertical wizard-dept-grip" aria-hidden="true"></i>
            <div class="wizard-dept-info">
                <div class="wizard-dept-name">${escape(dept.sub || dept.main)}</div>
                <div class="wizard-dept-meta">${dept.employees.length} ${dept.employees.length === 1 ? 'employee' : 'employees'}</div>
            </div>
        </div>
    `;
}

function attachGroupListeners(el, callbacks, detectedKeys) {
    el.querySelectorAll('[data-ungroup]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onUngroup(parseInt(btn.dataset.ungroup, 10)); });
    });
    el.querySelectorAll('[data-rename]').forEach(btn => {
        btn.addEventListener('click', (e) => { e.stopPropagation(); callbacks.onRenameGroup(parseInt(btn.dataset.rename, 10)); });
    });
    el.querySelector('[data-action="delete-all-groups"]')?.addEventListener('click', callbacks.onDeleteAllGroups);

    const items          = el.querySelectorAll('.wizard-dept-item[draggable="true"]');
    const groupBoxes     = el.querySelectorAll('[data-drop-group]');
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
        item.addEventListener('dragover',  (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
        item.addEventListener('dragenter', () => { if (!item.classList.contains('is-dragging')) item.classList.add('is-dragover'); });
        item.addEventListener('dragleave', () => item.classList.remove('is-dragover'));
        item.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            item.classList.remove('is-dragover');
            const src = e.dataTransfer.getData('text/plain');
            const tgt = item.dataset.deptKey;
            if (src && tgt && src !== tgt && detectedKeys.has(tgt)) callbacks.onDropDeptOnDept(src, tgt);
        });
    });

    groupBoxes.forEach(box => {
        box.addEventListener('dragover',  (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; box.classList.add('is-dragover'); });
        box.addEventListener('dragleave', (e) => { if (!box.contains(e.relatedTarget)) box.classList.remove('is-dragover'); });
        box.addEventListener('drop', (e) => {
            e.preventDefault(); e.stopPropagation();
            box.classList.remove('is-dragover');
            const src = e.dataTransfer.getData('text/plain');
            if (src) callbacks.onMoveDeptToGroup(src, parseInt(box.dataset.dropGroup, 10));
        });
    });

    standaloneArea?.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    standaloneArea?.addEventListener('drop', (e) => {
        e.preventDefault();
        const src = e.dataTransfer.getData('text/plain');
        if (src) callbacks.onMoveDeptToStandalone(src);
    });
}

// ── Preview area ──────────────────────────────────────────────────────────────

function renderPreviewArea(el, state, callbacks) {
    const hasResult = !!(state.result?.breaks);
    const hasFile   = !!(state.upload?.rows);

    el.innerHTML = `
        <div class="wizard-workspace-preview-actions">
            <button type="button"
                    class="wizard-ws-download-btn"
                    ${hasResult ? '' : 'disabled'}
                    data-action="download">
                <i class="fas fa-download"></i> Download
            </button>
            <button type="button" class="wizard-ws-new-btn" data-action="restart">
                <i class="fas fa-file-upload"></i> New File
            </button>
        </div>
        <div class="wizard-workspace-preview-content">
            ${!hasFile ? `<div class="wizard-ws-empty"><p>Upload a schedule to get started.</p></div>` : ''}
        </div>
    `;

    if (hasFile) {
        renderPreview(el.querySelector('.wizard-workspace-preview-content'), state, callbacks);
    }

    el.querySelector('[data-action="download"]')?.addEventListener('click', callbacks.onDownload);
    el.querySelector('[data-action="restart"]')?.addEventListener('click', callbacks.onRestart);
}
