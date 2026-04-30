import { BaseModel } from '../models/BaseModel.js';

/**
 * WizardModel — state machine for the guided break-scheduling experience.
 *
 * Keeps the wizard's transient state (uploaded file, parsed rows, current step,
 * department selections) in memory and persists user-preference flags to
 * localStorage via StorageFacade.
 *
 * Existing settings (operating hours, advanced settings, coverage groups) live
 * in their own models — this wizard composes those rather than duplicating them.
 *
 * Events:
 *   'change:step'                — current step transitioned
 *   'change:upload'              — uploaded file or parsed schedule changed
 *   'change:selected-departments'— department selection changed
 *   'change:remember'            — a remember flag toggled
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

// Remember-by-default. The UI no longer exposes individual toggles; these
// flags exist only for internal logic and stay implicitly true.
export const DEFAULT_REMEMBER = {
    haveFile:    true,
    departments: true,
    hours:       true,
    settings:    false   // always show the review/customize step
};

export class WizardModel extends BaseModel {
    /** @param {StorageFacade} storage */
    constructor(storage) {
        super();
        this._storage = storage;

        this._step = 'landing';
        this._history = [];

        // Schema-versioned remember flags. When defaults change, bump
        // REMEMBER_SCHEMA_VERSION so users with stale stored values get the new defaults.
        const REMEMBER_SCHEMA_VERSION = 3;
        const storedVer = storage.get('wizardRememberVersion', 1);
        const storedRemember = storage.get('wizardRemember', {});
        this._remember = storedVer === REMEMBER_SCHEMA_VERSION
            ? { ...DEFAULT_REMEMBER, ...storedRemember }
            : { ...DEFAULT_REMEMBER };
        storage.set('wizardRememberVersion', REMEMBER_SCHEMA_VERSION);

        this._selectedDepartments = new Set(storage.get('wizardSelectedDepartments', []));
        this._schedules = storage.get('wizardSchedules', []);
        this._upload = { file: null, rows: null, date: null, detectedDepartments: [] };
        this._result = null;
    }

    // ── Step ─────────────────────────────────────────────────────────────────

    getStep() { return this._step; }

    /**
     * Transition to a new step. Pushes current step onto history for back nav.
     * @param {string} step - One of STEPS
     */
    goTo(step) {
        if (!STEPS.includes(step)) throw new Error(`Unknown wizard step: ${step}`);
        if (step === this._step) return;
        this._history.push(this._step);
        this._step = step;
        this.notify('change:step', { step, history: [...this._history] });
    }

    /** Return to the previous step. No-op if history is empty. */
    back() {
        if (!this._history.length) return;
        const prev = this._history.pop();
        this._step = prev;
        this.notify('change:step', { step: prev, history: [...this._history] });
    }

    canGoBack() { return this._history.length > 0; }

    // ── Remember flags ───────────────────────────────────────────────────────

    getRemember() { return { ...this._remember }; }

    setRemember(key, value) {
        if (!(key in this._remember)) return;
        this._remember[key] = !!value;
        this._storage.set('wizardRemember', this._remember);
        this.notify('change:remember', { ...this._remember });
    }

    // ── Upload ───────────────────────────────────────────────────────────────

    getUpload() { return { ...this._upload }; }

    setUpload(upload) {
        this._upload = { ...this._upload, ...upload };
        this.notify('change:upload', this.getUpload());
    }

    clearUpload() {
        this._upload = { file: null, rows: null, date: null, detectedDepartments: [] };
        this.notify('change:upload', this.getUpload());
    }

    // ── Department selection ────────────────────────────────────────────────

    getSelectedDepartments() { return new Set(this._selectedDepartments); }

    /**
     * Set the active department selection. Persists to localStorage so the
     * next run can pre-fill the same selection (when remember.departments is on).
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

    // ── Operating-hours schedules ──────────────────────────────────────────
    //
    // The wizard groups days into named schedules ("Schedule 1: Mon-Fri 10:00-21:00")
    // for an easier UX than per-day inputs. Stored explicitly here so we can detect
    // first-run (empty list) vs returning users (schedules already configured).

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

    // ── Result ──────────────────────────────────────────────────────────────

    getResult() { return this._result; }

    setResult(result) {
        this._result = result;
        this.notify('change:result', result);
    }
}
