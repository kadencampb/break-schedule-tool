import { BaseModel } from '../models/BaseModel.js';

/**
 * WizardModel — state machine + persistent state for the guided experience.
 *
 * Owns:
 *   • current step + back-nav history (transient)
 *   • uploaded file metadata + parsed rows (transient)
 *   • department selection set (persisted)
 *   • operating-hours schedules (persisted)
 *   • most recent run result (transient)
 *
 * Existing settings (advanced settings, coverage groups, per-day hours dict)
 * live in their own models — this composes them.
 *
 * Events:
 *   'change:step'                — current step transitioned
 *   'change:upload'              — uploaded file or parsed schedule changed
 *   'change:selected-departments'— department selection changed
 *   'change:schedules'           — operating-hours schedule list changed
 *   'change:result'              — scheduler ran and produced a result
 */
export const STEPS = [
    'landing',
    'have-file',
    'export-help',
    'upload',
    'state',
    'departments',
    'hours',
    'review',
    'running',
    'done'
];

export class WizardModel extends BaseModel {
    /** @param {StorageFacade} storage */
    constructor(storage) {
        super();
        this._storage = storage;

        this._step    = 'landing';
        this._history = [];
        this._selectedDepartments = new Set(storage.get('wizardSelectedDepartments', []));
        this._schedules = storage.get('wizardSchedules', []);
        this._upload    = blankUpload();
        this._result    = null;
    }

    // ── Step ─────────────────────────────────────────────────────────────────

    getStep() { return this._step; }

    /** Transition to a new step. Pushes the current step onto history for back nav. */
    goTo(step) {
        if (!STEPS.includes(step)) throw new Error(`Unknown wizard step: ${step}`);
        if (step === this._step) return;
        this._history.push(this._step);
        this._step = step;
        this.notify('change:step', { step });
    }

    /** Return to the previous step. No-op if history is empty. */
    back() {
        if (!this._history.length) return;
        this._step = this._history.pop();
        this.notify('change:step', { step: this._step });
    }

    // ── Upload ───────────────────────────────────────────────────────────────

    getUpload() { return { ...this._upload }; }

    setUpload(upload) {
        this._upload = { ...this._upload, ...upload };
        this.notify('change:upload', this.getUpload());
    }

    clearUpload() {
        this._upload = blankUpload();
        this.notify('change:upload', this.getUpload());
    }

    // ── Department selection ─────────────────────────────────────────────────

    getSelectedDepartments() { return new Set(this._selectedDepartments); }

    /**
     * Set the active department selection. Persists to localStorage so the
     * next run can pre-fill the same selection.
     * @param {Iterable<string>} keys - "Main|Sub" department keys
     */
    setSelectedDepartments(keys) {
        this._selectedDepartments = new Set(keys);
        this._storage.set('wizardSelectedDepartments', Array.from(this._selectedDepartments));
        this.notify('change:selected-departments', this.getSelectedDepartments());
    }

    toggleDepartment(key) {
        const next = new Set(this._selectedDepartments);
        if (next.has(key)) next.delete(key); else next.add(key);
        this.setSelectedDepartments(next);
    }

    // ── Operating-hours schedules ────────────────────────────────────────────

    getSchedules() {
        return this._schedules.map(s => ({ ...s, days: [...s.days] }));
    }

    getAssignedDayKeys() {
        const set = new Set();
        for (const s of this._schedules) for (const d of s.days) set.add(d);
        return set;
    }

    addSchedule({ open, close, days }) {
        const id = (this._schedules.reduce((m, s) => Math.max(m, s.id), 0) || 0) + 1;
        this._schedules.push({ id, open, close, days: [...days] });
        this._persistSchedules();
    }

    updateSchedule(id, { open, close, days }) {
        const idx = this._schedules.findIndex(s => s.id === id);
        if (idx === -1) return;
        this._schedules[idx] = { id, open, close, days: [...days] };
        this._persistSchedules();
    }

    deleteSchedule(id) {
        const before = this._schedules.length;
        this._schedules = this._schedules.filter(s => s.id !== id);
        if (this._schedules.length !== before) this._persistSchedules();
    }

    _persistSchedules() {
        this._storage.set('wizardSchedules', this._schedules);
        this.notify('change:schedules', this.getSchedules());
    }

    // ── Result ───────────────────────────────────────────────────────────────

    getResult() { return this._result; }

    setResult(result) {
        this._result = result;
        this.notify('change:result', result);
    }
}

function blankUpload() {
    return { file: null, rows: null, date: null, detectedDepartments: [] };
}
