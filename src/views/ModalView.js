import { BaseView } from './BaseView.js';
// Department registry was retired in favor of auto-detected groups in the
// wizard's Departments step. This legacy modal renders an empty picker if it
// happens to be opened — its features now live in the wizard.
const DEPARTMENT_REGISTRY = {};

/**
 * ModalView — manages the add/edit coverage group modal.
 *
 * Extends BaseView (Inheritance pattern).
 * Emits 'modal:save' when the user submits the form.
 * Maintains internal state for the currently selected departments.
 */
export class ModalView extends BaseView {
    constructor() {
        super();
        /** @type {Array<{main: string, sub: string}>} */
        this._selectedDepts = [];
        /** @type {number|null} */
        this._editingGroupId = null;
    }

    /**
     * Open the modal in "add" mode.
     */
    openForAdd() {
        this._editingGroupId = null;
        this._selectedDepts = [];
        this.el('groupModalLabel').textContent = 'Add Coverage Group';
        this.el('groupNameInput').value = '';
        this.el('departmentSearchInput').value = '';
        this._renderDepartmentPicker([]);
        this._updateSelectedDisplay();
        window.$('#groupModal').modal('show');
    }

    /**
     * Open the modal in "edit" mode, pre-populated with existing group data.
     * @param {{ id: number, name: string, departments: Array<{main, sub}> }} group
     * @param {Array<{main, sub}>} allAssignedDepts - All depts assigned to any group
     */
    openForEdit(group, allAssignedDepts) {
        this._editingGroupId = group.id;
        this._selectedDepts = [...group.departments];
        this.el('groupModalLabel').textContent = 'Edit Coverage Group';
        this.el('groupNameInput').value = group.name;
        this.el('departmentSearchInput').value = '';
        this._renderDepartmentPicker(allAssignedDepts, group.departments);
        this._updateSelectedDisplay();
        window.$('#groupModal').modal('show');
    }

    /**
     * Close the modal programmatically.
     */
    close() {
        window.$('#groupModal').modal('hide');
    }

    /**
     * Wire up the Save button to emit 'modal:save'.
     * @param {HTMLElement} triggerElement - Element to emit the event from
     */
    bindSave(triggerElement) {
        const btn = this.el('saveGroupBtn');
        this.on(btn, 'click', () => {
            const name = this.el('groupNameInput')?.value.trim() ?? '';

            if (!name) {
                this.showToast('Please enter a group name.', 'error');
                return;
            }
            if (!this._selectedDepts.length) {
                this.showToast('Please select at least one department.', 'error');
                return;
            }

            this.emit(triggerElement, 'modal:save', {
                id: this._editingGroupId,
                name,
                departments: [...this._selectedDepts]
            });
        });
    }

    /** @private */
    _renderDepartmentPicker(allAssignedDepts, currentGroupDepts = []) {
        const accordion = this.el('departmentAccordion');
        if (!accordion) return;

        accordion.innerHTML = '';

        // Group all departments by category
        const categories = Object.keys(DEPARTMENT_REGISTRY).sort();

        categories.forEach((category, index) => {
            const subs = [...DEPARTMENT_REGISTRY[category]].sort();
            const cardId = `cat-${index}`;

            const card = document.createElement('div');
            card.className = 'card';

            card.innerHTML = `
                <div class="card-header p-2" id="heading-${cardId}">
                    <button class="btn btn-link btn-sm btn-block text-left p-0" type="button"
                            data-toggle="collapse" data-target="#collapse-${cardId}"
                            aria-expanded="${index === 0}">
                        ${this.escapeHtml(category)} (${subs.length})
                    </button>
                </div>
                <div id="collapse-${cardId}" class="collapse ${index === 0 ? 'show' : ''}"
                     data-parent="#departmentAccordion">
                    <div class="card-body p-2">
                        ${subs.map(sub => this._deptCheckbox(category, sub, allAssignedDepts, currentGroupDepts)).join('')}
                    </div>
                </div>
            `;

            accordion.appendChild(card);
        });

        // Attach checkbox change listeners
        accordion.querySelectorAll('.dept-picker-checkbox').forEach(cb => {
            this.on(cb, 'change', () => this._handleCheckboxChange(cb));
        });

        // Attach search input listener
        const search = this.el('departmentSearchInput');
        if (search) {
            this.on(search, 'input', () => this._filterDepartments(search.value));
        }
    }

