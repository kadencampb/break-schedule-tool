import { WizardModel } from './WizardModel.js';
import { WizardView } from './WizardView.js';
import { scheduleBreaks } from '../core/BreakScheduler.js';
import { formatName, parseShiftInterval, minutesToTime } from '../core/helpers.js';
import { addBreakToPreview, renderPreview } from './SchedulePreview.js';
import { showToast, clearToasts } from './Toast.js';
import { unmountCustomize } from './CustomizeOverlay.js';
import { TUTORIAL_STEPS } from './UkgMock.js';

const DEFAULT_STAGGERED_MAINS = new Set([
    'frontline', 'hardgoods', 'softgoods', 'shop'
]);

export class WizardController {
    constructor({ storage, excel, settings, groups, root }) {
        this._storage  = storage;
        this._excel    = excel;
        this._settings = settings;
        this._groups   = groups;
        this._root     = root;

        this._model = new WizardModel(storage);
        this._view  = new WizardView(root);

        this._tutorialStep = 0;
        this._openPanel    = null;
        this._autoRunTimer = null;
        this._hasRunOnce   = false;
    }

    init() {
        for (const ev of ['step', 'upload']) {
            this._model.subscribe(`change:${ev}`, () => this._render());
        }
        this._root.addEventListener('settings:advanced-change', () => {
            if (this._model.getStep() === 'workspace') this._scheduleAutoRun();
        });
        this._render();
    }

    // ── Render ───────────────────────────────────────────────────────────────

    _buildState() {
        return {
            step:                this._model.getStep(),
            upload:              this._model.getUpload(),
            selectedDepartments: this._model.getSelectedDepartments(),
            enabledDepartments:  this._model.getEnabledDepartments(),
            advancedSettings:    this._settings.getAdvancedSettings(),
            tutorialStep:        this._tutorialStep,
            coverageGroups:      this._groups.getAll(),
            result:              this._model.getResult(),
            openPanel:           this._openPanel,
            hasPriorRun:         this._hasPriorRun()
        };
    }

    _render() {
        if (this._model.getStep() !== 'workspace' || this._openPanel !== 'advanced') {
            unmountCustomize();
        }
        this._view.render(this._buildState(), this._buildCallbacks());
    }

    // ── Surgical workspace patches ────────────────────────────────────────────

    /** Re-renders only the preview content and re-enables the download button. */
    _patchWorkspacePreview() {
        if (this._model.getStep() !== 'workspace') { this._render(); return; }

        const savedScroll = this._root.querySelector('.wizard-workspace-preview-content')?.scrollTop;
        const content     = this._root.querySelector('.wizard-workspace-preview-content');
        if (content) renderPreview(content, this._buildState(), this._buildCallbacks());

        const dlBtn = this._root.querySelector('.wizard-ws-download-btn');
        if (dlBtn && this._model.getResult()?.breaks) dlBtn.removeAttribute('disabled');

        const newContent = this._root.querySelector('.wizard-workspace-preview-content');
        if (newContent && savedScroll != null) newContent.scrollTop = savedScroll;
    }

