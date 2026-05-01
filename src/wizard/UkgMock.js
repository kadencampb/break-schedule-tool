/**
 * UkgMock — skeleton renders of the UKG Retail Schedule Planner UI used in the
 * Export-help tutorial. Generic placeholder names and counts only — no PII.
 *
 * Each `renderXxx` returns an HTML string that gets dropped into the wizard's
 * stage. Tutorial sub-steps add a `is-target` class to the element that should
 * pulse, and a CSS dim mask covers everything else.
 */

const PLACEHOLDER_NAMES = ['AB', 'CD', 'EF', 'GH', 'IJ', 'KL'];

// ── Toolbar icons (inline SVG, sized to match UKG's grayscale look) ────────

const ICON_REPORTING_JOBS = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="4" width="13" height="17" rx="1.4"/>
        <path d="M7 4V3h5v1"/>
        <rect x="11" y="9" width="10" height="9" rx="1" fill="white"/>
        <path d="M11 12h10"/>
        <path d="M14 8v2M18 8v2"/>
    </svg>
`;

const ICON_SELECT_ALL = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="1.5"/>
        <rect x="6" y="6"   width="2.5" height="2.5" fill="currentColor"/>
        <rect x="10.75" y="6" width="2.5" height="2.5" fill="currentColor"/>
        <rect x="15.5" y="6"  width="2.5" height="2.5" fill="currentColor"/>
        <rect x="6" y="10.75"  width="2.5" height="2.5" fill="currentColor"/>
        <rect x="15.5" y="10.75" width="2.5" height="2.5" fill="currentColor"/>
        <rect x="6" y="15.5"  width="2.5" height="2.5" fill="currentColor"/>
        <rect x="10.75" y="15.5" width="2.5" height="2.5" fill="currentColor"/>
        <rect x="15.5" y="15.5"  width="2.5" height="2.5" fill="currentColor"/>
    </svg>
`;

const ICON_DELETE = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round">
        <circle cx="12" cy="12" r="9"/>
        <line x1="8" y1="12" x2="16" y2="12"/>
    </svg>
`;

const ICON_RUN_REPORT = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 3h8l3 3v9.5"/>
        <path d="M16 6h-3V3"/>
        <line x1="8" y1="9"  x2="13" y2="9"/>
        <line x1="8" y1="12" x2="13" y2="12"/>
        <line x1="8" y1="15" x2="11" y2="15"/>
        <path d="M5 3v18h6"/>
        <circle cx="17.5" cy="17.5" r="4.5" fill="currentColor" stroke="white" stroke-width="1.4"/>
        <path d="M15.6 17.5h3.4M17.7 15.9l1.5 1.6-1.5 1.6" stroke="white" stroke-width="1.4" fill="none"/>
    </svg>
`;

// UKG Hyperfind icon: bust silhouette (hollow head + shoulders arc) above two
// hollow squares connected by a horizontal line — used as the "Location" picker.
const ICON_HYPERFIND = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="5" r="3"/>
        <path d="M6 13.5 C6 10, 8.5 8.5, 12 8.5 C15.5 8.5, 18 10, 18 13.5"/>
        <line x1="9.5" y1="18.5" x2="14.5" y2="18.5"/>
        <rect x="3.5" y="16" width="6" height="5" rx="0.5"/>
        <rect x="14.5" y="16" width="6" height="5" rx="0.5"/>
    </svg>
