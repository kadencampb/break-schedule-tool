import { BaseView } from './BaseView.js';
import { DEFAULT_ADVANCED_SETTINGS, DEFAULT_HOURS_BY_DAY } from '../core/constants.js';

/**
 * SettingsView — renders and wires up the advanced settings and operating hours panels.
 *
 * Extends BaseView (Inheritance pattern).
 * Emits 'settings:hours-change', 'settings:advanced-change', 'settings:state-change'
 * when the user changes any setting.
 */
export class SettingsView extends BaseView {
    /**
     * Populate the operating hours inputs from model data.
     * @param {{ [day]: { start: string, end: string } }} hoursByDay
     */
    renderHours(hoursByDay) {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        for (const day of days) {
            const hours = hoursByDay[day] || DEFAULT_HOURS_BY_DAY[day];
            const startEl = this.el(`${day}Start`);
            const endEl   = this.el(`${day}End`);
            if (startEl) startEl.value = hours.start;
            if (endEl)   endEl.value   = hours.end;
        }
    }

    /**
     * Populate the advanced settings sliders from model data.
     * @param {{ maxEarly, maxDelay, deptWeightMultiplier, proximityWeight }} settings
     */
    renderAdvancedSettings(settings) {
        const fields = ['maxEarly', 'maxDelay', 'deptWeightMultiplier', 'proximityWeight', 'idealMealOffset'];
        for (const field of fields) {
            const input = this.el(field);
            if (input) {
                input.value = settings[field];
                this._updateDisplayValue(field, settings[field]);
            }
        }
    }

    /**
     * Set the selected state in the dropdown.
     * @param {string} state
     */
    renderSelectedState(state) {
        const select = this.el('stateSelect');
        if (select) select.value = state;
    }

    /**
     * Wire up all settings inputs to emit change events.
     * @param {HTMLElement} root - Root element to emit events from
     */
    bind(root) {
        this._bindHoursInputs(root);
        this._bindAdvancedInputs(root);
        this._bindStateSelect(root);
        this._bindResetButtons(root);
    }

    /** @private */
    _bindHoursInputs(root) {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        for (const day of days) {
            const startEl = this.el(`${day}Start`);
            const endEl   = this.el(`${day}End`);

            const onChange = () => {
                const hours = this._readAllHours();
                this.emit(root, 'settings:hours-change', { hours });
            };

            if (startEl) this.on(startEl, 'change', onChange);
            if (endEl)   this.on(endEl,   'change', onChange);
        }
    }

    /** @private */
    _bindAdvancedInputs(root) {
        const fields = ['maxEarly', 'maxDelay', 'deptWeightMultiplier', 'proximityWeight', 'idealMealOffset'];
        for (const field of fields) {
            const input = this.el(field);
            if (!input) continue;

            // Update display label in real time as slider moves
            this.on(input, 'input', () => this._updateDisplayValue(field, input.value));

            // Emit change event when user releases slider
            this.on(input, 'change', () => {
                const settings = this._readAllAdvanced();
                this.emit(root, 'settings:advanced-change', { settings });
            });
        }
    }

    /** @private */
    _bindStateSelect(root) {
        const select = this.el('stateSelect');
        if (select) {
            this.on(select, 'change', () => {
                this.emit(root, 'settings:state-change', { state: select.value });
            });
        }
    }

    /** @private */
    _bindResetButtons(root) {
        const resetAdvBtn = this.el('resetAdvancedBtn');
        if (resetAdvBtn) {
            this.on(resetAdvBtn, 'click', async () => {
                const ok = await this.showConfirm('Reset all advanced settings to their default values?');
                if (ok) {
                    this.emit(root, 'settings:advanced-reset', {});
                }
            });
        }
    }

    /** @private */
    _updateDisplayValue(field, value) {
        // Use direct DOM lookup (not this.el) — some fields (e.g. idealMealOffset
        // rendered as <select>) intentionally have no display span, and we don't
        // want to log a warning for the optional case.
        const display = document.getElementById(`${field}Value`);
        if (display) display.textContent = value;
    }

    /** @private */
    _readAllHours() {
        const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
        const hours = {};
        for (const day of days) {
            const start = this.el(`${day}Start`)?.value || '10:00';
            const end   = this.el(`${day}End`)?.value   || '21:00';
            hours[day] = { start, end };
        }
        return hours;
    }

    /** @private */
    _readAllAdvanced() {
        return {
            maxEarly:             parseInt(this.el('maxEarly')?.value             ?? DEFAULT_ADVANCED_SETTINGS.maxEarly,             10),
            maxDelay:             parseInt(this.el('maxDelay')?.value             ?? DEFAULT_ADVANCED_SETTINGS.maxDelay,             10),
            deptWeightMultiplier: parseInt(this.el('deptWeightMultiplier')?.value ?? DEFAULT_ADVANCED_SETTINGS.deptWeightMultiplier, 10),
            proximityWeight:      parseInt(this.el('proximityWeight')?.value      ?? DEFAULT_ADVANCED_SETTINGS.proximityWeight,      10),
            idealMealOffset:      parseInt(this.el('idealMealOffset')?.value      ?? DEFAULT_ADVANCED_SETTINGS.idealMealOffset,      10)
        };
    }
}
