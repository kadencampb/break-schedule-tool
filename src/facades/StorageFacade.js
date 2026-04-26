/**
 * StorageFacade — abstracts localStorage access.
 *
 * Facade pattern: provides a clean, type-safe interface to localStorage,
 * hiding JSON serialization, parse errors, and key namespacing.
 *
 * All keys are namespaced under a shared prefix to avoid collisions with
 * other apps that might be hosted on the same origin.
 */
export class StorageFacade {
    /** @param {string} namespace - Prefix applied to all storage keys */
    constructor(namespace = 'breakSchedule') {
        this._ns = namespace;
    }

    /** Namespace a key */
    _key(key) {
        return `${this._ns}:${key}`;
    }

    /**
     * Read and deserialize a value from localStorage.
     * Returns `defaultValue` if the key is missing or the stored JSON is invalid.
     *
     * @param {string} key
     * @param {*} defaultValue
     * @returns {*}
     */
    get(key, defaultValue = null) {
        try {
            const raw = localStorage.getItem(this._key(key));
            if (raw === null) return defaultValue;
            return JSON.parse(raw);
        } catch {
            return defaultValue;
        }
    }

    /**
     * Serialize and store a value in localStorage.
     * Silently fails if localStorage is unavailable (e.g., private browsing quota exceeded).
     *
     * @param {string} key
     * @param {*} value
     */
    set(key, value) {
        try {
            localStorage.setItem(this._key(key), JSON.stringify(value));
        } catch {
            // localStorage may be full or unavailable — fail silently
        }
    }

    /**
     * Remove a key from localStorage.
     * @param {string} key
     */
    remove(key) {
        try {
            localStorage.removeItem(this._key(key));
        } catch {
            // ignore
        }
    }

    /**
     * Check if a key exists in localStorage.
     * @param {string} key
     * @returns {boolean}
     */
    has(key) {
        return localStorage.getItem(this._key(key)) !== null;
    }
}
