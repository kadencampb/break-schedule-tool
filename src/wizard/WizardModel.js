import { BaseModel } from '../models/BaseModel.js';

/**
 * WizardModel — state machine + persistent state for the guided experience.
 *
 * Events:
 *   'change:step'                 — current step transitioned
 *   'change:upload'               — uploaded file or parsed schedule changed
 *   'change:selected-departments' — stagger selection changed
 *   'change:enabled-departments'  — break-generation selection changed
 *   'change:result'               — scheduler ran and produced a result
 */
export const STEPS = [
    'landing',
    'have-file',
    'export-help',
    'upload',
    'state',
    'workspace'
];

export class WizardModel extends BaseModel {
    /** @param {StorageFacade} storage */
    constructor(storage) {
        super();
        this._storage = storage;

        this._step    = 'landing';
        this._history = [];
        this._selectedDepartments = new Set(storage.get('wizardSelectedDepartments', []));
        this._enabledDepartments  = new Set(storage.get('wizardEnabledDepartments',  null) || []);
        this._upload = blankUpload();
        this._result = null;
    }

    // ── Step ─────────────────────────────────────────────────────────────────

    getStep() { return this._step; }

    goTo(step) {
        if (!STEPS.includes(step)) throw new Error(`Unknown wizard step: ${step}`);
        if (step === this._step) return;
        this._history.push(this._step);
        this._step = step;
        this.notify('change:step', { step });
    }

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

    // ── Stagger selection (customer-facing) ──────────────────────────────────

    getSelectedDepartments() { return new Set(this._selectedDepartments); }

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

    // ── Break-generation selection ───────────────────────────────────────────

    getEnabledDepartments() { return new Set(this._enabledDepartments); }

    setEnabledDepartments(keys) {
        this._enabledDepartments = new Set(keys);
        this._storage.set('wizardEnabledDepartments', Array.from(this._enabledDepartments));
        this.notify('change:enabled-departments', this.getEnabledDepartments());
    }

    toggleBreakEnabled(key) {
        const next = new Set(this._enabledDepartments);
        if (next.has(key)) next.delete(key); else next.add(key);
        this.setEnabledDepartments(next);
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
