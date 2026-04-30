import { BaseView } from '../views/BaseView.js';
import * as Landing      from './steps/LandingStep.js';
import * as HaveFile     from './steps/HaveFileStep.js';
import * as ExportHelp   from './steps/ExportHelpStep.js';
import * as Upload       from './steps/UploadStep.js';
import * as State        from './steps/StateStep.js';
import * as Departments  from './steps/DepartmentsStep.js';
import * as Hours        from './steps/HoursStep.js';
import * as Review       from './steps/ReviewStep.js';
import * as Running      from './steps/RunningStep.js';
import * as Done         from './steps/DoneStep.js';

const STEP_MODULES = {
    'landing':     Landing,
    'have-file':   HaveFile,
    'export-help': ExportHelp,
    'upload':      Upload,
    'state':       State,
    'departments': Departments,
    'hours':       Hours,
    'review':      Review,
    'running':     Running,
    'done':        Done
};

/**
 * WizardView — renders the active step into the wizard root.
 *
 * Each step module exports:
 *   - a render function (named like `renderXxx`)
 *   - LAYOUT: 'full' (default) | 'split'
 *
 * For 'split' steps, the view pre-builds a sidebar + stage layout and the
 * step's renderer fills both panes. For 'full' steps, the renderer writes to
 * the entire step element.
 */
export class WizardView extends BaseView {
    /** @param {HTMLElement} root - The #wizardRoot element */
    constructor(root) {
        super();
        this._root = root;
        this._lastLayout = null;
    }

    /**
     * Render the current step.
     * @param {Object} state - Full wizard state (from controller)
     * @param {Object} callbacks - Step-specific callbacks
     */
    render(state, callbacks) {
        const mod = STEP_MODULES[state.step];
        if (!mod) {
            this._root.innerHTML = `<div class="wizard-error">Unknown step: ${this.escapeHtml(state.step)}</div>`;
            return;
        }

        const layout = mod.LAYOUT === 'split' ? 'split' : 'full';
        const renderer = mod[Object.keys(mod).find(k => k.startsWith('render'))];
        if (typeof renderer !== 'function') return;

        // Capture scroll positions of split-pane content so the user doesn't
        // lose context when state changes trigger a re-render (e.g. dragging
        // a dept between groups).
        const savedSidebar = this._root.querySelector('.wizard-sidebar-content')?.scrollTop;
        const savedStage   = this._root.querySelector('.wizard-stage-content')?.scrollTop;

        const layoutChanged = layout !== this._lastLayout;
        this._lastLayout = layout;

        // Only fade when layout actually changes — otherwise re-renders on the
        // same layout (drag/drop, checkbox toggles) feel snappy.
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
                    ` : ''}
                </div>
            `;

            const stepEl = this._root.firstElementChild;
            renderer(stepEl, state, callbacks, this);

            // Restore scroll positions if the layout didn't change
            if (!layoutChanged) {
                const newSidebar = this._root.querySelector('.wizard-sidebar-content');
                const newStage   = this._root.querySelector('.wizard-stage-content');
                if (newSidebar && savedSidebar != null) newSidebar.scrollTop = savedSidebar;
                if (newStage   && savedStage   != null) newStage.scrollTop   = savedStage;
            }

            requestAnimationFrame(() => {
                this._root.classList.remove('is-transitioning');
                this._root.classList.remove('is-layout-changing');
            });
        });
    }
}
