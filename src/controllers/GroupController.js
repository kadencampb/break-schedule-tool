/**
 * GroupController — coordinates CoverageGroupModel, GroupsView, and ModalView.
 *
 * Handles all group CRUD operations:
 * - Listens for user actions from the view (edit/delete/add buttons, modal save)
 * - Calls the model to mutate data
 * - Triggers view re-render
 * - Handles export/import/reset operations
 */
export class GroupController {
    /**
     * @param {CoverageGroupModel} model
     * @param {GroupsView}         groupsView
     * @param {ModalView}          modalView
     */
    constructor(model, groupsView, modalView) {
        this._model     = model;
        this._groupsView = groupsView;
        this._modal     = modalView;
    }

    /**
     * Initialize: bind model events → view re-renders, bind view events → controller handlers.
     * @param {HTMLElement} root - Root element where view events bubble up
     */
    init(root) {
        // Model → View: re-render whenever data changes
        this._model.subscribe('change', (groups) => {
            this._groupsView.render(groups);
        });

        // Initial render
        this._groupsView.render(this._model.getAll());

        // Wire up modal save button
        this._modal.bindSave(root);

        // View → Controller: group events from the groups list
        root.addEventListener('group:edit', (e) => this._handleEdit(e.detail.id));
        root.addEventListener('group:delete', (e) => this._handleDelete(e.detail.id, e.detail.name));

        // Modal save
        root.addEventListener('modal:save', (e) => this._handleModalSave(e.detail));

        // Add group button
        document.getElementById('addGroupBtn')?.addEventListener('click', () => {
            this._modal.openForAdd();
        });

        // Export / Import / Reset
        document.getElementById('exportGroupsBtn')?.addEventListener('click', () => this._handleExport());
        document.getElementById('importGroupsBtn')?.addEventListener('click', () => {
            document.getElementById('importGroupsInput')?.click();
        });
        document.getElementById('importGroupsInput')?.addEventListener('change', (e) => {
            if (e.target.files[0]) {
                this._handleImport(e.target.files[0]);
                e.target.value = '';
            }
        });
        document.getElementById('resetGroupsBtn')?.addEventListener('click', () => this._handleReset());
    }

    /** @private */
    _handleEdit(groupId) {
        const group = this._model.getById(groupId);
        if (!group) return;
        const allAssigned = this._model.getAllAssignedDepartments();
        this._modal.openForEdit(group, allAssigned);
    }

    /** @private */
    async _handleDelete(groupId, groupName) {
        const ok = await this._groupsView.showConfirm(
            `Are you sure you want to delete the group "${groupName}"?`
        );
        if (ok) {
            this._model.delete(groupId);
        }
    }

    /** @private */
    _handleModalSave({ id, name, departments }) {
        if (id === null) {
            this._model.add(name, departments);
        } else {
            this._model.update(id, name, departments);
        }
        this._modal.close();
    }

    /** @private */
    _handleExport() {
        const json = this._model.exportToJson();
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'coverage-groups.json';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }

    /** @private */
    _handleImport(file) {
        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const data = JSON.parse(e.target.result);
                const { isValid, error } = this._model.validateImport(data);
                if (!isValid) {
                    this._groupsView.showToast(`Import failed: ${error}`, 'error');
                    return;
                }
                const ok = await this._groupsView.showConfirm('This will replace all existing groups. Continue?');
                if (ok) {
                    this._model.replaceAll(data);
                    this._groupsView.showToast('Groups imported successfully.', 'success');
                }
            } catch {
                this._groupsView.showToast('Could not parse the file. Make sure it is a valid JSON file.', 'error');
            }
        };
        reader.readAsText(file);
    }

    /** @private */
    async _handleReset() {
        const ok = await this._groupsView.showConfirm(
            'This will reset all groups to the default configuration. All custom groups will be lost.'
        );
        if (ok) {
            this._model.resetToDefaults();
            this._groupsView.showToast('Groups reset to defaults.', 'success');
        }
    }
}
