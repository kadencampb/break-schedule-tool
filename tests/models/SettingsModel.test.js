/**
 * Tests for BaseModel (Observer pattern) and SettingsModel.
 *
 * StorageFacade is replaced with a simple in-memory mock to keep tests
 * isolated from the browser localStorage API — a direct benefit of the
 * Facade pattern.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BaseModel } from '../../src/models/BaseModel.js';
import { SettingsModel } from '../../src/models/SettingsModel.js';
import { DEFAULT_ADVANCED_SETTINGS, DEFAULT_HOURS_BY_DAY } from '../../src/core/constants.js';

// ---------------------------------------------------------------------------
// In-memory StorageFacade mock
// ---------------------------------------------------------------------------

class MockStorage {
    constructor() {
        this._store = new Map();
    }
    get(key, defaultValue = null) {
        return this._store.has(key) ? this._store.get(key) : defaultValue;
    }
    set(key, value) {
        this._store.set(key, value);
    }
    remove(key) {
        this._store.delete(key);
    }
    has(key) {
        return this._store.has(key);
    }
}

// ---------------------------------------------------------------------------
// BaseModel — Observer / EventEmitter
// ---------------------------------------------------------------------------

describe('BaseModel', () => {
    let model;

    beforeEach(() => {
        model = new BaseModel();
    });

    it('calls a subscribed handler when the matching event fires', () => {
        const handler = vi.fn();
        model.subscribe('change', handler);
        model.notify('change', { value: 42 });
        expect(handler).toHaveBeenCalledOnce();
        expect(handler).toHaveBeenCalledWith({ value: 42 });
    });

    it('does not call a handler for a different event', () => {
        const handler = vi.fn();
        model.subscribe('change:one', handler);
        model.notify('change:two', 'anything');
        expect(handler).not.toHaveBeenCalled();
    });

    it('calls all subscribers for an event', () => {
        const h1 = vi.fn();
        const h2 = vi.fn();
        model.subscribe('tick', h1);
        model.subscribe('tick', h2);
        model.notify('tick', 1);
        expect(h1).toHaveBeenCalledOnce();
        expect(h2).toHaveBeenCalledOnce();
    });

    it('returns an unsubscribe function that removes just that handler', () => {
        const h1 = vi.fn();
        const h2 = vi.fn();
        const unsub = model.subscribe('evt', h1);
        model.subscribe('evt', h2);

        unsub(); // remove only h1
        model.notify('evt', 'data');

        expect(h1).not.toHaveBeenCalled();
        expect(h2).toHaveBeenCalledOnce();
    });

    it('unsubscribe() with explicit call removes the handler', () => {
        const handler = vi.fn();
        model.subscribe('evt', handler);
        model.unsubscribe('evt', handler);
        model.notify('evt', null);
        expect(handler).not.toHaveBeenCalled();
    });

    it('does not throw when notify is called with no subscribers', () => {
        expect(() => model.notify('orphan', 'data')).not.toThrow();
    });

    it('destroy() stops all handlers from firing', () => {
        const h1 = vi.fn();
        const h2 = vi.fn();
        model.subscribe('a', h1);
        model.subscribe('b', h2);
        model.destroy();
        model.notify('a', null);
        model.notify('b', null);
        expect(h1).not.toHaveBeenCalled();
        expect(h2).not.toHaveBeenCalled();
    });

    it('notifies with the exact data passed', () => {
        const payload = { x: 1, y: [2, 3] };
        const handler = vi.fn();
        model.subscribe('data', handler);
        model.notify('data', payload);
        expect(handler).toHaveBeenCalledWith(payload);
    });
});

// ---------------------------------------------------------------------------
// SettingsModel — operating hours
// ---------------------------------------------------------------------------

describe('SettingsModel — operating hours', () => {
    let storage;
    let settings;

    beforeEach(() => {
        storage = new MockStorage();
        settings = new SettingsModel(storage);
    });

    it('getHoursByDay() returns DEFAULT_HOURS_BY_DAY when nothing is stored', () => {
        expect(settings.getHoursByDay()).toEqual(DEFAULT_HOURS_BY_DAY);
    });

    it('getHoursByDay() returns the stored value when present', () => {
        const custom = { monday: { start: '9:00', end: '22:00' } };
        storage.set('operatingHours', custom);
        // Re-create so cache is cold
        const fresh = new SettingsModel(storage);
        expect(fresh.getHoursByDay()).toEqual(custom);
    });

    it('getHoursByDay() caches — second call returns the same object reference', () => {
        const first = settings.getHoursByDay();
        const second = settings.getHoursByDay();
        expect(first).toBe(second);
    });

    it('setHoursByDay() persists the value and updates the cache', () => {
        const custom = { ...DEFAULT_HOURS_BY_DAY, saturday: { start: '9:00', end: '22:00' } };
        settings.setHoursByDay(custom);
        expect(storage.get('operatingHours')).toEqual(custom);
        expect(settings.getHoursByDay()).toBe(custom);
    });

    it('setHoursByDay() emits change:hours with the new value', () => {
        const handler = vi.fn();
        settings.subscribe('change:hours', handler);
        const custom = { monday: { start: '8:00', end: '20:00' } };
        settings.setHoursByDay(custom);
        expect(handler).toHaveBeenCalledWith(custom);
    });

    // -----------------------------------------------------------------------
    // getOperatingHoursForDate — day-of-week resolution
    // -----------------------------------------------------------------------

    // 2024-01-01 = Monday, 2024-01-07 = Sunday, 2024-01-06 = Saturday
    it('getOperatingHoursForDate() returns correct minutes for a Monday', () => {
        const result = settings.getOperatingHoursForDate('2024-01-01');
        expect(result).toEqual({ startTime: 600, endTime: 1260 }); // 10:00 = 600, 21:00 = 1260
    });

    it('getOperatingHoursForDate() returns correct minutes for a Sunday', () => {
        const result = settings.getOperatingHoursForDate('2024-01-07');
        expect(result).toEqual({ startTime: 600, endTime: 1260 });
    });

    it('getOperatingHoursForDate() uses stored custom hours for the specific day', () => {
        const customHours = {
            ...DEFAULT_HOURS_BY_DAY,
            saturday: { start: '9:00', end: '22:00' } // 2024-01-06 is Saturday
        };
        storage.set('operatingHours', customHours);
        const fresh = new SettingsModel(storage);
        const result = fresh.getOperatingHoursForDate('2024-01-06');
        expect(result).toEqual({ startTime: 540, endTime: 1320 }); // 9*60=540, 22*60=1320
    });

    it('getOperatingHoursForDate() falls back to 10:00–21:00 for an unknown day key', () => {
        // Remove a day from storage to simulate a partial/corrupt stored value
        const partial = { monday: { start: '8:00', end: '20:00' } }; // no friday key
        storage.set('operatingHours', partial);
        const fresh = new SettingsModel(storage);
        // 2024-01-05 = Friday
        const result = fresh.getOperatingHoursForDate('2024-01-05');
        expect(result).toEqual({ startTime: 600, endTime: 1260 }); // fallback default
    });
});

// ---------------------------------------------------------------------------
// SettingsModel — advanced settings
// ---------------------------------------------------------------------------

describe('SettingsModel — advanced settings', () => {
    let storage;
    let settings;

    beforeEach(() => {
        storage = new MockStorage();
        settings = new SettingsModel(storage);
    });

    it('getAdvancedSettings() returns defaults when nothing is stored', () => {
        expect(settings.getAdvancedSettings()).toEqual(DEFAULT_ADVANCED_SETTINGS);
    });

    it('getAdvancedSettings() merges partial stored values with defaults', () => {
        storage.set('advancedSettings', { maxEarly: 30 });
        const fresh = new SettingsModel(storage);
        const result = fresh.getAdvancedSettings();
        expect(result.maxEarly).toBe(30);
        expect(result.maxDelay).toBe(DEFAULT_ADVANCED_SETTINGS.maxDelay);
        expect(result.deptWeightMultiplier).toBe(DEFAULT_ADVANCED_SETTINGS.deptWeightMultiplier);
        expect(result.proximityWeight).toBe(DEFAULT_ADVANCED_SETTINGS.proximityWeight);
    });

    it('getAdvancedSettings() reads through to storage on every call', () => {
        const first = settings.getAdvancedSettings();
        // Mutating the returned object must not leak into the model's next read.
        first.maxEarly = 999;
        const second = settings.getAdvancedSettings();
        expect(second.maxEarly).toBe(DEFAULT_ADVANCED_SETTINGS.maxEarly);
    });

    it('setAdvancedSettings() persists merged settings', () => {
        settings.setAdvancedSettings({ maxEarly: 10, maxDelay: 20 });
        const stored = storage.get('advancedSettings');
        expect(stored.maxEarly).toBe(10);
        expect(stored.maxDelay).toBe(20);
        // Unspecified keys fall back to defaults
        expect(stored.deptWeightMultiplier).toBe(DEFAULT_ADVANCED_SETTINGS.deptWeightMultiplier);
    });

    it('setAdvancedSettings() emits change:advanced with the merged value', () => {
        const handler = vi.fn();
        settings.subscribe('change:advanced', handler);
        settings.setAdvancedSettings({ maxEarly: 5 });
        expect(handler).toHaveBeenCalledOnce();
        const emitted = handler.mock.calls[0][0];
        expect(emitted.maxEarly).toBe(5);
        expect(emitted.maxDelay).toBe(DEFAULT_ADVANCED_SETTINGS.maxDelay);
    });
});

// ---------------------------------------------------------------------------
// SettingsModel — selected state
// ---------------------------------------------------------------------------

describe('SettingsModel — selected state', () => {
    let storage;
    let settings;

    beforeEach(() => {
        storage = new MockStorage();
        settings = new SettingsModel(storage);
    });

    it('getSelectedState() defaults to "california"', () => {
        expect(settings.getSelectedState()).toBe('california');
    });

    it('getSelectedState() returns the stored state when present', () => {
        storage.set('selectedState', 'washington');
        const fresh = new SettingsModel(storage);
        expect(fresh.getSelectedState()).toBe('washington');
    });

    it('setSelectedState() persists the value', () => {
        settings.setSelectedState('oregon');
        expect(storage.get('selectedState')).toBe('oregon');
    });

    it('setSelectedState() emits change:state with the new state', () => {
        const handler = vi.fn();
        settings.subscribe('change:state', handler);
        settings.setSelectedState('nevada');
        expect(handler).toHaveBeenCalledWith('nevada');
    });

    it('getSelectedState() caches — second call returns same value', () => {
        settings.setSelectedState('utah');
        const a = settings.getSelectedState();
        const b = settings.getSelectedState();
        expect(a).toBe(b);
        expect(a).toBe('utah');
    });
});
