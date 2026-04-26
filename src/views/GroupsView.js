import { BaseView } from './BaseView.js';

/**
 * GroupsView — renders the coverage groups list.
 *
 * Extends BaseView (Inheritance pattern).
 * Receives data from GroupController; emits 'group:edit' and 'group:delete' events
 * that the controller listens for.
 */
export class GroupsView extends BaseView {
    /**
     * @param {HTMLElement} container - The element to render groups into
     */
    constructor(container) {
        super();
        this._container = container;
    }

    /**
     * Render the full groups list.
     * @param {Array<{ id: number, name: string, departments: Array<{main, sub}> }>} groups
     */
    render(groups) {
        if (!this._container) return;

        if (!groups.length) {
            this._container.innerHTML = '<p class="text-muted">No coverage optimization groups configured.</p>';
            return;
        }

        this._container.innerHTML = groups.map(group => this._groupCard(group)).join('');

        // Wire up Edit and Delete buttons
        this._container.querySelectorAll('.edit-group-btn').forEach(btn => {
            this.on(btn, 'click', () => {
                const id = parseInt(btn.dataset.groupId, 10);
                this.emit(this._container, 'group:edit', { id });
            });
        });

        this._container.querySelectorAll('.delete-group-btn').forEach(btn => {
            this.on(btn, 'click', () => {
                const id = parseInt(btn.dataset.groupId, 10);
                const name = btn.dataset.groupName;
                this.emit(this._container, 'group:delete', { id, name });
            });
        });
    }

    /** @private */
    _groupCard(group) {
        const deptCount = group.departments.length;
        const deptList = group.departments
            .map(d => `<div>&bull; ${this.escapeHtml(d.main)} / ${this.escapeHtml(d.sub)}</div>`)
            .join('');

        return `
            <div class="card mb-2">
                <div class="card-body p-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div class="flex-grow-1">
                            <h6 class="mb-2 font-weight-bold">
                                ${this.escapeHtml(group.name)}
                                <span class="badge badge-warning ml-2">${deptCount} dept${deptCount !== 1 ? 's' : ''}</span>
                            </h6>
                            <div class="small" style="color:#4a5568;">${deptList}</div>
                        </div>
                        <div class="d-flex ml-3">
                            <button class="btn btn-sm btn-outline-info edit-group-btn mr-2"
                                    data-group-id="${group.id}">
                                <i class="fas fa-edit mr-1"></i>Edit
                            </button>
                            <button class="btn btn-sm btn-outline-danger delete-group-btn"
                                    data-group-id="${group.id}"
                                    data-group-name="${this.escapeHtml(group.name)}">
                                <i class="fas fa-trash mr-1"></i>Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }
}
