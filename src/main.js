import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';
import '../style.css';
import './bootstrap-shim.js'; // Sets window.$ / window.jQuery before bootstrap evaluates
import 'bootstrap'; // Bootstrap 4 JS — modal, collapse, dropdown

import { AppController } from './controllers/AppController.js';
import { WizardController } from './wizard/WizardController.js';
import { StorageFacade } from './facades/StorageFacade.js';
import { ExcelFacade } from './facades/ExcelFacade.js';
import { SettingsModel } from './models/SettingsModel.js';
import { CoverageGroupModel } from './models/CoverageGroupModel.js';

document.addEventListener('DOMContentLoaded', () => {
    // Boot the legacy single-page UI first so its DOM bindings are wired
    // (SettingsView, CoverageGroupModel, etc. — the wizard's "Customize"
    // option still uses these graphic editors). The legacy shell is hidden
    // by default; only the wizard is visible.
    new AppController().init();

    // Boot the wizard on top, sharing the same facades/models so persisted
    // settings flow through both UIs.
    const storage  = new StorageFacade('breakSchedule');
    const excel    = new ExcelFacade();
    const settings = new SettingsModel(storage);
    const groups   = new CoverageGroupModel(storage);
    const wizardRoot = document.getElementById('wizardRoot');

    if (wizardRoot) {
        new WizardController({ storage, excel, settings, groups, root: wizardRoot }).init();
    }
});
