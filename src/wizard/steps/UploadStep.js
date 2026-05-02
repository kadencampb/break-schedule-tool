import { escapeHtml as escape } from '../util.js';

/**
 * UploadStep — file picker / drag-drop for the .xlsx export.
 * On select: parses + transitions to departments step.
 */
export function renderUpload(el, state, callbacks) {
    const upload = state.upload;
    const hasFile = !!upload.file;

    el.innerHTML = `
        <div class="wizard-card">
            <div class="wizard-card-eyebrow">Step 1 of 2</div>
            <h2 class="wizard-card-title">Drag and drop the daily schedule</h2>
            <p class="wizard-card-subtitle">
                Drop your <code>Custom Daily Schedule</code> .xlsx file here, or click to browse.
            </p>

            <div class="wizard-dropzone ${hasFile ? 'has-file' : ''}" data-action="dropzone" tabindex="0">
                <input type="file" accept=".xlsx" id="wizardFileInput" hidden>
                ${hasFile ? `
                    <div class="wizard-dropzone-content">
                        <i class="fas fa-file-excel" aria-hidden="true"></i>
                        <div class="wizard-dropzone-title">${escape(upload.file.name)}</div>
                        <div class="wizard-dropzone-sub">${formatFileSize(upload.file.size)} · click to choose another</div>
                    </div>
                ` : `
                    <div class="wizard-dropzone-content">
                        <i class="far fa-file-excel" aria-hidden="true"></i>
                        <div class="wizard-dropzone-title">Drop the .xlsx file here</div>
                        <div class="wizard-dropzone-sub">or click to choose from your computer</div>
                    </div>
                `}
            </div>

            <div class="wizard-callout wizard-callout-info">
                <i class="fas fa-shield-alt"></i>
                Files are processed entirely in your browser. No employee data leaves your device.
            </div>

            <button type="button" class="wizard-btn-link wizard-help-link" data-action="help">
                <i class="far fa-question-circle"></i> Need help getting the file?
            </button>

            <div class="wizard-nav">
                <button type="button" class="wizard-btn wizard-btn-ghost" data-action="back">
                    <i class="fas fa-arrow-left"></i> Back
                </button>
                <button type="button" class="wizard-btn wizard-btn-primary" data-action="continue" ${hasFile ? '' : 'disabled'}>
                    Next <i class="fas fa-arrow-right"></i>
                </button>
            </div>
        </div>
    `;

    const dropzone = el.querySelector('[data-action="dropzone"]');
    const input    = el.querySelector('#wizardFileInput');

    dropzone?.addEventListener('click', () => input?.click());
    dropzone?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input?.click(); }
    });
    dropzone?.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-dragover'); });
    dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('is-dragover'));
    dropzone?.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('is-dragover');
        const file = e.dataTransfer.files[0];
        if (file) callbacks.onFileSelected(file);
    });

    input?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) callbacks.onFileSelected(file);
    });

    el.querySelector('[data-action="back"]')?.addEventListener('click', callbacks.onBack);
    el.querySelector('[data-action="continue"]')?.addEventListener('click', callbacks.onContinue);
    el.querySelector('[data-action="help"]')?.addEventListener('click', callbacks.onShowTutorial);
}

function formatFileSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
