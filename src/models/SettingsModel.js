import { BaseModel } from './BaseModel.js';
import {
    DEFAULT_ADVANCED_SETTINGS,
    DEFAULT_HOURS_BY_DAY
} from '../core/constants.js';
import { timeToMinutes } from '../core/helpers.js';

/**
 * SettingsModel — owns all persistent user settings.
 *
 * Extends BaseModel (Observer pattern) to notify subscribers when settings change.
 * Uses StorageFacade (Facade pattern) for all localStorage access.
 *
 * Events emitted:
 *   'change:hours'    — operating hours changed
 *   'change:advanced' — advanced settings changed
 *   'change:state'    — selected state changed
 */
export class SettingsModel extends BaseModel {
    /** @param {StorageFacade} storage */
    constructor(storage) {
        super();
        this._storage = storage;
        this._hours = null;
        this._advanced = null;
        this._state = null;
    }

    // -------------------------------------------------------------------------
    // Operating hours
    // -------------------------------------------------------------------------

    /**
     * Get operating hours by day of week.
     * @returns {{ monday: {start, end}, tuesday: ..., ... }}
     */
    getHoursByDay() {
        if (!this._hours) {
            this._hours = this._storage.get('operatingHours', DEFAULT_HOURS_BY_DAY);
        }
        return this._hours;
    }

    /**
     * Persist operating hours for all days.
     * @param {{ [day]: { start: string, end: string } }} hours
     */
    setHoursByDay(hours) {
        this._hours = hours;
        this._storage.set('operatingHours', hours);
        this.notify('change:hours', hours);
    }

    /**
     * Get operating hours for a specific date string (YYYY-MM-DD) as minutes.
     * @param {string} dateString
     * @returns {{ startTime: number, endTime: number }}
     */
    getOperatingHoursForDate(dateString) {
        const date = new Date(`${dateString}T00:00:00`);
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const dayName = dayNames[date.getDay()];
        const hoursByDay = this.getHoursByDay();
        const day = hoursByDay[dayName] || { start: '10:00', end: '21:00' };

        return {
            startTime: timeToMinutes(day.start),
            endTime: timeToMinutes(day.end)
        };
    }

    // -------------------------------------------------------------------------
    // Advanced settings
    // -------------------------------------------------------------------------

    /**
     * Get advanced scheduling settings.
     * @returns {{ maxEarly, maxDelay, deptWeightMultiplier, proximityWeight }}
     */
    getAdvancedSettings() {
        if (!this._advanced) {
            this._advanced = { ...DEFAULT_ADVANCED_SETTINGS, ...this._storage.get('advancedSettings', {}) };
        }
        return this._advanced;
    }

    /**
     * Persist advanced settings.
     * @param {{ maxEarly, maxDelay, deptWeightMultiplier, proximityWeight }} settings
     */
    setAdvancedSettings(settings) {
        this._advanced = { ...DEFAULT_ADVANCED_SETTINGS, ...settings };
        this._storage.set('advancedSettings', this._advanced);
        this.notify('change:advanced', this._advanced);
    }

    // -------------------------------------------------------------------------
    // State selection (for labor law jurisdiction)
    // -------------------------------------------------------------------------

    /** @returns {string} */
    getSelectedState() {
        if (!this._state) {
            this._state = this._storage.get('selectedState', 'california');
        }
        return this._state;
    }

    /** @param {string} state */
    setSelectedState(state) {
        this._state = state;
        this._storage.set('selectedState', state);
        this.notify('change:state', state);
    }
}
