import { BaseView } from './BaseView.js';
import { DEFAULT_ADVANCED_SETTINGS, DEFAULT_HOURS_BY_DAY } from '../core/constants.js';

const BFG_CELL_COUNT  = 16;
const BFG_IDEAL_CELL  = 8;     // Cells 8 = 2:00 (the rest break ideal)
const BFG_STEP        = 15;    // Minutes per cell
const BFG_MAX_OFFSET  = 105;   // Cap each side at 7 cells = 105 min

// Meal graphic: 16 cells (15 min each) spanning 2h to 6h after clock-in, with a
// 2-cell highlight (30 min meal, width set in CSS) draggable between 2:45 (165)
// and 4:45 (285). The axis starts at 2h, so cell index = (offset - 120) / 15.
const MEAL_CELL_COUNT     = 16;
const MEAL_AXIS_START_MIN = 120;   // 2h after clock-in
const MEAL_MIN_OFFSET     = 165;   // 2:45
const MEAL_MAX_OFFSET     = 285;   // 4:45

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
     * @param {{ maxEarly, maxDelay, deptCoverageMode, timeCoverageMode, idealMealOffset }} settings
     */
    renderAdvancedSettings(settings) {
        const fields = ['maxEarly', 'maxDelay', 'idealMealOffset'];
        for (const field of fields) {
            const input = this.el(field);
            if (input) {
                input.value = settings[field];
                this._updateDisplayValue(field, settings[field]);
            }
        }
        this._renderSegmented('deptCoverageMode', settings.deptCoverageMode);
        this._renderSegmented('timeCoverageMode', settings.timeCoverageMode);
        this._renderBreakFlexGraphic();
        this._renderMealPrefGraphic();
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
        this._bindSegmented(root, 'deptCoverageMode');
        this._bindSegmented(root, 'timeCoverageMode');
        this._bindStateSelect(root);
        this._bindResetButtons(root);
        this._initBreakFlexGraphic();
        this._initMealPrefGraphic();
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
        const fields = ['maxEarly', 'maxDelay', 'idealMealOffset'];
        for (const field of fields) {
            const input = this.el(field);
            if (!input) continue;

            // Update display label in real time as slider moves
            this.on(input, 'input', () => {
                this._updateDisplayValue(field, input.value);
                if (field === 'maxEarly' || field === 'maxDelay') this._renderBreakFlexGraphic();
                if (field === 'idealMealOffset')                   this._renderMealPrefGraphic();
            });

            // Emit change event when user releases slider
            this.on(input, 'change', () => {
                const settings = this._readAllAdvanced();
                this.emit(root, 'settings:advanced-change', { settings });
            });
        }
    }

    /** @private — wire click handlers on the segments of a pill control */
    _bindSegmented(root, groupId) {
        const group = this.el(groupId);
        if (!group) return;
        const segments = group.querySelectorAll('.bfg-segment');
        segments.forEach(seg => {
            this.on(seg, 'click', () => {
                segments.forEach(s => s.classList.remove('is-active'));
                seg.classList.add('is-active');
                const settings = this._readAllAdvanced();
                this.emit(root, 'settings:advanced-change', { settings });
            });
        });
    }

    /** @private — set the active segment to match the stored value */
    _renderSegmented(groupId, value) {
        const group = document.getElementById(groupId);
        if (!group || !value) return;
        group.querySelectorAll('.bfg-segment').forEach(seg => {
            seg.classList.toggle('is-active', seg.getAttribute('data-value') === value);
        });
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
        if (!display) return;
        if (field === 'idealMealOffset') {
            const min = parseInt(value, 10) || 0;
            const h = Math.floor(min / 60);
            const m = min % 60;
            display.textContent = `${h}:${String(m).padStart(2, '0')}`;
        } else {
            display.textContent = String(value);
        }
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
            maxEarly:          parseInt(this.el('maxEarly')?.value          ?? DEFAULT_ADVANCED_SETTINGS.maxEarly,          10),
            maxDelay:          parseInt(this.el('maxDelay')?.value          ?? DEFAULT_ADVANCED_SETTINGS.maxDelay,          10),
            idealMealOffset:   parseInt(this.el('idealMealOffset')?.value   ?? DEFAULT_ADVANCED_SETTINGS.idealMealOffset,   10),
            deptCoverageMode:  this._readSegmentedValue('deptCoverageMode') ?? DEFAULT_ADVANCED_SETTINGS.deptCoverageMode,
            timeCoverageMode:  this._readSegmentedValue('timeCoverageMode') ?? DEFAULT_ADVANCED_SETTINGS.timeCoverageMode
        };
    }

    /** @private */
    _readSegmentedValue(groupId) {
        const group = document.getElementById(groupId);
        if (!group) return null;
        const active = group.querySelector('.bfg-segment.is-active');
        return active ? active.getAttribute('data-value') : null;
    }

    // -------------------------------------------------------------------------
    // Break-Flex Graphic — visual + draggable representation of maxEarly/maxDelay
    // -------------------------------------------------------------------------

    /** @private */
    _initBreakFlexGraphic() {
        const track = document.getElementById('bfgTrack');
        if (!track) return;

        // Build 16 cells once. Hour boundaries (every 4th cell) get a thicker border.
        if (track.children.length === 0) {
            for (let i = 0; i < BFG_CELL_COUNT; i++) {
                const cell = document.createElement('div');
                cell.className = 'bfg-cell';
                if (i % 4 === 0) cell.setAttribute('data-hour-mark', 'true');
                track.appendChild(cell);
            }
        }

        this._wireBfgHandle('bfgHandleEarly', 'maxEarly');
        this._wireBfgHandle('bfgHandleDelay', 'maxDelay');

        this._renderBreakFlexGraphic();
    }

    /** @private */
    _renderBreakFlexGraphic() {
        const track = document.getElementById('bfgTrack');
        if (!track) return;
        const earlyInput = this.el('maxEarly');
        const delayInput = this.el('maxDelay');
        if (!earlyInput || !delayInput) return;

        const maxEarly = clamp(parseInt(earlyInput.value, 10) || 0, 0, BFG_MAX_OFFSET);
        const maxDelay = clamp(parseInt(delayInput.value, 10) || 0, 0, BFG_MAX_OFFSET);

        const earlyCells = Math.round(maxEarly / BFG_STEP);
        const delayCells = Math.round(maxDelay / BFG_STEP);
        const iMin = BFG_IDEAL_CELL - earlyCells;
        const iMax = BFG_IDEAL_CELL + delayCells;

        // Color cells by state
        const cells = track.querySelectorAll('.bfg-cell');
        cells.forEach((cell, idx) => {
            let state;
            if (idx === BFG_IDEAL_CELL) state = 'ideal';
            else if (idx >= iMin && idx <= iMax) state = 'valid';
            else state = 'out';
            cell.setAttribute('data-state', state);
        });

        // Position the early handle at the left edge of the leftmost valid cell
        const earlyHandle = document.getElementById('bfgHandleEarly');
        if (earlyHandle) {
            earlyHandle.style.left = `${(iMin / BFG_CELL_COUNT) * 100}%`;
            earlyHandle.setAttribute('aria-valuenow', String(maxEarly));
            earlyHandle.setAttribute('aria-valuetext', `${maxEarly} minutes before ideal`);
        }

        // Position the delay handle at the right edge of the rightmost valid cell
        const delayHandle = document.getElementById('bfgHandleDelay');
        if (delayHandle) {
            delayHandle.style.left = `${((iMax + 1) / BFG_CELL_COUNT) * 100}%`;
            delayHandle.setAttribute('aria-valuenow', String(maxDelay));
            delayHandle.setAttribute('aria-valuetext', `${maxDelay} minutes after ideal`);
        }

        this._updateDisplayValue('maxEarly', maxEarly);
        this._updateDisplayValue('maxDelay', maxDelay);
    }

    /** @private */
    _wireBfgHandle(handleId, kind) {
        const handle = document.getElementById(handleId);
        if (!handle) return;
        const stage = handle.parentElement;
        const input = this.el(kind);
        if (!stage || !input) return;

        const commit = (value, { fireChange }) => {
            const clamped = clamp(Math.round(value / BFG_STEP) * BFG_STEP, 0, BFG_MAX_OFFSET);
            if (parseInt(input.value, 10) === clamped) return;
            input.value = String(clamped);
            this._renderBreakFlexGraphic();
            input.dispatchEvent(new Event('input', { bubbles: true }));
            if (fireChange) input.dispatchEvent(new Event('change', { bubbles: true }));
        };

        // Map a pointer x position within the stage to a value for this handle.
        const pointerToValue = (clientX) => {
            const rect = stage.getBoundingClientRect();
            const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
            const boundary = Math.round(pct * BFG_CELL_COUNT);
            return (kind === 'maxEarly')
                ? (BFG_IDEAL_CELL - boundary) * BFG_STEP
                : (boundary - (BFG_IDEAL_CELL + 1)) * BFG_STEP;
        };

        const onPointerDown = (e) => {
            e.preventDefault();
            handle.classList.add('is-dragging');
            try { handle.setPointerCapture(e.pointerId); } catch { /* not supported */ }

            const onMove = (ev) => commit(pointerToValue(ev.clientX), { fireChange: false });
            const onUp = (ev) => {
                handle.classList.remove('is-dragging');
                try { handle.releasePointerCapture(ev.pointerId); } catch { /* ok */ }
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                handle.removeEventListener('pointercancel', onUp);
                input.dispatchEvent(new Event('change', { bubbles: true }));
            };
            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
            handle.addEventListener('pointercancel', onUp);

            commit(pointerToValue(e.clientX), { fireChange: false });
        };
        handle.addEventListener('pointerdown', onPointerDown);
    }

    // -------------------------------------------------------------------------
    // Meal Period Placement graphic — draggable 30-min block on a 6-hour timeline
    // -------------------------------------------------------------------------

    /** @private */
    _initMealPrefGraphic() {
        const track = document.getElementById('mealPrefTrack');
        if (!track) return;

        if (track.children.length === 0) {
            // Compute which cells the meal block can NEVER cover, given the allowed
            // drag range [MIN_OFFSET, MAX_OFFSET]. The block is 2 cells wide.
            const minBlockStartCell = (MEAL_MIN_OFFSET - MEAL_AXIS_START_MIN) / BFG_STEP;
            const maxBlockStartCell = (MEAL_MAX_OFFSET - MEAL_AXIS_START_MIN) / BFG_STEP;

            for (let i = 0; i < MEAL_CELL_COUNT; i++) {
                const cell = document.createElement('div');
                cell.className = 'bfg-cell';
                if (i % 4 === 0) cell.setAttribute('data-hour-mark', 'true');
                if (i < minBlockStartCell || i > maxBlockStartCell + 1) {
                    cell.setAttribute('data-state', 'disabled');
                }
                track.appendChild(cell);
            }
        }

        this._wireMealBlock();
        this._renderMealPrefGraphic();
    }

    /** @private */
    _renderMealPrefGraphic() {
        const block = document.getElementById('mealPrefBlock');
        const select = this.el('idealMealOffset');
        if (!block || !select) return;

        const offset = clamp(parseInt(select.value, 10) || MEAL_MIN_OFFSET, MEAL_MIN_OFFSET, MEAL_MAX_OFFSET);
        const cellIndex = (offset - MEAL_AXIS_START_MIN) / BFG_STEP;
        block.style.left = `${(cellIndex / MEAL_CELL_COUNT) * 100}%`;

        this._updateDisplayValue('idealMealOffset', offset);
    }

    /** @private */
    _wireMealBlock() {
        const block = document.getElementById('mealPrefBlock');
        const track = document.getElementById('mealPrefTrack');
        const select = this.el('idealMealOffset');
        if (!block || !track || !select) return;

        // Require this much drag past the boundary (in minutes) before the
        // not-allowed shake fires. Prevents accidental triggers when the user
        // brushes past the wall by a single cell.
        const BLOCKED_THRESHOLD_MIN = BFG_STEP * 2; // 30 min = 2 cells

        let blockedTimer = null;
        const triggerBlocked = () => {
            block.classList.remove('is-blocked');
            // Force reflow so the animation can replay if it's already pulsing.
            void block.offsetWidth;
            block.classList.add('is-blocked');
            if (blockedTimer) clearTimeout(blockedTimer);
            blockedTimer = setTimeout(() => block.classList.remove('is-blocked'), 160);
        };

        const commit = (rawOffset, { fireChange }) => {
            const snappedRaw = Math.round(rawOffset / BFG_STEP) * BFG_STEP;
            const clamped = clamp(snappedRaw, MEAL_MIN_OFFSET, MEAL_MAX_OFFSET);
            const overshoot = Math.abs(snappedRaw - clamped);
            const wantsFarBeyond = overshoot >= BLOCKED_THRESHOLD_MIN;

            const current = parseInt(select.value, 10);
            if (current === clamped) {
                if (wantsFarBeyond) triggerBlocked();
                return;
            }

            select.value = String(clamped);
            this._renderMealPrefGraphic();
            select.dispatchEvent(new Event('input', { bubbles: true }));
            if (fireChange) select.dispatchEvent(new Event('change', { bubbles: true }));
            if (wantsFarBeyond) triggerBlocked();
        };

        // Pointer drag — preserve the click offset within the block so the block
        // doesn't snap under the cursor when the user grabs anywhere on it.
        const onPointerDown = (e) => {
            e.preventDefault();
            block.classList.add('is-dragging');
            try { block.setPointerCapture(e.pointerId); } catch { /* not supported */ }

            const blockRect = block.getBoundingClientRect();
            const grabOffsetPx = e.clientX - blockRect.left;

            const onMove = (ev) => {
                const trackRect = track.getBoundingClientRect();
                const blockLeftPx = ev.clientX - grabOffsetPx - trackRect.left;
                const pct = blockLeftPx / trackRect.width;     // not clamped — let commit detect overshoot
                const cellIndex = pct * MEAL_CELL_COUNT;
                const offset = MEAL_AXIS_START_MIN + cellIndex * BFG_STEP;
                commit(offset, { fireChange: false });
            };
            const onUp = (ev) => {
                block.classList.remove('is-dragging');
                try { block.releasePointerCapture(ev.pointerId); } catch { /* ok */ }
                block.removeEventListener('pointermove', onMove);
                block.removeEventListener('pointerup', onUp);
                block.removeEventListener('pointercancel', onUp);
                select.dispatchEvent(new Event('change', { bubbles: true }));
            };
            block.addEventListener('pointermove', onMove);
            block.addEventListener('pointerup', onUp);
            block.addEventListener('pointercancel', onUp);
        };
        block.addEventListener('pointerdown', onPointerDown);
    }
}

function clamp(val, lo, hi) {
    return Math.max(lo, Math.min(hi, val));
}
