import { BaseModel } from './BaseModel.js';
import { DEFAULT_GROUPS } from '../core/constants.js';

/**
 * CoverageGroupModel — owns the coverage optimization groups.
 *
 * Extends BaseModel (Observer pattern) to notify subscribers when groups change.
 * Uses StorageFacade (Facade pattern) for all localStorage access.
 *
 * Events emitted:
 *   'change' — groups collection changed (add, update, delete, reset)
 */
export class CoverageGroupModel extends BaseModel {
    /** @param {StorageFacade} storage */
    constructor(storage) {
        super();
        this._storage = storage;
        this._groups = null;
    }

    // -------------------------------------------------------------------------
    // Read
    // -------------------------------------------------------------------------

    /**
     * Get all coverage groups.
     * @returns {Array<{ id: number, name: string, departments: Array<{main, sub}> }>}
     */
    getAll() {
        if (!this._groups) {
            this._groups = this._storage.get('coverageGroups', DEFAULT_GROUPS);
        }
        return this._groups;
    }

    /**
     * Find a group by ID.
     * @param {number} id
     * @returns {{ id, name, departments }|undefined}
     */
    getById(id) {
        return this.getAll().find(g => g.id === id);
    }

    /**
     * Find the group containing a specific main/sub department.
     * @param {string} main
     * @param {string} sub
     * @returns {{ id, name, departments }|undefined}
     */
    findGroupContaining(main, sub) {
        return this.getAll().find(group =>
            group.departments.some(d => d.main === main && d.sub === sub)
        );
    }

    /**
     * Get all departments that are assigned to any group.
     * @returns {Array<{main: string, sub: string}>}
     */
    getAllAssignedDepartments() {
        return this.getAll().flatMap(g => g.departments);
    }

    // -------------------------------------------------------------------------
    // Write
    // -------------------------------------------------------------------------

    /**
     * Add a new group.
     * @param {string} name
     * @param {Array<{main, sub}>} departments
     * @returns {{ id, name, departments }} The newly created group
     */
    add(name, departments) {
        const groups = this.getAll();
        const newId = groups.length > 0 ? Math.max(...groups.map(g => g.id)) + 1 : 1;
        const newGroup = { id: newId, name, departments };
        groups.push(newGroup);
        this._persist(groups);
        return newGroup;
    }

    /**
     * Update an existing group by ID.
     * @param {number} id
     * @param {string} name
     * @param {Array<{main, sub}>} departments
     * @returns {boolean} Whether the group was found and updated
     */
    update(id, name, departments) {
        const groups = this.getAll();
        const group = groups.find(g => g.id === id);
        if (!group) return false;
        group.name = name;
        group.departments = departments;
        this._persist(groups);
        return true;
    }

    /**
     * Delete a group by ID.
     * @param {number} id
     * @returns {boolean} Whether the group was found and deleted
     */
    delete(id) {
        const groups = this.getAll();
        const idx = groups.findIndex(g => g.id === id);
        if (idx === -1) return false;
        groups.splice(idx, 1);
        this._persist(groups);
        return true;
    }

    /**
     * Replace all groups (used for import).
     * @param {Array} groups
     */
    replaceAll(groups) {
        this._persist(groups);
    }

    /**
     * Reset groups to the built-in defaults.
     */
    resetToDefaults() {
        this._persist([...DEFAULT_GROUPS]);
    }

    // -------------------------------------------------------------------------
    // Validation
    // -------------------------------------------------------------------------

    /**
     * Validate the structure of an imported groups array.
     * @param {*} data
     * @returns {{ isValid: boolean, error: string|null }}
     */
    validateImport(data) {
        if (!Array.isArray(data)) {
            return { isValid: false, error: 'Expected an array of groups.' };
        }
        const valid = data.every(g =>
            typeof g.id !== 'undefined' &&
            typeof g.name === 'string' &&
            g.name.trim().length > 0 &&
            Array.isArray(g.departments) &&
            g.departments.every(d => typeof d.main === 'string' && typeof d.sub === 'string')
        );
        if (!valid) {
            return { isValid: false, error: 'Each group must have an id, name, and departments array with main/sub entries.' };
        }
        return { isValid: true, error: null };
    }

    // -------------------------------------------------------------------------
    // Export
    // -------------------------------------------------------------------------

    /**
     * Serialize groups to a JSON string for file export.
     * @returns {string}
     */
    exportToJson() {
        return JSON.stringify(this.getAll(), null, 2);
    }

    // -------------------------------------------------------------------------
    // Private
    // -------------------------------------------------------------------------

    _persist(groups) {
        this._groups = groups;
        this._storage.set('coverageGroups', groups);
        this.notify('change', groups);
    }
}
