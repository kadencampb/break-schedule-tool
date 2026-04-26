import { StorageFacade }        from '../facades/StorageFacade.js';
import { ExcelFacade }          from '../facades/ExcelFacade.js';
import { SettingsModel }        from '../models/SettingsModel.js';
import { CoverageGroupModel }   from '../models/CoverageGroupModel.js';
import { GroupsView }           from '../views/GroupsView.js';
import { ModalView }            from '../views/ModalView.js';
import { FileView }             from '../views/FileView.js';
import { SettingsView }         from '../views/SettingsView.js';
import { GroupController }      from './GroupController.js';
import { SchedulerController }  from './SchedulerController.js';

/**
 * AppController — root of the application.
 *
 * Instantiates and wires together all facades, models, views, and controllers.
 * This is the only place where dependencies are assembled (Composition Root).
 *
 * Call app.init() once on DOMContentLoaded.
 */
export class AppController {
    init() {
        // ── Facades ──────────────────────────────────────────────────────────
        const storage = new StorageFacade('breakSchedule');
        const excel   = new ExcelFacade();

        // ── Models ───────────────────────────────────────────────────────────
        const settingsModel = new SettingsModel(storage);
        const groupModel    = new CoverageGroupModel(storage);

        // ── Views ────────────────────────────────────────────────────────────
        const groupsContainer = document.getElementById('groupsContainer');
        const groupsView      = new GroupsView(groupsContainer);
        const modalView       = new ModalView();
        const fileView        = new FileView();
        const settingsView    = new SettingsView();

        // ── Render initial settings state ────────────────────────────────────
        settingsView.renderHours(settingsModel.getHoursByDay());
        settingsView.renderAdvancedSettings(settingsModel.getAdvancedSettings());
        settingsView.renderSelectedState(settingsModel.getSelectedState());

        // ── Controllers ──────────────────────────────────────────────────────
        const root = document.getElementById('app-root') || document.body;

        const groupCtrl     = new GroupController(groupModel, groupsView, modalView);
        const schedulerCtrl = new SchedulerController(excel, settingsModel, groupModel, fileView);

        groupCtrl.init(root);
        schedulerCtrl.init(root);

        // ── Bind settings view to models ─────────────────────────────────────
        fileView.bind(root);
        settingsView.bind(root);

        root.addEventListener('settings:hours-change', (e) => {
            settingsModel.setHoursByDay(e.detail.hours);
        });

        root.addEventListener('settings:advanced-change', (e) => {
            settingsModel.setAdvancedSettings(e.detail.settings);
        });

        root.addEventListener('settings:advanced-reset', () => {
            import('../core/constants.js').then(({ DEFAULT_ADVANCED_SETTINGS: defaults }) => {
                settingsModel.setAdvancedSettings(defaults);
                settingsView.renderAdvancedSettings(defaults);
                settingsView.showToast('Advanced settings reset to defaults.', 'success');
            });
        });

        root.addEventListener('settings:state-change', (e) => {
            settingsModel.setSelectedState(e.detail.state);
        });
    }
}
