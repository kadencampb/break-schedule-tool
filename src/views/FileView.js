import { BaseView } from './BaseView.js';

/**
 * FileView — manages the file upload and download UI.
 *
 * Extends BaseView (Inheritance pattern).
 * Emits 'file:selected' when the user picks a file,
 * and 'file:process' when the download button is clicked.
 */
export class FileView extends BaseView {
    constructor() {
        super();
        this._selectedFile = null;
    }

    /**
     * Wire up all file-related UI interactions.
     * @param {HTMLElement} root - Root element to emit events from
     */
    bind(root) {
        const selectBtn = this.el('selectFileButton');
        const fileInput = this.el('fileInput');
        const downloadLink = this.el('downloadLink');

        this.on(selectBtn, 'click', () => fileInput?.click());

        this.on(fileInput, 'change', (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Validate file type before accepting
            if (!file.name.endsWith('.xlsx')) {
                this.showToast('Please select an .xlsx file.', 'error');
                return;
            }

            this._selectedFile = file;
            this._updateFileDisplay(file.name);
            this.emit(root, 'file:selected', { file });
        });

        this.on(downloadLink, 'click', (e) => {
            e.preventDefault();
            if (!this._selectedFile) {
                this.showToast('Please select a file first.', 'error');
                return;
            }
            this.emit(root, 'file:process', { file: this._selectedFile });
        });
    }

    /**
     * Show a processing/loading state on the download button.
     * @param {boolean} isProcessing
     */
    setProcessing(isProcessing) {
        const btn = this.el('downloadLink');
        if (!btn) return;
        if (isProcessing) {
            btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Processing...';
            btn.style.pointerEvents = 'none';
            btn.style.opacity = '0.7';
        } else {
            btn.innerHTML = '<i class="fas fa-download mr-2"></i>Save Schedule';
            btn.style.pointerEvents = '';
            btn.style.opacity = '';
        }
    }

    /**
     * Show the download section (hidden until a file is selected).
     */
    showDownloadSection() {
        this.el('downloadLinkContainer')?.classList.remove('d-none');
    }

    /** @private */
    _updateFileDisplay(fileName) {
        const display = this.el('selectedFileName');
        if (!display) return;
        display.textContent = fileName;
        display.classList.remove('badge-secondary');
        display.classList.add('badge-success');
        this.showDownloadSection();
    }
}
