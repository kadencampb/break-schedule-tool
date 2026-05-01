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
        body:  'In the menu, expand <strong>Dataviews &amp; Reports</strong> and click <strong>Report Library</strong>.',
        render: renderMenu
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
        body:  'Choose <strong>Custom Daily Schedule</strong>, then click <strong>Select</strong>.',
        render: renderSelectReportExpanded
    },
    {
        title: 'Configure and run',
        body:  'Set <strong>Timeframe</strong> to Today, <strong>Location</strong> to All Home Locations, <strong>Output Format</strong> to XLSX. Click <strong>Run Report</strong>.',
        render: renderForm
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
            <p>The next screens show what to click.</p>
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

function renderMenu() {
    const items = [
        { label: 'Home',                expanded: false },
        { label: 'Time',                expanded: false },
        { label: 'Schedule',            expanded: false },
        { label: 'Workforce Planning',  expanded: false },
        { label: 'Dataviews & Reports', expanded: true  },
        { label: 'My Information',      expanded: false },
        { label: 'Maintenance',         expanded: false }
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
                            <li class="ukg-menu-item ${it.expanded ? 'is-expanded' : ''}">
                                <span>${it.label}</span>
                                <i class="ukg-caret"></i>
                            </li>
                            ${it.expanded ? `
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

function renderReportLibrary({ openSidebar = false, expandedCustom = false } = {}) {
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
                            <li>All</li>
                            <li>Attendance</li>
                            <li class="${!expandedCustom ? 'is-target' : ''} ${expandedCustom ? 'is-expanded' : ''}">
                                <span>Custom Reports</span>
                                <i class="ukg-caret"></i>
                            </li>
                            ${expandedCustom ? `
                                <li class="ukg-side-sub is-target">Custom Daily Schedule</li>
                                <li class="ukg-side-sub muted">Store Weekly Schedule by Employee</li>
                            ` : ''}
                            <li>Scheduler</li>
                            <li>Timekeeping</li>
                        </ul>
                    </aside>
                ` : ''}
            </div>
        </div>
    `;
}

function renderSelectReport() {
    return renderReportLibrary({ openSidebar: true, expandedCustom: false });
}

function renderSelectReportExpanded() {
    return renderReportLibrary({ openSidebar: true, expandedCustom: true });
}

function renderForm() {
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
                            <div class="ukg-form-input">Today</div>
                        </div>
                        <div class="ukg-form-field">
                            <label>Location<span class="req">*</span></label>
                            <div class="ukg-form-input">All Home Locations</div>
                        </div>
                        <div class="ukg-form-field">
                            <label>Output Format<span class="req">*</span></label>
                            <div class="ukg-form-input">XLSX</div>
                        </div>
                    </div>
                    <div class="ukg-side-footer">
                        <button class="ukg-pill-btn" aria-hidden="true">Cancel</button>
                        <button class="ukg-pill-btn ukg-pill-btn-primary is-target" aria-hidden="true">
                            Run Report
                        </button>
                    </div>
                </aside>
            </div>
        </div>
    `;
}
