import { BaseView } from '../views/BaseView.js';
import * as Landing    from './steps/LandingStep.js';
import * as HaveFile   from './steps/HaveFileStep.js';
import * as ExportHelp from './steps/ExportHelpStep.js';
import * as Upload     from './steps/UploadStep.js';
import * as State      from './steps/StateStep.js';
import * as Workspace  from './steps/WorkspaceStep.js';

const STEP_MODULES = {
    'landing':     Landing,
    'have-file':   HaveFile,
    'export-help': ExportHelp,
    'upload':      Upload,
    'state':       State,
    'workspace':   Workspace
};

/**
 * WizardView — renders the active step into the wizard root.
 *
 * Layouts:
 *   'full'      — renderer writes directly to the step element
 *   'split'     — sidebar + stage pre-built; renderer fills both panes
 *   'workspace' — nav rail + config panel + preview area pre-built
 */
export class WizardView extends BaseView {
    constructor(root) {
        super();
        this._root = root;
        this._lastLayout = null;
    }

    render(state, callbacks) {
        const mod = STEP_MODULES[state.step];
        if (!mod) {
            this._root.innerHTML = `<div class="wizard-error">Unknown step: ${this.escapeHtml(state.step)}</div>`;
            return;
        }

        const layout = mod.LAYOUT === 'split' ? 'split'
            : mod.LAYOUT === 'workspace' ? 'workspace'
            : 'full';
        const renderer = mod[Object.keys(mod).find(k => k.startsWith('render'))];
        if (typeof renderer !== 'function') return;

        // Save scroll positions so re-renders feel stable.
        const savedSidebar  = this._root.querySelector('.wizard-sidebar-content')?.scrollTop;
        const savedStage    = this._root.querySelector('.wizard-stage-content')?.scrollTop;
        const savedPanel    = this._root.querySelector('.wizard-panel-body')?.scrollTop;
        const savedPreview  = this._root.querySelector('.wizard-workspace-preview-content')?.scrollTop;

        const layoutChanged = layout !== this._lastLayout;
        this._lastLayout = layout;

        if (layoutChanged) this._root.classList.add('is-transitioning', 'is-layout-changing');

        Promise.resolve().then(() => {
            this._root.dataset.layout = layout;
            this._root.innerHTML = `
                <div class="wizard-step wizard-step-${state.step}" data-step="${state.step}">
                    ${layout === 'split' ? `
                        <aside class="wizard-sidebar">
                            <div class="wizard-sidebar-content"></div>
                        </aside>
                        <section class="wizard-stage">
                            <div class="wizard-stage-content"></div>
                        </section>
                    ` : layout === 'workspace' ? `
                        <div class="wizard-workspace-runbar"></div>
                        <nav class="wizard-workspace-nav"></nav>
                        <div class="wizard-workspace-panel"></div>
                        <section class="wizard-workspace-preview-area"></section>
                    ` : ''}
                </div>
            `;

            const stepEl = this._root.firstElementChild;
            renderer(stepEl, state, callbacks, this);

            if (!layoutChanged) {
                const s = this._root.querySelector('.wizard-sidebar-content');
                const g = this._root.querySelector('.wizard-stage-content');
                const p = this._root.querySelector('.wizard-panel-body');
                const v = this._root.querySelector('.wizard-workspace-preview-content');
                if (s && savedSidebar != null) s.scrollTop = savedSidebar;
                if (g && savedStage   != null) g.scrollTop = savedStage;
                if (p && savedPanel   != null) p.scrollTop = savedPanel;
                if (v && savedPreview != null) v.scrollTop = savedPreview;
            }

            requestAnimationFrame(() => {
                this._root.classList.remove('is-transitioning', 'is-layout-changing');
            });
        });
    }
}
