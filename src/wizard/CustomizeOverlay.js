/**
 * CustomizeOverlay — modal that lets the review step edit advanced settings
 * with the existing graphic-rich editors from the legacy shell.
 *
 * Implementation: the legacy shell already has the rest-period graphic, meal
 * placement graphic, and segmented controls wired via SettingsView. We move
 * (not clone) the inner panel into the overlay so all existing IDs and event
 * listeners keep working without rebinding. On close, we move it back.
 */

let overlay   = null;
let movedNode = null;
let homeParent = null;
let onCloseCb = null;

function ensureOverlay() {
    if (overlay && document.body.contains(overlay)) return overlay;
    overlay = document.createElement('div');
    overlay.className = 'wizard-customize-overlay';
    overlay.innerHTML = `
        <div class="wizard-customize-panel" role="dialog" aria-labelledby="wizardCustomizeTitle">
            <header class="wizard-customize-head">
                <h2 id="wizardCustomizeTitle">Customize advanced settings</h2>
                <button type="button" class="wizard-customize-close" data-close aria-label="Close">×</button>
            </header>
            <div class="wizard-customize-body" data-customize-slot></div>
            <footer class="wizard-customize-foot">
                <button type="button" class="wizard-btn wizard-btn-primary" data-close>
                    <i class="fas fa-check"></i> Done
                </button>
            </footer>
        </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelectorAll('[data-close]').forEach(btn =>
        btn.addEventListener('click', closeCustomize)
    );
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) closeCustomize();
    });
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay?.classList.contains('is-open')) closeCustomize();
    });
    return overlay;
}

/**
 * Open the customize modal. The legacy shell's #advancedSettingsCollapse inner
 * content gets reparented into the modal slot so existing SettingsView bindings
 * (slider events, segmented control clicks, etc.) continue to fire untouched.
 *
 * @param {Object} options
 * @param {Function} [options.onClose] - called after the modal closes
 */
export function openCustomize({ onClose } = {}) {
    const collapse = document.getElementById('advancedSettingsCollapse');
    if (!collapse) return;
    const node = collapse.firstElementChild;
    if (!node) return;

    const ov = ensureOverlay();
    const slot = ov.querySelector('[data-customize-slot]');
    homeParent = collapse;
    movedNode  = node;
    onCloseCb  = onClose || null;

    slot.appendChild(node);
    ov.classList.add('is-open');
    document.body.style.overflow = 'hidden';
}

export function closeCustomize() {
    if (!overlay) return;

    if (movedNode && homeParent) {
        homeParent.appendChild(movedNode);
        movedNode = null;
        homeParent = null;
    }

    overlay.classList.remove('is-open');
    document.body.style.overflow = '';

    if (onCloseCb) {
        const cb = onCloseCb;
        onCloseCb = null;
        cb();
    }
}
