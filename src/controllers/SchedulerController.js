import { scheduleBreaks } from '../core/BreakScheduler.js';
import { minutesToTime } from '../core/helpers.js';

/**
 * SchedulerController — orchestrates the file processing pipeline.
 *
 * Listens for 'file:process' events from FileView, then:
 * 1. Parses the .xlsx file via ExcelFacade
 * 2. Splits into daily schedules
 * 3. Runs BreakScheduler for each day
 * 4. Writes breaks back into the sheet
 * 5. Applies styling
 * 6. Triggers download
 */
export class SchedulerController {
    /**
     * @param {ExcelFacade}    excelFacade
     * @param {SettingsModel}  settingsModel
     * @param {CoverageGroupModel} groupModel
     * @param {FileView}       fileView
     */
    constructor(excelFacade, settingsModel, groupModel, fileView) {
        this._excel    = excelFacade;
        this._settings = settingsModel;
        this._groups   = groupModel;
        this._fileView = fileView;
    }

    /**
     * Initialize: bind file:process events.
     * @param {HTMLElement} root
     */
    init(root) {
        root.addEventListener('file:process', (e) => {
            this._processFile(e.detail.file);
        });
    }

    /** @private */
    async _processFile(file) {
        this._fileView.setProcessing(true);

        try {
            const buffer = await file.arrayBuffer();
            const { rowData, isValid, error } = this._excel.parseWorkbook(buffer);

            if (!isValid) {
                this._fileView.showToast(error, 'error');
                return;
            }

            const { isValid: structValid, error: structError } = this._excel.validateScheduleStructure(rowData);
            if (!structValid) {
                this._fileView.showToast(structError, 'error');
                return;
            }

            const dailySchedules = this._excel.splitIntoDailySchedules(rowData);

            if (!dailySchedules.length) {
                this._fileView.showToast('No valid schedule found in the uploaded file.', 'error');
                return;
            }

            if (dailySchedules.length > 1) {
                this._processMultiDay(dailySchedules);
            } else {
                this._processSingleDay(dailySchedules[0]);
            }
        } catch (e) {
            this._fileView.showToast(`An unexpected error occurred: ${e.message}`, 'error');
        } finally {
            this._fileView.setProcessing(false);
        }
    }

    /** @private */
    _processSingleDay(schedule) {
        const wb = this._excel.createWorkbook();
        const ws = this._excel.createSheet(schedule.rows);

        this._applyScheduleToSheet(ws, schedule);

        this._excel.appendSheet(wb, ws, 'Schedule');
        this._excel.download(wb, `Break Schedule ${schedule.date}.xlsx`);
    }

    /** @private */
    _processMultiDay(dailySchedules) {
        const wb = this._excel.createWorkbook();
        let combinedRows = [];
        const pageBreaks = [];

        for (let i = 0; i < dailySchedules.length; i++) {
            const schedule = dailySchedules[i];
            if (i > 0) pageBreaks.push(combinedRows.length);

            const tempWs = this._excel.createSheet(schedule.rows);
            this._applyScheduleToSheet(tempWs, schedule);

            const processedRows = this._excel.sheetToRows(tempWs);
            combinedRows = combinedRows.concat(processedRows);
        }

        const ws = this._excel.createSheet(combinedRows);
        this._excel.applyMultiDayStyling(ws, combinedRows, dailySchedules);

        if (pageBreaks.length) {
            ws['!rowBreaks'] = pageBreaks.map(r => ({ R: r, man: 1 }));
        }

        this._excel.appendSheet(wb, ws, 'Schedule');

        const first = dailySchedules[0].date;
        const last  = dailySchedules[dailySchedules.length - 1].date;
        const filename = first === last
            ? `Break Schedule ${first}.xlsx`
            : `Break Schedule ${first} to ${last}.xlsx`;

        this._excel.download(wb, filename);
    }

    /** @private */
    _applyScheduleToSheet(ws, schedule) {
        // Delete column D (shift label) from the sheet and rows
        this._excel.deleteColumnD(ws, schedule.rows);

        // Detect where data rows start
        const dataStart = this._detectDataStart(schedule.rows);

        // Get settings from models
        const groups       = this._groups.getAll();
        const advSettings  = this._settings.getAdvancedSettings();
        const operatingHours = this._settings.getOperatingHoursForDate(schedule.date);

        // Run the scheduler
        const { breaks, segments } = scheduleBreaks(schedule.rows, {
            operatingHours,
            groups,
            advancedSettings: advSettings,
            enableLogging: false,
            dataStart,
            shiftColumnIndex: 3  // After deleting column D, shift is now in col D (index 3)
        });

        // Write break times back into the sheet
        this._excel.writeBreaks(ws, segments, breaks, dataStart - 1, minutesToTime);

        // Apply styling
        this._excel.applyScheduleStyling(ws, schedule.rows);
    }

    /** @private */
    _detectDataStart(rows) {
        for (let i = 0; i < rows.length; i++) {
            const row = rows[i];
            if (row && typeof row[2] === 'string' && row[2].trim().toLowerCase() === 'name') {
                return i + 1;
            }
        }
        return 8;
    }
}