    /** @private */
    _deptCheckbox(main, sub, allAssignedDepts, currentGroupDepts) {
        const isSelected = this._selectedDepts.some(d => d.main === main && d.sub === sub);
        const isInOtherGroup = allAssignedDepts.some(d =>
            d.main === main && d.sub === sub &&
            !currentGroupDepts.some(cd => cd.main === main && cd.sub === sub)
        );

        const id = `dept-${this.escapeHtml(main)}-${this.escapeHtml(sub)}`;
        const labelText = isInOtherGroup
            ? `${this.escapeHtml(sub)} <em class="text-muted" style="font-size:0.85em;">(already in group)</em>`
            : this.escapeHtml(sub);

        return `
            <div class="form-check">
                <input type="checkbox" class="form-check-input dept-picker-checkbox"
                       id="${id}"
                       data-main="${this.escapeHtml(main)}"
                       data-sub="${this.escapeHtml(sub)}"
                       ${isSelected ? 'checked' : ''}
                       ${isInOtherGroup ? 'disabled' : ''}>
                <label class="form-check-label small ${isInOtherGroup ? 'text-muted' : ''}" for="${id}"
                       style="${isInOtherGroup ? 'cursor:not-allowed;' : ''}">
                    ${labelText}
                </label>
            </div>
        `;
    }

    /** @private */
    _handleCheckboxChange(checkbox) {
        const { main, sub } = checkbox.dataset;
        if (checkbox.checked) {
            if (!this._selectedDepts.some(d => d.main === main && d.sub === sub)) {
                this._selectedDepts.push({ main, sub });
            }
        } else {
            this._selectedDepts = this._selectedDepts.filter(d => !(d.main === main && d.sub === sub));
        }
        this._updateSelectedDisplay();
    }

    /** @private */
    _updateSelectedDisplay() {
        const display = this.el('selectedDepartments');
        if (!display) return;

        if (!this._selectedDepts.length) {
            display.innerHTML = '<span class="text-muted">No departments selected</span>';
            return;
        }

        display.innerHTML = this._selectedDepts.map(d => `
            <span class="badge badge-primary mr-1 mb-1">
                ${this.escapeHtml(d.main)} / ${this.escapeHtml(d.sub)}
                <button type="button" class="close ml-1" style="font-size:1rem;"
                        data-main="${this.escapeHtml(d.main)}"
                        data-sub="${this.escapeHtml(d.sub)}">
                    &times;
                </button>
            </span>
        `).join('');

        display.querySelectorAll('.close').forEach(btn => {
            this.on(btn, 'click', () => {
                const { main, sub } = btn.dataset;
                this._selectedDepts = this._selectedDepts.filter(d => !(d.main === main && d.sub === sub));
                const cb = document.querySelector(`.dept-picker-checkbox[data-main="${main}"][data-sub="${sub}"]`);
                if (cb) cb.checked = false;
                this._updateSelectedDisplay();
            });
        });
    }

    /** @private */
    _filterDepartments(searchTerm) {
        const lower = searchTerm.toLowerCase().trim();
        document.querySelectorAll('#departmentAccordion .card').forEach(card => {
            let anyVisible = false;
            card.querySelectorAll('.dept-picker-checkbox').forEach(cb => {
                const match = !lower || `${cb.dataset.main} ${cb.dataset.sub}`.toLowerCase().includes(lower);
                const formCheck = cb.closest('.form-check');
                if (formCheck) formCheck.style.display = match ? 'block' : 'none';
                if (match) anyVisible = true;
            });
            card.style.display = anyVisible ? 'block' : 'none';
        });
    }
}