`;

export const TUTORIAL_STEPS = [
    {
        title: 'Open UKG first',
        body:  'Sign in to UKG in another tab, then click Next to follow along.',
        render: renderTutorialIntro
    },
    {
        title: 'Open the side menu',
        body:  'Click the hamburger icon in the top-left corner of the home dashboard.',
        render: renderHome
    },
    {
        title: 'Open Dataviews & Reports',
        body:  'In the menu, click <strong>Dataviews &amp; Reports</strong> to expand it.',
        render: renderMenuCollapsed
    },
    {
        title: 'Open the Report Library',
        body:  'Under <strong>Dataviews &amp; Reports</strong>, click <strong>Report Library</strong>.',
        render: renderMenuExpanded
    },
    {
        title: 'Run a new report',
        body:  'In the Report Library toolbar, click <strong>Run Report</strong>.',
        render: renderReportLibrary
    },
    {
        title: 'Choose Custom Reports',
        body:  'In the Select Report panel, expand <strong>Custom Reports</strong>.',
        render: renderSelectReport
    },
    {
        title: 'Pick the daily schedule report',
        body:  'Under <strong>Custom Daily Schedule</strong>, click the indented <strong>Custom Daily Schedule</strong>.',
        render: renderSelectReportExpanded
    },
    {
        title: 'Confirm the selection',
        body:  'Click <strong>Select</strong> at the bottom of the panel.',
        render: renderReportSelected
    },
    {
        title: 'Open the Output Format dropdown',
        body:  'Set <strong>Timeframe</strong> and <strong>Location</strong> as needed, then click the <strong>Output Format</strong> dropdown to change it.',
        render: renderFormPickOutput
    },
    {
        title: 'Choose XLSX',
        body:  'Change the output format to <strong>XLSX</strong>.',
        render: renderFormPickXlsx
    },
    {
        title: 'Run the report',
        body:  'Click <strong>Run Report</strong> at the bottom of the panel.',
        render: renderFormRun
    },
    {
        title: 'Download the report',
        body:  'When the run finishes, click <strong>Ok</strong> to download the file.',
        render: renderReportCompleted
    }
];

// ── Reusable mock chrome ────────────────────────────────────────────────────

function topbar({ targetHamburger = false, title = null } = {}) {
    return `
        <div class="ukg-topbar">
            <div class="ukg-topbar-left">
                <button class="ukg-hamburger ${targetHamburger ? 'is-target' : ''}" aria-hidden="true">
                    <i class="fas fa-bars"></i>
                </button>
                <i class="fas fa-home ukg-topbar-icon"></i>
                ${title ? `<div class="ukg-topbar-title">${title}</div>` : ''}
            </div>
            <div class="ukg-topbar-right">
                <i class="fas fa-search ukg-topbar-icon"></i>
                <i class="far fa-question-circle ukg-topbar-icon"></i>
                <i class="far fa-bell ukg-topbar-icon"></i>
            </div>
        </div>
    `;
}

function dashCard(_title, lines = 6) {
    return `
        <div class="ukg-card">
            <div class="ukg-card-head">
                <div class="ukg-skel-bar ukg-skel-bar-title w-60"></div>
                <div class="ukg-card-actions">
                    <i class="fas fa-arrow-right" aria-hidden="true"></i>
                    <i class="fas fa-ellipsis-v" aria-hidden="true"></i>
                </div>
            </div>
            <div class="ukg-card-body">
                ${Array.from({ length: lines }).map(() => `
                    <div class="ukg-skel-row">
                        <div class="ukg-skel-bar w-40"></div>
                        <div class="ukg-skel-pill"></div>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
}

// ── Step renderers ──────────────────────────────────────────────────────────

function renderTutorialIntro() {
    return `
        <div class="ukg-mock-intro">
            <div class="ukg-mock-intro-icon">
                <i class="fas fa-external-link-alt"></i>
            </div>
            <h3>Open UKG in another tab</h3>
            <button type="button" class="ukg-mock-intro-cta" data-tutorial-action="next">
                I'm signed in to UKG <i class="fas fa-arrow-right"></i>
            </button>
        </div>
    `;
}

function renderHome() {
    return `
        <div class="ukg-canvas">
            ${topbar({ targetHamburger: true })}
            <div class="ukg-banner">
                <div class="ukg-avatar">${PLACEHOLDER_NAMES[0]}</div>
                <div class="ukg-skel-bar w-30 ukg-banner-bar"></div>
            </div>
            <div class="ukg-grid">
                ${dashCard('Manage Schedule')}
                ${dashCard('My Notifications')}
                ${dashCard('Manage Timecards')}
                ${dashCard('My Business Processes')}
                ${dashCard('My Timecard')}
                ${dashCard('My Time Off')}
            </div>
        </div>
    `;
}

function renderMenu({ expanded = true } = {}) {
    // The Dataviews & Reports row is either:
    //   • collapsed + targeted (the user hasn't opened it yet), or
    //   • expanded with Report Library showing + Report Library targeted.
    const items = [
        { label: 'Home',                expanded: false, target: false },
        { label: 'Time',                expanded: false, target: false },
        { label: 'Schedule',            expanded: false, target: false },
        { label: 'Workforce Planning',  expanded: false, target: false },
        { label: 'Dataviews & Reports', expanded,        target: !expanded },
        { label: 'My Information',      expanded: false, target: false },
        { label: 'Maintenance',         expanded: false, target: false }
    ];

    return `
        <div class="ukg-canvas">
            ${topbar()}
            <div class="ukg-menu-overlay">
                <div class="ukg-menu">
                    <div class="ukg-menu-head">
                        <div class="ukg-avatar">${PLACEHOLDER_NAMES[0]}</div>
                        <div>
                            <div class="ukg-skel-bar w-50"></div>
                            <div class="ukg-skel-bar w-30"></div>
                        </div>
                        <button class="ukg-iconbtn-close" aria-hidden="true">×</button>
                    </div>
                    <div class="ukg-menu-search"><div class="ukg-skel-bar w-70"></div></div>
                    <ul class="ukg-menu-list">
                        ${items.map(it => `
                            <li class="ukg-menu-item ${it.expanded ? 'is-expanded' : ''} ${it.target ? 'is-target' : ''}">
                                <span>${it.label}</span>
                                <i class="ukg-caret"></i>
                            </li>
                            ${it.expanded ? `
                                <li class="ukg-menu-sub">Dataview Library</li>
                                <li class="ukg-menu-sub">Group Edit Results</li>
                                <li class="ukg-menu-sub is-target">Report Library</li>
                            ` : ''}
                        `).join('')}
                    </ul>
                </div>
                <div class="ukg-menu-dim"></div>
            </div>
        </div>
    `;
}

function renderMenuCollapsed() { return renderMenu({ expanded: false }); }
function renderMenuExpanded()  { return renderMenu({ expanded: true  }); }

function renderReportLibrary({
    openSidebar    = false,
    expandedCustom = false,
    selectedReport = false
} = {}) {
    const tiles = Array.from({ length: 9 }).map(() => `
        <div class="ukg-report-tile">
            <div class="ukg-skel-bar w-50"></div>
            <div class="ukg-skel-bar w-70"></div>
            <div class="ukg-skel-bar w-40"></div>
            <div class="ukg-skel-pill ukg-skel-pill-xlsx">XLSX</div>
        </div>
    `).join('');

    // Sidebar target hierarchy:
    //   • !expandedCustom            → target the "Custom Reports" category
    //   • expandedCustom + !selected → target the indented "Custom Daily Schedule" sub-item
    //   • expandedCustom + selected  → row stays selected, target moves to the Select button
    const customReportsTarget = openSidebar && !expandedCustom;
    const reportItemTarget    = openSidebar && expandedCustom && !selectedReport;
    const selectButtonTarget  = openSidebar && expandedCustom && selectedReport;
    const buttonsEnabled      = selectedReport;

    return `
        <div class="ukg-canvas">
            ${topbar({ title: 'Report Library' })}
            <div class="ukg-page-head">
                <div class="ukg-toolbar">
                    <button class="ukg-tool-btn" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_REPORTING_JOBS}</span>
                        <span>Reporting<br>Jobs</span>
                    </button>
                    <button class="ukg-tool-btn" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_SELECT_ALL}</span>
                        <span>Select All</span>
                    </button>
                    <button class="ukg-tool-btn ukg-tool-btn-disabled" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_DELETE}</span>
                        <span>Delete</span>
                    </button>
                    <button class="ukg-tool-btn ${!openSidebar ? 'is-target' : ''}" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_RUN_REPORT}</span>
                        <span>Run Report</span>
                    </button>
                </div>
            </div>
            <div class="ukg-page-body ${openSidebar ? 'with-sidebar' : ''}">
                <div class="ukg-tile-grid">${tiles}</div>
                ${openSidebar ? `
                    <aside class="ukg-side-panel">
                        <div class="ukg-side-head">
                            <strong>Select Report</strong>
                            <button class="ukg-iconbtn-close" aria-hidden="true">×</button>
                        </div>
                        <ul class="ukg-side-list">
                            <li><span>All</span><i class="ukg-caret"></i></li>
                            <li><span>Attendance</span><i class="ukg-caret"></i></li>
                            <li class="${customReportsTarget ? 'is-target' : ''} ${expandedCustom ? 'is-expanded' : ''}">
                                <span>Custom Reports</span>
                                <i class="ukg-caret"></i>
                            </li>
                            ${expandedCustom ? `
                                <li class="ukg-side-sub is-expanded">
                                    <span>Custom Daily Schedule</span>
                                    <i class="ukg-caret"></i>
                                </li>
                                <li class="ukg-side-sub-sub ${reportItemTarget ? 'is-target' : ''} ${selectedReport ? 'is-selected' : ''}">
                                    Custom Daily Schedule
                                </li>
                                <li class="ukg-side-sub muted">
                                    <span>Store Weekly Schedule by Employee</span>
                                    <i class="ukg-caret"></i>
                                </li>
                            ` : ''}
                            <li><span>Scheduler</span><i class="ukg-caret"></i></li>
                            <li><span>Timekeeping</span><i class="ukg-caret"></i></li>
                        </ul>
                        <div class="ukg-side-footer">
                            <button class="ukg-pill-btn ${buttonsEnabled ? '' : 'ukg-pill-btn-disabled'}" aria-hidden="true">Cancel</button>
                            <button class="ukg-pill-btn ukg-pill-btn-primary ${buttonsEnabled ? '' : 'ukg-pill-btn-disabled'} ${selectButtonTarget ? 'is-target' : ''}" aria-hidden="true">Select</button>
                        </div>
                    </aside>
                ` : ''}
            </div>
        </div>
    `;
}

function renderSelectReport() {
    return renderReportLibrary({ openSidebar: true });
}

function renderSelectReportExpanded() {
    return renderReportLibrary({ openSidebar: true, expandedCustom: true });
}

function renderReportSelected() {
    return renderReportLibrary({ openSidebar: true, expandedCustom: true, selectedReport: true });
}

function renderFormPickOutput() {
    return renderForm({ outputValue: 'PDF', targetOutput: true });
}
function renderFormPickXlsx() {
    return renderForm({ outputValue: 'PDF', openDropdown: true });
}
function renderFormRun() {
    return renderForm({ outputValue: 'XLSX', targetRun: true });
}

function renderForm({
    targetRun     = false,
    targetOutput  = false,
    openDropdown  = false,
    outputValue   = 'XLSX'
} = {}) {
    return `
        <div class="ukg-canvas">
            ${topbar({ title: 'Report Library' })}
            <div class="ukg-page-head">
                <div class="ukg-toolbar">
                    <button class="ukg-tool-btn" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_REPORTING_JOBS}</span>
                        <span>Reporting<br>Jobs</span>
                    </button>
                    <button class="ukg-tool-btn" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_SELECT_ALL}</span>
                        <span>Select All</span>
                    </button>
                    <button class="ukg-tool-btn ukg-tool-btn-disabled" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_DELETE}</span>
                        <span>Delete</span>
                    </button>
                    <button class="ukg-tool-btn" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_RUN_REPORT}</span>
                        <span>Run Report</span>
                    </button>
                </div>
            </div>
            <div class="ukg-page-body with-sidebar">
                <div class="ukg-tile-grid ukg-tile-grid-faded">
                    ${Array.from({ length: 6 }).map(() => `
                        <div class="ukg-report-tile"><div class="ukg-skel-bar w-50"></div></div>
                    `).join('')}
                </div>
                <aside class="ukg-side-panel">
                    <div class="ukg-side-head">
                        <strong>Custom Daily Schedule</strong>
                        <button class="ukg-iconbtn-close" aria-hidden="true">×</button>
                    </div>
                    <div class="ukg-form-body">
                        <div class="ukg-form-field">
                            <label>Description</label>
                            <div class="ukg-form-readonly">Custom Daily Schedule</div>
                        </div>
                        <div class="ukg-form-field">
                            <label>Timeframe<span class="req">*</span></label>
                            <div class="ukg-form-input ukg-form-input-dropdown">
                                <i class="far fa-calendar-alt ukg-form-input-icon"></i>
                                <span>Today</span>
                                <i class="fas fa-chevron-down ukg-form-input-caret"></i>
                            </div>
                        </div>
                        <div class="ukg-form-field">
                            <label>Location<span class="req">*</span></label>
                            <div class="ukg-form-input ukg-form-input-dropdown">
                                <span class="ukg-form-input-svg">${ICON_HYPERFIND}</span>
                                <span>All Home Locations</span>
                                <i class="fas fa-chevron-down ukg-form-input-caret"></i>
                            </div>
                        </div>
                        <div class="ukg-form-field">
                            <label>Output Format<span class="req">*</span></label>
                            <div class="ukg-form-input ukg-form-input-dropdown ${targetOutput ? 'is-target' : ''} ${openDropdown ? 'is-open' : ''}">
                                <span>${outputValue}</span>
                                <i class="fas fa-chevron-down ukg-form-input-caret"></i>
                            </div>
                            ${openDropdown ? `
                                <div class="ukg-form-dropdown-menu">
                                    <div class="ukg-form-dropdown-option">PDF</div>
                                    <div class="ukg-form-dropdown-option is-target">XLSX</div>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="ukg-side-footer">
                        <button class="ukg-pill-btn" aria-hidden="true">Cancel</button>
                        <button class="ukg-pill-btn ukg-pill-btn-primary ${targetRun ? 'is-target' : ''}" aria-hidden="true">
                            Run Report
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    `;
}

