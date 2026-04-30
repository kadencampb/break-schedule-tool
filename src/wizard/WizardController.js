import { WizardModel } from './WizardModel.js';
import { WizardView } from './WizardView.js';
import { scheduleBreaks } from '../core/BreakScheduler.js';
import { formatName, parseShiftInterval, timeToMinutes, minutesToTime } from '../core/helpers.js';
import { DEFAULT_HOURS_BY_DAY } from '../core/constants.js';
import { addBreakToPreview } from './SchedulePreview.js';
import { showToast, clearToasts } from './Toast.js';
import { openCustomize } from './CustomizeOverlay.js';

/**
 * WizardController — orchestrates the guided break-scheduling experience.
 *
 * Composes existing services (SettingsModel, CoverageGroupModel, ExcelFacade,
 * SchedulerController) rather than duplicating them. Owns the step state
 * machine and renders WizardView whenever model state changes.
 */
export class WizardController {
    /**
     * @param {Object} deps
     * @param {StorageFacade}        deps.storage
     * @param {ExcelFacade}          deps.excel
     * @param {SettingsModel}        deps.settings
     * @param {CoverageGroupModel}   deps.groups
     * @param {SchedulerController}  deps.scheduler
     * @param {HTMLElement}          deps.root  - wizardRoot element
     */
    constructor({ storage, excel, settings, groups, scheduler, root }) {
        this._storage   = storage;
        this._excel     = excel;
        this._settings  = settings;
        this._groups    = groups;
        this._scheduler = scheduler;
        this._root      = root;

        this._model = new WizardModel(storage);
        this._view  = new WizardView(root);
    }

    init() {
        // Re-render whenever any wizard-state slice changes
        this._model.subscribe('change:step',                 () => this._render());
        this._model.subscribe('change:upload',               () => this._render());
        this._model.subscribe('change:selected-departments', () => this._render());
        this._model.subscribe('change:remember',             () => this._render());
        this._model.subscribe('change:result',               () => this._render());
        this._model.subscribe('change:schedules',            () => this._render());

        // Per-step ephemeral UI state (e.g., which schedule is being edited)
        this._editingScheduleId = null;
        this._tutorialStep = 0;   // index into the export-help sub-steps
        this._editFromReview = false;  // if true, "Next" on the destination returns to review

        this._render();
    }

    // ── Render ──────────────────────────────────────────────────────────────

    _render() {
        const state = {
            step:               this._model.getStep(),
            history:            [],   // currently unused at view layer
            remember:           this._model.getRemember(),
            upload:             this._model.getUpload(),
            selectedDepartments: this._model.getSelectedDepartments(),
            operatingHours:     this._settings.getHoursByDay(),
            advancedSettings:   this._settings.getAdvancedSettings(),
            schedules:          this._model.getSchedules(),
            assignedDays:       this._model.getAssignedDayKeys(),
            editingScheduleId:  this._editingScheduleId,
            tutorialStep:       this._tutorialStep,
            editMode:           this._editFromReview,
            coverageGroups:     this._groups.getAll(),
            result:             this._model.getResult(),
            hasPriorRun:        this._hasPriorRun()
        };

        this._view.render(state, this._buildCallbacks());
    }

    _hasPriorRun() {
        const remember = this._model.getRemember();
        if (Object.values(remember).some(Boolean)) return true;
        const persistedDepts = this._storage.get('wizardSelectedDepartments', []);
        return persistedDepts.length > 0;
    }

    _buildCallbacks() {
        return {
            // Landing
            onStart:   () => this._handleStart(),
            onRestart: () => this._handleRestart(),

            // Have-file / Export-help
            onChoice: (next) => {
                if (next === 'export-help') this._tutorialStep = 0;
                this._model.goTo(next);
            },

            // Tutorial nav (export-help)
            onTutorialNext:    () => this._tutorialNext(),
            onTutorialPrev:    () => this._tutorialPrev(),
            onTutorialFinish:  () => { this._tutorialStep = 0; this._model.goTo('upload'); },
            onShowTutorial:    () => { this._tutorialStep = 0; this._model.goTo('export-help'); },

            // Upload
            onFileSelected: (file) => this._handleFileSelected(file),

            // Departments
            onToggleDept:           (key) => this._model.toggleDepartment(key),
            onSelectAllDepts:       () => this._selectAllDepartments(true),
            onSelectNoneDepts:      () => this._selectAllDepartments(false),
            onUngroup:              (id) => this._ungroupCoverageGroup(id),
            onMoveDeptToGroup:      (key, groupId) => this._moveDeptToGroup(key, groupId),
            onMoveDeptToStandalone: (key) => this._moveDeptToStandalone(key),
            onDropDeptOnDept:       (src, tgt) => this._dropDeptOnDept(src, tgt),
            onSetGroupSelection:    (groupId, checked) => this._setGroupSelection(groupId, checked),
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
            onCustomize:    () => this._openLegacyCustomize(),
            onChangeStep:   (step) => this._jumpFromReview(step),

            // Done
            onDownload: () => this._handleDownload(),

            // Generic
            onContinue:        () => this._handleContinue(),
            onBack:            () => this._handleBack(),
            onRememberChange:  (key, value) => this._model.setRemember(key, value)
        };
    }

    // ── Step handlers ───────────────────────────────────────────────────────

    _handleStart() {
        const { haveFile } = this._model.getRemember();
        this._model.goTo(haveFile ? 'upload' : 'have-file');
    }

    _tutorialNext() {
        const TUTORIAL_LAST = 5; // 0..5 (6 sub-steps)
        if (this._tutorialStep < TUTORIAL_LAST) {
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
            // At the first sub-step → back out to the have-file choice
            this._model.back();
        }
    }

    _handleRestart() {
        this._model.clearUpload();
        this._model.setResult(null);
        this._model.goTo('have-file');
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

        const day = dailySchedules[0]; // phase-1: handle the first day only
        const detectedDepartments = this._detectDepartments(day.rows);

        // Pre-fill selection: if user has remembered selections that overlap
        // with what's detected, use those; otherwise select everything.
        const persisted = new Set(this._storage.get('wizardSelectedDepartments', []));
        const detectedKeys = detectedDepartments.map(d => `${d.main}|${d.sub}`);
        const useRemembered = this._model.getRemember().departments && persisted.size > 0;
        const initialSelection = useRemembered
            ? new Set(detectedKeys.filter(k => persisted.has(k)))
            : new Set(detectedKeys);

        this._model.setUpload({
            file,
            rows: day.rows,
            date: day.date,
            detectedDepartments
        });
        this._model.setSelectedDepartments(initialSelection);

        // Auto-advance: file is loaded, jump to the next configurable step
        this._handleContinue();
    }

    _selectAllDepartments(all) {
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
        // Re-render with editingScheduleId=null forces the "add" form to show
        // even when all days are covered.
        this._editingScheduleId = null;
        this._forceShowAddForm = true;
        this._render();
        this._forceShowAddForm = false;
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

    _openLegacyCustomize() {
        // Reparent the legacy advanced-settings panel into a modal overlay so
        // its existing graphic editors (rest-period, meal-placement, segmented
        // controls) keep working with the same bindings. Re-render the wizard
        // when the modal closes so the review summary reflects any edits.
        openCustomize({ onClose: () => this._render() });
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

// Helper export for tests / future use; currently unused at runtime.
export { DEFAULT_HOURS_BY_DAY, timeToMinutes };
