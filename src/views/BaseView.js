/**
 * BaseView — shared DOM helpers for all views.
 *
 * Inheritance pattern: concrete views extend BaseView to inherit
 * escapeHtml, element lookup, event binding, and toast notification helpers.
 * No business logic lives here — only generic DOM utilities.
 */
export class BaseView {
    /**
     * Escape a string for safe insertion into HTML to prevent XSS.
     * @param {string} text
     * @returns {string}
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = String(text ?? '');
        return div.innerHTML;
    }

    /**
     * Get a DOM element by ID, with a warning if not found.
     * @param {string} id
     * @returns {HTMLElement|null}
     */
    el(id) {
        const el = document.getElementById(id);
        if (!el) console.warn(`[BaseView] Element not found: #${id}`); // eslint-disable-line no-console
        return el;
    }

    /**
     * Bind a DOM event listener, returning an unsubscribe function.
     * @param {HTMLElement} element
     * @param {string} event
     * @param {Function} handler
     * @returns {Function} Unbind function
     */
    on(element, event, handler) {
        if (!element) return () => {};
        element.addEventListener(event, handler);
        return () => element.removeEventListener(event, handler);
    }

    /**
     * Emit a custom event from a DOM element.
     * Used to bubble user actions up to controllers without direct coupling.
     * @param {HTMLElement} element
     * @param {string} eventName
     * @param {*} detail
     */
    emit(element, eventName, detail = null) {
        element.dispatchEvent(new CustomEvent(eventName, { detail, bubbles: true }));
    }

    /**
     * Show a non-blocking toast notification inside the page.
     * Replaces alert() throughout the application.
     *
     * @param {string} message
     * @param {'success'|'error'|'info'} type
     */
    showToast(message, type = 'info') {
        const existing = document.getElementById('app-toast');
        if (existing) existing.remove();

        const colorMap = { success: '#28a745', error: '#dc3545', info: '#17a2b8' };
        const toast = document.createElement('div');
        toast.id = 'app-toast';
        toast.style.cssText = [
            'position:fixed', 'bottom:24px', 'right:24px', 'z-index:9999',
            `background:${colorMap[type] || colorMap.info}`, 'color:#fff',
            'padding:12px 20px', 'border-radius:6px', 'box-shadow:0 4px 12px rgba(0,0,0,0.2)',
            'font-size:14px', 'max-width:320px', 'transition:opacity 0.3s'
        ].join(';');
        toast.textContent = message;

        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; }, 3000);
        setTimeout(() => toast.remove(), 3400);
    }

    /**
     * Show an inline confirmation prompt (replaces confirm() dialog).
     * Returns a Promise that resolves to true/false.
     *
     * @param {string} message
     * @returns {Promise<boolean>}
     */
    showConfirm(message) {
        return new Promise(resolve => {
            const overlay = document.createElement('div');
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

            overlay.innerHTML = `
                <div style="background:#fff;border-radius:8px;padding:24px;max-width:360px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.3);">
                    <p style="margin:0 0 20px;font-size:15px;">${this.escapeHtml(message)}</p>
                    <div style="display:flex;gap:12px;justify-content:flex-end;">
                        <button id="confirm-cancel" class="btn btn-secondary btn-sm">Cancel</button>
                        <button id="confirm-ok" class="btn btn-danger btn-sm">Confirm</button>
                    </div>
                </div>
            `;

            document.body.appendChild(overlay);

            overlay.querySelector('#confirm-ok').addEventListener('click', () => {
                overlay.remove();
                resolve(true);
            });
            overlay.querySelector('#confirm-cancel').addEventListener('click', () => {
                overlay.remove();
                resolve(false);
            });
        });
    }
}