/**
 * Final step — UKG pops a "Report is completed" dialog after the run finishes.
 * Clicking Ok dismisses the dialog and triggers the actual file download.
 */
function renderReportCompleted() {
    const tiles = Array.from({ length: 9 }).map(() => `
        <div class="ukg-report-tile">
            <div class="ukg-skel-bar w-50"></div>
            <div class="ukg-skel-bar w-70"></div>
            <div class="ukg-skel-bar w-40"></div>
            <div class="ukg-skel-pill ukg-skel-pill-xlsx">XLSX</div>
        </div>
    `).join('');

    return `
        <div class="ukg-canvas">
            ${topbar({ title: 'Report Library' })}
            <div class="ukg-page-head">
                <div class="ukg-toolbar">
                    <button class="ukg-tool-btn" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_REPORTING_JOBS}</span>
                        <span>Reporting<br>Jobs</span>
                    </button>
                    <button class="ukg-tool-btn" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_SELECT_ALL}</span>
                        <span>Select All</span>
                    </button>
                    <button class="ukg-tool-btn ukg-tool-btn-disabled" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_DELETE}</span>
                        <span>Delete</span>
                    </button>
                    <button class="ukg-tool-btn" aria-hidden="true">
                        <span class="ukg-tool-icon">${ICON_RUN_REPORT}</span>
                        <span>Run Report</span>
                    </button>
                </div>
            </div>
            <div class="ukg-page-body">
                <div class="ukg-tile-grid ukg-tile-grid-faded">${tiles}</div>
            </div>
            <div class="ukg-modal-backdrop"></div>
            <div class="ukg-modal" role="dialog">
                <div class="ukg-modal-head">
                    <i class="fas fa-check-circle ukg-modal-check"></i>
                    <strong>Report is completed</strong>
                    <button class="ukg-iconbtn-close" aria-hidden="true">×</button>
                </div>
                <div class="ukg-modal-body">Custom Daily Schedule Report is completed</div>
                <div class="ukg-modal-foot">
                    <button class="ukg-pill-btn ukg-pill-btn-primary is-target" aria-hidden="true">Ok</button>
                </div>
            </div>
        </div>
    `;
}
