/**
 * BaseModel — Observer/EventEmitter base class.
 *
 * Inheritance pattern: all models extend BaseModel to gain event subscription
 * and notification capabilities. Controllers subscribe to model events;
 * models call notify() when their data changes.
 *
 * Usage:
 *   class SettingsModel extends BaseModel {
 *     setGroups(groups) {
 *       this._groups = groups;
 *       this.notify('change:groups', groups);
 *     }
 *   }
 *
 *   const model = new SettingsModel();
 *   model.subscribe('change:groups', (groups) => view.renderGroups(groups));
 */
export class BaseModel {
    constructor() {
        /** @type {Map<string, Array<Function>>} */
        this._listeners = new Map();
    }

    /**
     * Subscribe a handler to an event.
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} Unsubscribe function
     */
    subscribe(event, handler) {
        if (!this._listeners.has(event)) {
            this._listeners.set(event, []);
        }
        this._listeners.get(event).push(handler);

        // Return an unsubscribe function for clean teardown
        return () => this.unsubscribe(event, handler);
    }

    /**
     * Remove a specific handler from an event.
     * @param {string} event
     * @param {Function} handler
     */
    unsubscribe(event, handler) {
        const handlers = this._listeners.get(event);
        if (handlers) {
            const idx = handlers.indexOf(handler);
            if (idx !== -1) handlers.splice(idx, 1);
        }
    }

    /**
     * Emit an event, calling all registered handlers with the given data.
     * @param {string} event
     * @param {*} data
     */
    notify(event, data) {
        const handlers = this._listeners.get(event);
        if (handlers) {
            for (const handler of handlers) {
                handler(data);
            }
        }
    }

    /**
     * Remove all event listeners. Call this when the model is no longer needed.
     */
    destroy() {
        this._listeners.clear();
    }
}
