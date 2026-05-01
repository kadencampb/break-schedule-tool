import { WizardModel } from './WizardModel.js';
import { WizardView } from './WizardView.js';
import { scheduleBreaks } from '../core/BreakScheduler.js';
import { formatName, parseShiftInterval, minutesToTime } from '../core/helpers.js';
import { addBreakToPreview } from './SchedulePreview.js';
import { showToast, clearToasts } from './Toast.js';
import { openCustomize } from './CustomizeOverlay.js';
import { TUTORIAL_STEPS } from './UkgMock.js';

/** Customer-facing main departments whose subdepts default to "staggered" on
 *  first upload. Compared case-insensitively against trimmed main-dept names. */
const DEFAULT_STAGGERED_MAINS = new Set([
    'frontline',
    'hardgoods',
    'softgoods',
    'shop'
]);

/**
 * WizardController — orchestrates the guided break-scheduling experience.
 *
 * Composes existing services (SettingsModel, CoverageGroupModel, ExcelFacade)
 * rather than duplicating them. Owns the step state machine and renders the
 * view whenever model state changes.
 */
export class WizardController {
    /**
     * @param {Object} deps
     * @param {StorageFacade}      deps.storage
     * @param {ExcelFacade}        deps.excel
     * @param {SettingsModel}      deps.settings
     * @param {CoverageGroupModel} deps.groups
     * @param {HTMLElement}        deps.root  - wizardRoot element
     */
    constructor({ storage, excel, settings, groups, root }) {
        this._storage  = storage;
        this._excel    = excel;
        this._settings = settings;
        this._groups   = groups;
        this._root     = root;

        this._model = new WizardModel(storage);
        this._view  = new WizardView(root);

        // Per-step ephemeral UI state (controller-local)
        this._editingScheduleId = null;
        this._tutorialStep      = 0;     // index into the export-help sub-steps
        this._editFromReview    = false; // when true, Next from edit destination returns to review
    }

    init() {
        // Any model-state change re-renders the wizard
        for (const ev of ['step', 'upload', 'selected-departments', 'schedules', 'result']) {
            this._model.subscribe(`change:${ev}`, () => this._render());
        }
        this._render();
    }

    // ── Render ──────────────────────────────────────────────────────────────

    _render() {
        this._view.render({
            step:                 this._model.getStep(),
            upload:               this._model.getUpload(),
            selectedDepartments:  this._model.getSelectedDepartments(),
            advancedSettings:     this._settings.getAdvancedSettings(),
            schedules:            this._model.getSchedules(),
            assignedDays:         this._model.getAssignedDayKeys(),
            editingScheduleId:    this._editingScheduleId,
            tutorialStep:         this._tutorialStep,
            editMode:             this._editFromReview,
            coverageGroups:       this._groups.getAll(),
            result:               this._model.getResult(),
            hasPriorRun:          this._hasPriorRun()
        }, this._buildCallbacks());
    }