    /**
     * Immediately update the Stagger switch disabled state in the preview when
     * Write Breaks is toggled — bridges the 150ms before the full preview patch.
     */
    _patchEnableRow(deptKey) {
        const isEnabled  = this._model.getEnabledDepartments().has(deptKey);
        const escapedKey = deptKey.replace(/"/g, '\\"');
        const card       = this._root.querySelector(`.wizard-workspace-preview-content [data-dept-key="${escapedKey}"]`);
        if (!card) return;
        card.classList.toggle('is-breaks-off', !isEnabled);
        const staggerCb = card.querySelector('[data-preview-stagger]');
        if (staggerCb && !staggerCb.closest('.wizard-preview-toggle.is-group-locked')) {
            staggerCb.disabled = !isEnabled;
        }
    }

    _hasPriorRun() {
        return this._storage.get('wizardSelectedDepartments', []).length > 0;
    }

    _buildCallbacks() {
        return {
            // Landing
            onStart: () => this._handleStart(),

            // Have-file / Export-help
            onChoice: (next) => {
                if (next === 'export-help') this._tutorialStep = 0;
                this._model.goTo(next);
            },
            onTutorialNext:  () => this._tutorialNext(),
            onTutorialPrev:  () => this._tutorialPrev(),
            onShowTutorial:  () => { this._tutorialStep = 0; this._model.goTo('export-help'); },

            // Upload
            onFileSelected: (file) => this._handleFileSelected(file),

            // Workspace nav panel selection
            onSelectPanel: (name) => {
                this._openPanel = this._openPanel === name ? null : name;
                this._render();
            },

            // Dept toggles live in the preview; surgical patch avoids panel flash.
            onToggleDept:           (key) => { this._model.toggleDepartment(key); this._scheduleAutoRun(); },
            onToggleBreakEnabled:   (key) => { this._model.toggleBreakEnabled(key); this._patchEnableRow(key); this._scheduleAutoRun(); },
            onSelectAllDepts:       () => { this._setAllDepartmentsSelected(true);  this._scheduleAutoRun(); this._render(); },
            onSelectNoneDepts:      () => { this._setAllDepartmentsSelected(false); this._scheduleAutoRun(); this._render(); },
            onEnableAllDepts:       () => { this._setAllDepartmentsEnabled(true);   this._scheduleAutoRun(); this._render(); },
            onEnableNoneDepts:      () => { this._setAllDepartmentsEnabled(false);  this._scheduleAutoRun(); this._render(); },
            onUngroup:              (id) => this._ungroupCoverageGroup(id),
            onMoveDeptToGroup:      (key, groupId) => this._moveDeptToGroup(key, groupId),
            onMoveDeptToStandalone: (key) => this._moveDeptToStandalone(key),
            onDropDeptOnDept:       (src, tgt) => this._dropDeptOnDept(src, tgt),
            onRenameGroup:          (id) => this._renameCoverageGroup(id),
            onDeleteAllGroups:      () => this._deleteAllCoverageGroups(),

            // Workspace actions
            onDownload: () => this._handleDownload(),
            onRestart:  () => this._handleRestart(),

            // Generic nav
            onContinue: () => this._handleContinue(),
            onBack:     () => this._handleBack()
        };
    }

    // ── Step handlers ────────────────────────────────────────────────────────

    _handleStart() {
        this._model.goTo(this._hasPriorRun() ? 'upload' : 'have-file');
    }

    _tutorialNext() {
        const last = TUTORIAL_STEPS.length - 1;
        if (this._tutorialStep < last) {
            this._tutorialStep += 1;
            this._render();
        } else {
            this._tutorialStep = 0;
            this._model.goTo('upload');
        }
    }

    _tutorialPrev() {
        if (this._tutorialStep > 0) {
            this._tutorialStep -= 1;
            this._render();
        } else {
            this._model.back();
        }
    }

    _handleContinue() {
        const step = this._model.getStep();
        const transitions = { 'export-help': 'upload', 'upload': 'workspace' };
        const next = transitions[step];
        if (next) {
            this._model.goTo(next);
            if (next === 'workspace') this._scheduleAutoRun(0);
        }
    }

    _handleBack() {
        this._model.back();
    }

    async _handleFileSelected(file) {
        const buffer = await file.arrayBuffer();
        const { rowData, isValid, error } = await this._excel.parseWorkbook(buffer);
        if (!isValid) { window.alert(error || 'Invalid file.'); return; }

        const dailySchedules = this._excel.splitIntoDailySchedules(rowData);
        if (!dailySchedules.length) { window.alert('No valid schedule found in the uploaded file.'); return; }

        const day                 = dailySchedules[0];
        const detectedDepartments = this._detectDepartments(day.rows);

        const persisted    = new Set(this._storage.get('wizardSelectedDepartments', []));
        const detectedKeys = detectedDepartments.map(d => `${d.main}|${d.sub}`);
        const initialSelection = persisted.size > 0
            ? new Set(detectedKeys.filter(k => persisted.has(k)))
            : new Set(detectedDepartments
                .filter(d => DEFAULT_STAGGERED_MAINS.has(d.main.trim().toLowerCase()))
                .map(d => `${d.main}|${d.sub}`));

        const storedEnabled  = this._storage.get('wizardEnabledDepartments', null);
        const initialEnabled = storedEnabled !== null
            ? new Set(detectedKeys.filter(k => storedEnabled.includes(k)))
            : new Set(detectedKeys);

        this._model.setUpload({ file, rows: day.rows, date: day.date, detectedDepartments });
        this._model.setSelectedDepartments(initialSelection);
        this._model.setEnabledDepartments(initialEnabled);
    }

    // ── Auto-run ─────────────────────────────────────────────────────────────

    _scheduleAutoRun(delay = 150) {
        clearTimeout(this._autoRunTimer);
        this._autoRunTimer = setTimeout(() => this._doAutoRun(), delay);
    }

    async _doAutoRun() {
        const upload = this._model.getUpload();
        if (!upload.rows) return;

        const wsEl = this._root.querySelector('[data-step="workspace"]');
        wsEl?.classList.add('is-running');
        await new Promise(r => requestAnimationFrame(r));

        const result = this._computeSchedule();

        wsEl?.classList.remove('is-running');
        if (!result) return;

        if (!this._hasRunOnce) {
            this._hasRunOnce = true;
            await this._animateBreaks(result.events, 1800);
            this._model.setResult(result);
            this._render();
        } else {
            this._model.setResult(result);
            this._patchWorkspacePreview();
            this._showQuickToasts(result.events);
        }
    }

    _computeSchedule() {
        const upload = this._model.getUpload();
        if (!upload.rows || !upload.date) return null;

        try {
            const selected     = this._model.getSelectedDepartments();
            const enabled      = this._model.getEnabledDepartments();
            const groupsForRun = this._groups.getAll()
                .map(g => ({
                    ...g,
                    departments: g.departments.filter(d => selected.has(`${d.main}|${d.sub}`))
                }))
                .filter(g => g.departments.length > 0);

            const rowsCopy  = upload.rows.map(r => r ? [...r] : r);
            const ws        = this._excel.createSheet(rowsCopy);
            this._excel.deleteColumnD(ws, rowsCopy);

            const dataStart = this._detectDataStart(rowsCopy);

            const disabledEmployees = new Set();
            let curDept = '';
            for (let i = dataStart; i < rowsCopy.length; i++) {
                const row = rowsCopy[i];
                if (!row) continue;
                if (row[0] && !row[2]) { curDept = String(row[0]).trim(); continue; }
                if (!row[2]) continue;
                const job = row[1] ? String(row[1]).trim() : '';
                if (!enabled.has(`${curDept}|${job}`)) disabledEmployees.add(formatName(String(row[2])));
            }

            const events = [];
            const { breaks, segments } = scheduleBreaks(rowsCopy, {
                operatingHours:   { startTime: 0, endTime: 1439 },
                groups:           groupsForRun,
                advancedSettings: this._settings.getAdvancedSettings(),
                enableLogging:    false,
                dataStart,
                shiftColumnIndex: 3,
                onEvent: (e) => events.push(e)
            });

            for (const name of disabledEmployees) {
                if (breaks[name]) breaks[name] = { rest1: null, meal: null, rest2: null, rest3: null };
            }

            this._excel.writeBreaks(ws, segments, breaks, dataStart - 1, minutesToTime);
            this._excel.applyScheduleStyling(ws, rowsCopy);

            const wb = this._excel.createWorkbook();
            this._excel.appendSheet(wb, ws, 'Schedule');

            return {
                breaks,
                segments,
                workbook: wb,
                filename: `Break Schedule ${upload.date}.xlsx`,
                events:   events.filter(e => !disabledEmployees.has(e.name))
            };
        } catch (e) {
            console.error('Schedule computation failed:', e); // eslint-disable-line no-console
            return null;
        }
    }

    _showQuickToasts(events) {
        clearToasts();
        const notable = (events || [])
            .filter(e => e.type === 'placed' && e.conflictedWith && e.slot === 'meal')
            .slice(0, 2);
        for (const ev of notable) {
            showToast(
                `${ev.name}: meal at ${minutesToTime(ev.time)} (avoiding ${ev.conflictedWith})`,
                { tone: 'shift', duration: 2500 }
            );
        }
    }

    async _animateBreaks(events, totalMs = 1800) {
        const previewEl = this._root.querySelector('.wizard-workspace-preview-content')
            || this._root.querySelector('.wizard-stage-content');

        if (!previewEl) {
            await new Promise(r => setTimeout(r, 300));
            return;
        }

        const placedEvents = (events || []).filter(e => e.type === 'placed');
        if (!placedEvents.length) return;

        const toastSet   = new Set(placedEvents.filter(e => e.conflictedWith && e.slot === 'meal').slice(0, 4));
        const perEventMs = Math.max(10, Math.min(60, Math.floor(totalMs / placedEvents.length)));

        clearToasts();
        for (const ev of placedEvents) {
            addBreakToPreview(previewEl, ev.name, ev.slot, ev.time);
            if (toastSet.has(ev)) {
                showToast(
                    `${ev.name} ${ev.slot === 'meal' ? 'meal' : 'rest break'} would conflict with ${ev.conflictedWith}. Placing at ${minutesToTime(ev.time)}.`,
                    { tone: 'shift', duration: 3000 }
                );
            }
            await new Promise(r => setTimeout(r, perEventMs));
        }
        await new Promise(r => setTimeout(r, 300));
    }

    // ── Workspace actions ────────────────────────────────────────────────────

    async _handleDownload() {
        const result = this._model.getResult();
        if (!result?.workbook) return;
        await this._excel.download(result.workbook, result.filename);
    }

    _handleRestart() {
        if (!window.confirm('Upload a different file? This will clear the current schedule.')) return;
        this._hasRunOnce = false;
        this._openPanel  = null;
        this._model.setResult(null);
        this._model.clearUpload();
        this._model.goTo('upload');
    }

    // ── Department / group management ────────────────────────────────────────

    _setAllDepartmentsSelected(all) {
        const detected = this._model.getUpload().detectedDepartments || [];
        this._model.setSelectedDepartments(
            all ? new Set(detected.map(d => `${d.main}|${d.sub}`)) : new Set()
        );
    }

    _setAllDepartmentsEnabled(all) {
        const detected = this._model.getUpload().detectedDepartments || [];
        this._model.setEnabledDepartments(
            all ? new Set(detected.map(d => `${d.main}|${d.sub}`)) : new Set()
        );
    }

    _ungroupCoverageGroup(id) {
        const label = this._groups.getAll().find(g => g.id === id)?.name || 'Group';
        this._groups.delete(id);
        showToast(`Disbanded "${label}"`, { tone: 'info' });
        this._scheduleAutoRun();
        this._render();
    }

    _renameCoverageGroup(id) {
        const group = this._groups.getAll().find(g => g.id === id);
        if (!group) return;
        const next = window.prompt('Rename this coverage group:', group.name);
        if (!next?.trim() || next === group.name) return;
        this._groups.update(group.id, next.trim(), group.departments);
        this._render();
    }

    _deleteAllCoverageGroups() {
        const all = this._groups.getAll();
        if (!all.length) return;
        if (!window.confirm(`Delete all ${all.length} coverage ${all.length === 1 ? 'group' : 'groups'}? Their departments will become standalone.`)) return;
        for (const g of all) this._groups.delete(g.id);
        showToast('All groups deleted', { tone: 'info', duration: 2200 });
        this._scheduleAutoRun();
        this._render();
    }

    _moveDeptToGroup(deptKey, groupId) {
        const allGroups   = this._groups.getAll();
        const sourceGroup = this._findGroupForDept(deptKey, allGroups);
        if (sourceGroup?.id === groupId) return;

        const label = this._friendlyDeptLabel(deptKey);
        if (sourceGroup) {
            this._removeDeptFromGroup(sourceGroup, deptKey);
            showToast(`Removed ${label} from "${sourceGroup.name}"`, { tone: 'info', duration: 2200 });
        }
        const target = allGroups.find(g => g.id === groupId);
        if (target) {
            const [main, sub] = deptKey.split('|');
            this._groups.update(target.id, target.name,
                [...target.departments.filter(d => `${d.main}|${d.sub}` !== deptKey), { main, sub }]);
            showToast(`Added ${label} to "${target.name}"`, { tone: 'success', duration: 2200 });

            // Groups are always customer facing — auto-select when joining.
            const next = new Set(this._model.getSelectedDepartments());
            next.add(deptKey);
            this._model.setSelectedDepartments(next);
        }
        this._scheduleAutoRun();
        this._render();
    }

    _moveDeptToStandalone(deptKey) {
        const sourceGroup = this._findGroupForDept(deptKey, this._groups.getAll());
        if (!sourceGroup) return;
        this._removeDeptFromGroup(sourceGroup, deptKey);
        showToast(`Removed ${this._friendlyDeptLabel(deptKey)} from "${sourceGroup.name}"`, { tone: 'info', duration: 2200 });
        this._scheduleAutoRun();
        this._render();
    }

    _dropDeptOnDept(sourceKey, targetKey) {
        if (sourceKey === targetKey) return;
        const allGroups   = this._groups.getAll();
        const sourceGroup = this._findGroupForDept(sourceKey, allGroups);
        const targetGroup = this._findGroupForDept(targetKey, allGroups);

        if (targetGroup)      this._moveDeptToGroup(sourceKey, targetGroup.id);
        else if (sourceGroup) this._moveDeptToGroup(targetKey, sourceGroup.id);
        else {
            const [m1, s1] = sourceKey.split('|');
            const [m2, s2] = targetKey.split('|');
            const groupName = s2 || m2;
            this._groups.add(groupName, [{ main: m1, sub: s1 }, { main: m2, sub: s2 }]);

            // Auto-select both founding members (groups always stagger).
            const next = new Set(this._model.getSelectedDepartments());
            next.add(sourceKey);
            next.add(targetKey);
            this._model.setSelectedDepartments(next);

            showToast(`Created "${groupName}" group`, { tone: 'success', duration: 2200 });
            this._scheduleAutoRun();
            this._render();
        }
    }

    _findGroupForDept(deptKey, allGroups) {
        const [main, sub] = deptKey.split('|');
        return allGroups.find(g => g.departments.some(d => d.main === main && d.sub === sub));
    }

    _friendlyDeptLabel(deptKey) {
        const [, sub] = deptKey.split('|');
        return sub || deptKey;
    }

    _removeDeptFromGroup(group, deptKey) {
        const filtered = group.departments.filter(d => `${d.main}|${d.sub}` !== deptKey);
        if (filtered.length < 2) this._groups.delete(group.id);
        else                     this._groups.update(group.id, group.name, filtered);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    _detectDepartments(rows) {
        const dataStart = this._detectDataStart(rows);
        const buckets   = new Map();
        let currentMain = '';

        for (let i = dataStart; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            if (row[0] && !row[2]) { currentMain = String(row[0]).trim(); continue; }
            if (!row[2]) continue;

            const sub      = row[1] ? String(row[1]).trim() : '';
            const name     = formatName(String(row[2]));
            const shiftStr = row[4] ? String(row[4]).trim() : '';
            const [start, end] = parseShiftInterval(shiftStr);
            if (start === 0 && end === 0) continue;

            const key = `${currentMain}|${sub}`;
            if (!buckets.has(key)) buckets.set(key, { main: currentMain, sub, employees: [] });
            const bucket = buckets.get(key);
            if (!bucket.employees.find(e => e.name === name)) {
                bucket.employees.push({ name, shift: shiftStr });
            }
        }
        return Array.from(buckets.values());
    }

    _detectDataStart(rows) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row && typeof row[2] === 'string' && row[2].trim().toLowerCase() === 'name') return i + 1;
        }
        return 8;
    }
}
