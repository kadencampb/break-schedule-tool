/**
 * Toast — small bottom-right notifications for wizard narration ("Demarco's
 * meal at 1:00 PM", "Liwanag breaking with Reyes — shifting to 2:15 PM").
 *
 * Toasts auto-dismiss after a configurable timeout, stack vertically, and
 * survive view re-renders (mounted on document.body, not the wizard root).
 */
let stackEl = null;

function ensureStack() {
    if (stackEl && document.body.contains(stackEl)) return stackEl;
    stackEl = document.createElement('div');
    stackEl.className = 'wizard-toast-stack';
    document.body.appendChild(stackEl);
    return stackEl;
}

/**
 * Show a toast.
 * @param {string} message - text content (HTML escaped)
 * @param {Object} options
 * @param {string} [options.tone='info'] - 'info' | 'success' | 'shift'
 * @param {number} [options.duration=3500] - ms before auto-dismiss
 */
export function showToast(message, { tone = 'info', duration = 3500 } = {}) {
    const stack = ensureStack();
    const toast = document.createElement('div');
    toast.className = `wizard-toast wizard-toast-${tone}`;
    toast.textContent = message;
    stack.appendChild(toast);

    // Animate in on next frame
    requestAnimationFrame(() => toast.classList.add('is-visible'));

    setTimeout(() => {
        toast.classList.remove('is-visible');
        toast.classList.add('is-leaving');
        setTimeout(() => toast.remove(), 320);
    }, duration);
}

export function clearToasts() {
    if (stackEl) stackEl.innerHTML = '';
}