    /** True iff the user has completed the wizard at least once. */
    _hasPriorRun() {
        const persistedDepts = this._storage.get('wizardSelectedDepartments', []);
        const persistedScheds = this._storage.get('wizardSchedules', []);
        return persistedDepts.length > 0 || persistedScheds.length > 0;
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

            // Tutorial nav (export-help)
            onTutorialNext:    () => this._tutorialNext(),
            onTutorialPrev:    () => this._tutorialPrev(),
            onShowTutorial:    () => { this._tutorialStep = 0; this._model.goTo('export-help'); },

            // Upload
            onFileSelected: (file) => this._handleFileSelected(file),

            // Departments
            onToggleDept:           (key) => this._model.toggleDepartment(key),
            onSelectAllDepts:       () => this._setAllDepartmentsSelected(true),
            onSelectNoneDepts:      () => this._setAllDepartmentsSelected(false),
            onUngroup:              (id) => this._ungroupCoverageGroup(id),
            onMoveDeptToGroup:      (key, groupId) => this._moveDeptToGroup(key, groupId),
            onMoveDeptToStandalone: (key) => this._moveDeptToStandalone(key),
            onDropDeptOnDept:       (src, tgt) => this._dropDeptOnDept(src, tgt),
            onSetGroupSelection:    (id, checked) => this._setGroupSelection(id, checked),
            onRenameGroup:          (id) => this._renameCoverageGroup(id),
            onDeleteAllGroups:      () => this._deleteAllCoverageGroups(),

            // Hours / schedules
            onSaveSchedule:    (data) => this._saveSchedule(data),
            onUpdateSchedule:  (id, data) => this._updateSchedule(id, data),
            onDeleteSchedule:  (id) => this._deleteSchedule(id),
            onEditSchedule:    (id) => this._editSchedule(id),
            onCancelEdit:      () => this._cancelEditSchedule(),
            onAddAnother:      () => this._addAnotherSchedule(),

            // Review
            onCustomize:  (anchor) => this._openCustomize(anchor),
            onChangeStep: (step) => this._jumpFromReview(step),

            // Done
            onDownload:       () => this._handleDownload(),
            onAdjustSettings: () => this._handleAdjustSettings(),
            onRestart:        () => this._handleRestart(),

            // Generic step nav
            onContinue: () => this._handleContinue(),
            onBack:     () => this._handleBack()
        };
    }

    // ── Step handlers ───────────────────────────────────────────────────────

    _handleStart() {
        // First-time users see the have-file prompt; returning users skip it.
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

        // If the user came in via "Change" on the review step, return them
        // to review after one Next press from the destination step.
        if (this._editFromReview && step !== 'review' && step !== 'upload') {
            this._editFromReview = false;
            this._model.goTo('review');
            return;
        }

        // Streamlined flow: when the user has already configured everything in a
        // prior run (schedules + dept selections), jump straight to review.
        if (step === 'upload' && this._canStreamline()) {
            this._model.goTo('review');
            return;
        }

        const transitions = {
            'export-help': 'upload',
            'upload':      'state',
            'state':       'departments',
            'departments': 'hours',
            'hours':       'review',
            'review':      'running'
        };
        const next = transitions[step];
        if (next === 'running') {
            this._model.goTo('running');
            this._runScheduler();
        } else if (next) {
            this._model.goTo(next);
        }
    }

    _canStreamline() {
        const allDaysCovered = this._model.getAssignedDayKeys().size === 7;
        const hasSelections  = this._model.getSelectedDepartments().size > 0;
        return allDaysCovered && hasSelections;
    }

    _jumpFromReview(stepName) {
        this._editFromReview = true;
        this._model.goTo(stepName);
    }

    _handleBack() {
        if (this._model.getStep() === 'done') return;
        // If editing from review, Cancel returns straight to review
        if (this._editFromReview) {
            this._editFromReview = false;
            this._model.goTo('review');
            return;
        }
        this._model.back();
    }

    async _handleFileSelected(file) {
        const buffer = await file.arrayBuffer();
        const { rowData, isValid, error } = this._excel.parseWorkbook(buffer);
        if (!isValid) {
            window.alert(error || 'Invalid file.');
            return;
        }

        const dailySchedules = this._excel.splitIntoDailySchedules(rowData);
        if (!dailySchedules.length) {
            window.alert('No valid schedule found in the uploaded file.');
            return;
        }

        // Phase 1: handle the first day in a multi-day workbook
        const day = dailySchedules[0];
        const detectedDepartments = this._detectDepartments(day.rows);

        // Pre-fill selection: prefer the persisted set (intersected with what's
        // actually in this file). On first run, default to subdepartments under
        // the customer-facing main departments (Frontline, Hardgoods, Softgoods,
        // Shop) — anything else stays unstaggered until the user opts in.
        const persisted = new Set(this._storage.get('wizardSelectedDepartments', []));
        const detectedKeys = detectedDepartments.map(d => `${d.main}|${d.sub}`);
        const initialSelection = persisted.size > 0
            ? new Set(detectedKeys.filter(k => persisted.has(k)))
            : new Set(detectedDepartments
                .filter(d => DEFAULT_STAGGERED_MAINS.has(d.main.trim().toLowerCase()))
                .map(d => `${d.main}|${d.sub}`));

        this._model.setUpload({ file, rows: day.rows, date: day.date, detectedDepartments });
        this._model.setSelectedDepartments(initialSelection);

        // Auto-advance into the next step (state, or review when streamlined)
        this._handleContinue();
    }

    _setAllDepartmentsSelected(all) {
        const detected = this._model.getUpload().detectedDepartments || [];
        const next = all ? new Set(detected.map(d => `${d.main}|${d.sub}`)) : new Set();
        this._model.setSelectedDepartments(next);
    }

    _ungroupCoverageGroup(id) {
        const group = this._groups.getAll().find(g => g.id === id);
        const label = group?.name || 'Group';
        this._groups.delete(id);
        showToast(`Disbanded "${label}"`, { tone: 'info' });
        this._render();
    }

    _renameCoverageGroup(id) {
        const group = this._groups.getAll().find(g => g.id === id);
        if (!group) return;
        const next = window.prompt('Rename this coverage group:', group.name);
        if (!next || !next.trim() || next === group.name) return;
        this._groups.update(group.id, next.trim(), group.departments);
        this._render();
    }

    _deleteAllCoverageGroups() {
        const all = this._groups.getAll();
        if (all.length === 0) return;
        const ok = window.confirm(
            `Delete all ${all.length} coverage ${all.length === 1 ? 'group' : 'groups'}? ` +
            `Their departments will become standalone. This can’t be undone from here.`
        );
        if (!ok) return;
        for (const g of all) this._groups.delete(g.id);
        showToast('All groups deleted', { tone: 'info', duration: 2200 });
        this._render();
    }

    /** Drag-and-drop: move a department into an existing coverage group. */
    _moveDeptToGroup(deptKey, groupId) {
        const allGroups = this._groups.getAll();
        const sourceGroup = this._findGroupForDept(deptKey, allGroups);
        if (sourceGroup?.id === groupId) return;

        const deptLabel = this._friendlyDeptLabel(deptKey);

        // Remove from source group (if any)
        if (sourceGroup) {
            this._removeDeptFromGroup(sourceGroup, deptKey);
            showToast(`Removed ${deptLabel} from "${sourceGroup.name}"`, { tone: 'info', duration: 2200 });
        }

        // Add to target group
        const target = allGroups.find(g => g.id === groupId);
        if (target) {
            const [main, sub] = deptKey.split('|');
            const newDepts = [...target.departments.filter(d => `${d.main}|${d.sub}` !== deptKey), { main, sub }];
            this._groups.update(target.id, target.name, newDepts);
            showToast(`Added ${deptLabel} to "${target.name}"`, { tone: 'success', duration: 2200 });
        }
        this._render();
    }

    /** Drag-and-drop: pull a department out of any group. */
    _moveDeptToStandalone(deptKey) {
        const allGroups = this._groups.getAll();
        const sourceGroup = this._findGroupForDept(deptKey, allGroups);
        if (!sourceGroup) return;
        const deptLabel = this._friendlyDeptLabel(deptKey);
        this._removeDeptFromGroup(sourceGroup, deptKey);
        showToast(`Removed ${deptLabel} from "${sourceGroup.name}"`, { tone: 'info', duration: 2200 });
        this._render();
    }

    /**
     * Drag-and-drop: drop one dept on another. Behavior depends on group
     * membership of source and target:
     *   • target is in a group  → source joins that group
     *   • source is in a group  → target joins source's group
     *   • both standalone       → create a new group containing both
     */
    _dropDeptOnDept(sourceKey, targetKey) {
        if (sourceKey === targetKey) return;
        const allGroups = this._groups.getAll();
        const sourceGroup = this._findGroupForDept(sourceKey, allGroups);
        const targetGroup = this._findGroupForDept(targetKey, allGroups);

        if (targetGroup) {
            this._moveDeptToGroup(sourceKey, targetGroup.id);
        } else if (sourceGroup) {
            this._moveDeptToGroup(targetKey, sourceGroup.id);
        } else {
            // No prompt — just create with a default name. User can rename via the group's
            // rename button when they're ready.
            const [m1, s1] = sourceKey.split('|');
            const [m2, s2] = targetKey.split('|');
            this._groups.add('Untitled Group', [{ main: m1, sub: s1 }, { main: m2, sub: s2 }]);
            showToast('Created new group', { tone: 'success', duration: 2200 });
            this._render();
        }
    }

    _findGroupForDept(deptKey, allGroups) {
        const [main, sub] = deptKey.split('|');
        return (allGroups || this._groups.getAll())
            .find(g => g.departments.some(d => d.main === main && d.sub === sub));
    }

    _friendlyDeptLabel(deptKey) {
        const [, sub] = deptKey.split('|');
        return sub || deptKey;
    }

    _removeDeptFromGroup(group, deptKey) {
        const filtered = group.departments.filter(d => `${d.main}|${d.sub}` !== deptKey);
        // A group with fewer than 2 depts is meaningless — auto-disband so the
        // lone dept becomes standalone again.
        if (filtered.length < 2) this._groups.delete(group.id);
        else                     this._groups.update(group.id, group.name, filtered);
    }

    /** Toggle every dept in a coverage group's selection state at once. */
    _setGroupSelection(groupId, checked) {
        const group = this._groups.getAll().find(g => g.id === groupId);
        if (!group) return;
        const next = new Set(this._model.getSelectedDepartments());
        for (const d of group.departments) {
            const key = `${d.main}|${d.sub}`;
            if (checked) next.add(key);
            else         next.delete(key);
        }
        this._model.setSelectedDepartments(next);
    }

    // ── Schedules ───────────────────────────────────────────────────────────

    _saveSchedule({ open, close, days }) {
        this._model.addSchedule({ open, close, days });
        this._editingScheduleId = null;
        this._syncSchedulesToSettings();
    }

    _updateSchedule(id, { open, close, days }) {
        this._model.updateSchedule(id, { open, close, days });
        this._editingScheduleId = null;
        this._syncSchedulesToSettings();
    }

    _deleteSchedule(id) {
        this._model.deleteSchedule(id);
        if (this._editingScheduleId === id) this._editingScheduleId = null;
        this._syncSchedulesToSettings();
    }

    _editSchedule(id) {
        this._editingScheduleId = id;
        this._render();
    }

    _cancelEditSchedule() {
        this._editingScheduleId = null;
        this._render();
    }

    _addAnotherSchedule() {
        this._editingScheduleId = null;
        this._render();
    }

    /**
     * Flatten the wizard's schedule list into a hoursByDay dict and persist
     * via SettingsModel so the rest of the app (scheduler, etc.) sees it.
     * Days that aren't covered keep their existing hours (the wizard's
     * Continue button is locked until all 7 are assigned anyway).
     */
    _syncSchedulesToSettings() {
        const schedules = this._model.getSchedules();
        if (schedules.length === 0) return;
        const next = { ...this._settings.getHoursByDay() };
        for (const s of schedules) {
            for (const day of s.days) next[day] = { start: s.open, end: s.close };
        }
        this._settings.setHoursByDay(next);
    }

    _openCustomize(anchor) {
        // Reparent the legacy advanced-settings panel into a modal overlay so
        // its existing graphic editors (rest-period, meal-placement, segmented
        // controls) keep working with the same bindings. Re-render when the
        // modal closes so the review summary reflects any edits.
        openCustomize({ anchor, onClose: () => this._render() });
    }

    // ── Run + download ──────────────────────────────────────────────────────

    async _runScheduler() {
        // Yield once so the running-step renders before we start computing.
        await new Promise(r => setTimeout(r, 50));

        const upload = this._model.getUpload();
        if (!upload.rows || !upload.date) return;

        // Filter coverage groups to only the user-selected departments
        const selected = this._model.getSelectedDepartments();
        const allGroups = this._groups.getAll();
        const groupsForRun = allGroups.map(g => ({
            ...g,
            departments: g.departments.filter(d => selected.has(`${d.main}|${d.sub}`))
        })).filter(g => g.departments.length > 0);

        const advSettings    = this._settings.getAdvancedSettings();
        const operatingHours = this._settings.getOperatingHoursForDate(upload.date);

        // Build the workbook in memory; the scheduler runs synchronously while
        // we capture all decision events for the animated replay below.
        const wb = this._excel.createWorkbook();
        const rowsCopy = upload.rows.map(r => r ? [...r] : r);
        const ws = this._excel.createSheet(rowsCopy);
        this._excel.deleteColumnD(ws, rowsCopy);

        const dataStart = this._detectDataStart(rowsCopy);
        const events = [];
        const { breaks, segments } = scheduleBreaks(rowsCopy, {
            operatingHours,
            groups: groupsForRun,
            advancedSettings: advSettings,
            enableLogging: false,
            dataStart,
            shiftColumnIndex: 3,
            onEvent: (e) => events.push(e)
        });

        this._excel.writeBreaks(ws, segments, breaks, dataStart - 1, minutesToTime);
        this._excel.applyScheduleStyling(ws, rowsCopy);
        this._excel.appendSheet(wb, ws, 'Schedule');

        // ── Animated replay ────────────────────────────────────────────────
        // The scheduler ran synchronously; replay the decisions one at a time
        // so the user sees each break appear in the preview, with toasts for
        // "interesting" decisions (shifts to avoid stacking with a coworker).
        await this._animateBreaks(events);

        this._model.setResult({
            breaks,
            segments,
            workbook: wb,
            filename: `Break Schedule ${upload.date}.xlsx`
        });
        this._model.goTo('done');
    }

    /**
     * Replay the scheduler's events with timing so the user sees each break
     * pop into the preview. Pulls a few "interesting" shifts out as toasts,
     * and updates the running-step sidebar with current progress + employee.
     */
    async _animateBreaks(events) {
        const previewEl = this._root.querySelector('.wizard-stage-content');
        const progressEl = this._root.querySelector('[data-running-progress]');
        const nameEl     = this._root.querySelector('[data-running-name]');
        const statEl     = this._root.querySelector('[data-running-stat]');

        if (!previewEl) {
            await new Promise(r => setTimeout(r, 200));
            return;
        }

        const placedEvents = events.filter(e => e.type === 'placed');
        if (placedEvents.length === 0) return;

        // Pick up to 4 toasts: meal shifts due to coworker conflict
        const interesting = placedEvents.filter(e => e.conflictedWith && e.slot === 'meal');
        const toastSet = new Set(interesting.slice(0, 4));

        // ~4 second total budget regardless of event count
        const totalMs = 4000;
        const perEventMs = Math.max(20, Math.min(120, Math.floor(totalMs / placedEvents.length)));

        if (statEl) statEl.textContent = `0 of ${placedEvents.length} breaks placed`;

        clearToasts();
        for (let i = 0; i < placedEvents.length; i++) {
            const ev = placedEvents[i];
            addBreakToPreview(previewEl, ev.name, ev.slot, ev.time);

            // Update sidebar live indicators
            if (nameEl)     nameEl.textContent = ev.name;
            if (progressEl) progressEl.style.width = `${((i + 1) / placedEvents.length) * 100}%`;
            if (statEl)     statEl.textContent = `${i + 1} of ${placedEvents.length} breaks placed`;

            if (toastSet.has(ev)) {
                const slotLabel = ev.slot === 'meal' ? 'meal' : 'rest break';
                showToast(
                    `${ev.name} ${slotLabel} would conflict with ${ev.conflictedWith}. Placing at ${minutesToTime(ev.time)}.`,
                    { tone: 'shift', duration: 3000 }
                );
            }
            await new Promise(r => setTimeout(r, perEventMs));
        }

        if (nameEl) nameEl.textContent = 'Done';
        await new Promise(r => setTimeout(r, 500));
    }

    _handleDownload() {
        const result = this._model.getResult();
        if (!result?.workbook) return;
        this._excel.download(result.workbook, result.filename);
    }

    /** Done → review: keep the upload, drop the result so the user can tweak
     *  settings and re-run without re-uploading. */
    _handleAdjustSettings() {
        this._model.setResult(null);
        this._model.goTo('review');
    }

    /** Done → upload: clear the upload + result for a fresh schedule. */
    _handleRestart() {
        this._model.setResult(null);
        this._model.clearUpload();
        this._model.goTo('upload');
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    /**
     * Walk parsed rows and bucket employees by (main dept, subdept). Each
     * employee entry carries the raw shift string from the row so the preview
     * can display it.
     */
    _detectDepartments(rows) {
        const dataStart = this._detectDataStart(rows);
        const buckets = new Map();
        let currentMain = '';

        for (let i = dataStart; i < rows.length; i++) {
            const row = rows[i];
            if (!row) continue;
            if (row[0] && !row[2]) {
                currentMain = String(row[0]).trim();
                continue;
            }
            if (!row[2]) continue;

            const sub = row[1] ? String(row[1]).trim() : '';
            const name = formatName(String(row[2]));
            const shiftCol = 4; // raw rows pre-deleteColumnD: shift in col E (idx 4)
            const shiftStr = row[shiftCol] ? String(row[shiftCol]).trim() : '';
            const [start, end] = parseShiftInterval(shiftStr);
            if (start === 0 && end === 0) continue;

            const key = `${currentMain}|${sub}`;
            let bucket = buckets.get(key);
            if (!bucket) {
                bucket = { main: currentMain, sub, employees: [] };
                buckets.set(key, bucket);
            }
            // Same employee may have multiple shifts in the same dept (split shift
            // within one subdept). Keep the first occurrence; the second segment's
            // breaks will still get rendered against the same name.
            if (!bucket.employees.find(e => e.name === name)) {
                bucket.employees.push({ name, shift: shiftStr });
            }
        }

        return Array.from(buckets.values());
    }

    _detectDataStart(rows) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row && typeof row[2] === 'string' && row[2].trim().toLowerCase() === 'name') {
                return i + 1;
            }
        }
        return 8;
    }
}
