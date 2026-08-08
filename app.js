/* ==========================================================================
   WEEKLY PLANNER PRO - ULTRA WIDESCREEN DASHBOARD LOGIC
   Full Multi-Week Data Keying (Fix: Task & Habit Isolation Per Week)
   ========================================================================== */

const DAYS_CONFIG = [
    { key: 'mon', name: 'Monday', label: 'Thứ Hai', color: '#00b4d8', grad: 'linear-gradient(180deg, #00f2fe, #00b4d8)' },
    { key: 'tue', name: 'Tuesday', label: 'Thứ Ba', color: '#ff2a6d', grad: 'linear-gradient(180deg, #ff5858, #ff2a6d)' },
    { key: 'wed', name: 'Wednesday', label: 'Thứ Tư', color: '#10b981', grad: 'linear-gradient(180deg, #34d399, #059669)' },
    { key: 'thu', name: 'Thursday', label: 'Thứ Năm', color: '#8b5cf6', grad: 'linear-gradient(180deg, #a78bfa, #7c3aed)' },
    { key: 'fri', name: 'Friday', label: 'Thứ Sáu', color: '#f59e0b', grad: 'linear-gradient(180deg, #fbbf24, #d97706)' },
    { key: 'sat', name: 'Saturday', label: 'Thứ Bảy', color: '#2563eb', grad: 'linear-gradient(180deg, #60a5fa, #1d4ed8)' },
    { key: 'sun', name: 'Sunday', label: 'Chủ Nhật', color: '#ef4444', grad: 'linear-gradient(180deg, #f87171, #dc2626)' }
];

const CATEGORIES_CONFIG = {
    work: { icon: '💼', name: 'Work', class: 'tag-work' },
    study: { icon: '📚', name: 'Study', class: 'tag-study' },
    health: { icon: '🏋️', name: 'Health', class: 'tag-health' },
    personal: { icon: '🏠', name: 'Personal', class: 'tag-personal' },
    finance: { icon: '💰', name: 'Finance', class: 'tag-finance' }
};

const STORAGE_KEY = 'WEEKLY_PLANNER_DATA_V1';
const HISTORY_KEY = 'WEEKLY_PLANNER_HISTORY_V1';

const DEFAULT_STATE = {
    theme: 'light',
    weekStartDate: formatDateStr(getMondayOfCurrentWeek()),
    habits: [
        { id: 'h1', title: 'Read book', weeksChecks: {} },
        { id: 'h2', title: 'Tập yoga', weeksChecks: {} },
        { id: 'h3', title: 'Uống nước đầy đủ', weeksChecks: {} },
        { id: 'h4', title: 'Hít thở sâu', weeksChecks: {} },
        { id: 'h5', title: 'Học tiếng Anh', weeksChecks: {} },
        { id: 'h6', title: 'Pray & bible', weeksChecks: {} }
    ],
    weeksData: {
        // [weekStartDate]: { mon: { focus: '', notes: '', tasks: [] }, ... }
    }
};

let appState = loadState();
let historySnapshots = loadHistorySnapshots();
let draggedTaskId = null;
let draggedSourceDayKey = null;

// REGISTER & FORCE UPDATE PWA SERVICE WORKER
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').then((reg) => {
            reg.update();
            reg.onupdatefound = () => {
                const installingWorker = reg.installing;
                if (installingWorker) {
                    installingWorker.onstatechange = () => {
                        if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            window.location.reload();
                        }
                    };
                }
            };
        }).catch((err) => {
            console.log('Service Worker error:', err);
        });
    });
}

// SAFE LOCAL DATE ARITHMETIC (Avoids UTC Timezone Shift Bugs)
function parseLocalDate(dateStr) {
    const parts = (dateStr || '').split('-');
    if (parts.length === 3) {
        return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date();
}

function formatDateStr(d) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function addDaysToDateStr(dateStr, days) {
    const d = parseLocalDate(dateStr);
    d.setDate(d.getDate() + days);
    return formatDateStr(d);
}

// MULTI-WEEK TASKS HELPER
function getWeekData(weekDateStr) {
    if (!appState.weeksData) {
        appState.weeksData = {};
    }
    if (!appState.weeksData[weekDateStr]) {
        appState.weeksData[weekDateStr] = {
            mon: { focus: '', notes: '', tasks: [] },
            tue: { focus: '', notes: '', tasks: [] },
            wed: { focus: '', notes: '', tasks: [] },
            thu: { focus: '', notes: '', tasks: [] },
            fri: { focus: '', notes: '', tasks: [] },
            sat: { focus: '', notes: '', tasks: [] },
            sun: { focus: '', notes: '', tasks: [] }
        };
    }
    return appState.weeksData[weekDateStr];
}

// MULTI-WEEK HABITS HELPER (Fixes habit checks leaking across weeks)
function getHabitChecks(habit, weekDateStr) {
    if (!habit.weeksChecks) {
        habit.weeksChecks = {};
        if (habit.checks && Array.isArray(habit.checks)) {
            const defaultWeekKey = appState.weekStartDate || formatDateStr(getMondayOfCurrentWeek());
            habit.weeksChecks[defaultWeekKey] = habit.checks;
            delete habit.checks;
        }
    }
    if (!habit.weeksChecks[weekDateStr]) {
        habit.weeksChecks[weekDateStr] = [false, false, false, false, false, false, false];
    }
    return habit.weeksChecks[weekDateStr];
}

// VIETNAMESE LUNAR CALENDAR ALGORITHM
function getJdn(dd, mm, yyyy) {
    let a = Math.floor((14 - mm) / 12);
    let y = yyyy + 4800 - a;
    let m = mm + 12 * a - 3;
    return dd + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045;
}

function getNewMoonDay(k, timeZone = 7) {
    const T = k / 1236.85;
    const T2 = T * T;
    const T3 = T2 * T;
    const dr = Math.PI / 180;
    let Jd1 = 2451545.0 + 29.53058868 * k + 0.0001178 * T2 - 0.000000213 * T3;
    let M = 2.5534 + 29.10535669 * k - 0.0000218 * T2 - 0.00000011 * T3;
    let Mpr = 201.5643 + 385.81693528 * k + 0.0107438 * T2 + 0.00001239 * T3;
    let F = 160.7108 + 390.67050274 * k - 0.0016341 * T2 - 0.00000227 * T3;
    let C = (12.4006 + 0.13054370 * k - 0.000052 * T2) * dr;

    let pt = Jd1 + (0.1734 - 0.000393 * T) * Math.sin(M * dr)
        + 0.0021 * Math.sin(2 * M * dr)
        - 0.4068 * Math.sin(Mpr * dr)
        + 0.0161 * Math.sin(2 * Mpr * dr)
        - 0.0004 * Math.sin(3 * Mpr * dr)
        + 0.0104 * Math.sin(2 * F * dr)
        - 0.0051 * Math.sin((M + Mpr) * dr)
        - 0.0074 * Math.sin((M - Mpr) * dr)
        + 0.0004 * Math.sin((2 * F + M) * dr)
        - 0.0004 * Math.sin((2 * F - M) * dr)
        - 0.0006 * Math.sin((2 * F + Mpr) * dr)
        + 0.0010 * Math.sin((2 * F - Mpr) * dr)
        + 0.0005 * Math.sin((Mpr + 2 * C) * dr);

    return Math.floor(pt + 0.5 + timeZone / 24.0);
}

function convertSolar2Lunar(dd, mm, yyyy, timeZone = 7) {
    const dayNumber = getJdn(dd, mm, yyyy);
    const k = Math.floor((dayNumber - 2451545.0 - 0.5) / 29.530588853);
    let monthStart = getNewMoonDay(k, timeZone);

    if (monthStart > dayNumber) {
        monthStart = getNewMoonDay(k - 1, timeZone);
    }

    let a11 = getNewMoonDay(Math.floor((getJdn(31, 12, yyyy - 1) - 2451545.0) / 29.530588853), timeZone);
    if (monthStart < a11) {
        a11 = getNewMoonDay(Math.floor((getJdn(31, 12, yyyy - 2) - 2451545.0) / 29.530588853), timeZone);
    }

    const lunarDay = dayNumber - monthStart + 1;
    const diff = Math.floor((monthStart - a11) / 29.5);
    let lunarMonth = diff + 11;
    if (lunarMonth > 12) lunarMonth -= 12;

    return { day: lunarDay, month: lunarMonth, year: yyyy };
}

function getMondayOfCurrentWeek(d = new Date()) {
    const date = new Date(d);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(date.setDate(diff));
}

function formatSolarDate(dateObj) {
    const dd = String(dateObj.getDate()).padStart(2, '0');
    const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
    const yyyy = dateObj.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
}

function formatLunarDateStr(dateObj) {
    const lunar = convertSolar2Lunar(dateObj.getDate(), dateObj.getMonth() + 1, dateObj.getFullYear());
    const ld = String(lunar.day).padStart(2, '0');
    const lm = String(lunar.month).padStart(2, '0');
    return `🌙 ${ld}/${lm} ÂL`;
}

function loadState() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
            const parsed = JSON.parse(saved);
            const defaultWeekKey = parsed.weekStartDate || formatDateStr(getMondayOfCurrentWeek());

            // MIGRATION 1: Convert single-week `daysData` to multi-week `weeksData`
            if (parsed.daysData && !parsed.weeksData) {
                parsed.weeksData = {
                    [defaultWeekKey]: parsed.daysData
                };
                delete parsed.daysData;
            }

            // MIGRATION 2: Convert single-week `habit.checks` to multi-week `habit.weeksChecks`
            if (parsed.habits && Array.isArray(parsed.habits)) {
                parsed.habits.forEach(h => {
                    if (h.checks && !h.weeksChecks) {
                        h.weeksChecks = {
                            [defaultWeekKey]: h.checks
                        };
                        delete h.checks;
                    }
                });
            }

            return parsed;
        }
    } catch (e) {
        console.error('Failed to load state from localStorage', e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_STATE));
}

function saveState() {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
        createHistorySnapshot();
        renderSidebarStats();
    } catch (e) {
        console.error('Failed to save state to localStorage', e);
    }
}

// GOOGLE CALENDAR / APPLE CALENDAR (.ICS EXPORT)
function exportToIcsCalendar() {
    const mondayDate = parseLocalDate(appState.weekStartDate);
    const currentWeekData = getWeekData(appState.weekStartDate);
    let icsContent = [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Weekly Planner Pro//EN',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH'
    ];

    DAYS_CONFIG.forEach((day, index) => {
        const dayDate = new Date(mondayDate);
        dayDate.setDate(dayDate.getDate() + index);

        const dayData = currentWeekData[day.key];
        if (dayData && dayData.tasks) {
            dayData.tasks.forEach(t => {
                const [hrs, mins] = (t.time || '09:00').split(':');
                const startObj = new Date(dayDate);
                startObj.setHours(parseInt(hrs), parseInt(mins), 0);

                const endObj = new Date(startObj);
                endObj.setMinutes(endObj.getMinutes() + 30);

                const formatIcsTime = (d) => d.toISOString().replace(/-|:|\.\d+/g, '');

                icsContent.push('BEGIN:VEVENT');
                icsContent.push(`SUMMARY:${t.title}`);
                icsContent.push(`DTSTART:${formatIcsTime(startObj)}`);
                icsContent.push(`DTEND:${formatIcsTime(endObj)}`);
                icsContent.push(`DESCRIPTION:Task từ Weekly Planner Pro`);
                icsContent.push('END:VEVENT');
            });
        }
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `Weekly_Planner_${appState.weekStartDate}.ics`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    alert('Đã xuất file .ics! Bạn có thể mở file này để thêm tất cả lịch tuần vào Google Calendar hoặc Apple Calendar.');
}

// HISTORY AUTO-BACKUP & SNAPSHOT RESTORE
function loadHistorySnapshots() {
    try {
        const saved = localStorage.getItem(HISTORY_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) {
        console.error('Failed to load history snapshots', e);
    }
    return [];
}

function createHistorySnapshot() {
    try {
        const now = new Date();
        const timeStr = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')} (${now.getDate()}/${now.getMonth()+1}/${now.getFullYear()})`;
        const newSnapshot = {
            time: timeStr,
            weekDate: appState.weekStartDate,
            data: JSON.parse(JSON.stringify(appState))
        };

        // Keep last 6 snapshots
        historySnapshots = [newSnapshot, ...historySnapshots.slice(0, 5)];
        localStorage.setItem(HISTORY_KEY, JSON.stringify(historySnapshots));
    } catch (e) {
        console.error('Failed to create history snapshot', e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initWeekPicker();
    renderHabits();
    renderPlannerGrid();
    renderSidebarStats();
    attachGlobalEventListeners();
    startTaskReminderChecker();
    requestNotificationPermission();
});

function initTheme() {
    if (appState.theme === 'dark') {
        document.body.classList.remove('light-theme');
        document.body.classList.add('dark-theme');
    } else {
        document.body.classList.remove('dark-theme');
        document.body.classList.add('light-theme');
    }
}

function updateHeaderWeekDateDisplay() {
    const weekInput = document.getElementById('weekStartDate');
    const displayedWeekDate = document.getElementById('displayedWeekDate');
    
    if (weekInput && displayedWeekDate) {
        weekInput.value = appState.weekStartDate;
        const parts = appState.weekStartDate.split('-');
        if (parts.length === 3) {
            const [yyyy, mm, dd] = parts;
            displayedWeekDate.textContent = `${dd}/${mm}/${yyyy}`;
        }
    }
}

function initWeekPicker() {
    const weekInput = document.getElementById('weekStartDate');
    updateHeaderWeekDateDisplay();

    weekInput.addEventListener('change', (e) => {
        if (e.target.value) {
            const selectedDate = parseLocalDate(e.target.value);
            const monday = getMondayOfCurrentWeek(selectedDate);
            appState.weekStartDate = formatDateStr(monday);
            updateHeaderWeekDateDisplay();
            saveState();
            renderPlannerGrid();
            renderHabits();
        }
    });

    document.getElementById('prevWeekBtn').addEventListener('click', () => {
        appState.weekStartDate = addDaysToDateStr(appState.weekStartDate, -7);
        updateHeaderWeekDateDisplay();
        saveState();
        renderPlannerGrid();
        renderHabits();
    });

    document.getElementById('nextWeekBtn').addEventListener('click', () => {
        appState.weekStartDate = addDaysToDateStr(appState.weekStartDate, 7);
        updateHeaderWeekDateDisplay();
        saveState();
        renderPlannerGrid();
        renderHabits();
    });

    document.getElementById('todayWeekBtn').addEventListener('click', () => {
        appState.weekStartDate = formatDateStr(getMondayOfCurrentWeek());
        updateHeaderWeekDateDisplay();
        saveState();
        renderPlannerGrid();
        renderHabits();
    });
}

function renderSidebarStats() {
    const barChartContainer = document.getElementById('weeklyBarChart');
    if (!barChartContainer) return;
    barChartContainer.innerHTML = '';

    const currentWeekData = getWeekData(appState.weekStartDate);
    let totalDoneAllWeek = 0;
    let totalTasksAllWeek = 0;

    let totalPercentageSum = 0;
    let daysWithTasksCount = 0;

    DAYS_CONFIG.forEach(day => {
        const dayData = currentWeekData[day.key] || { tasks: [] };
        const totalTasks = dayData.tasks.length;
        const doneTasks = dayData.tasks.filter(t => t.done).length;
        const percent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

        totalDoneAllWeek += doneTasks;
        totalTasksAllWeek += totalTasks;

        if (totalTasks > 0) {
            totalPercentageSum += percent;
            daysWithTasksCount++;
        }

        const barCol = document.createElement('div');
        barCol.className = 'bar-col';
        barCol.innerHTML = `
            <span class="bar-val" style="color:${day.color}">${percent}%</span>
            <div class="bar-track">
                <div class="bar-fill" style="height: ${percent}%; background: ${day.grad};"></div>
            </div>
            <span class="bar-label" style="color:${day.color}">${day.name.substring(0, 3)}</span>
        `;
        barChartContainer.appendChild(barCol);
    });

    const totalPendingAllWeek = totalTasksAllWeek - totalDoneAllWeek;
    const overallPercent = totalTasksAllWeek > 0 ? Math.round((totalDoneAllWeek / totalTasksAllWeek) * 100) : 0;

    const donutCircle = document.getElementById('donutCircle');
    const donutText = document.getElementById('donutPercentText');
    const totalDoneElem = document.getElementById('totalDoneCount');
    const totalPendingElem = document.getElementById('totalPendingCount');

    if (donutCircle) {
        const r = 22;
        const circumference = 2 * Math.PI * r;
        const offset = circumference - (overallPercent / 100) * circumference;

        donutCircle.style.strokeDasharray = `${circumference}`;
        donutCircle.style.strokeDashoffset = `${offset}`;
        donutText.textContent = `${overallPercent}%`;
        totalDoneElem.textContent = totalDoneAllWeek;
        totalPendingElem.textContent = totalPendingAllWeek;
    }

    const avgPercent = daysWithTasksCount > 0 ? Math.round(totalPercentageSum / daysWithTasksCount) : 0;
    const avgElem = document.getElementById('weeklyAvgPercent');
    if (avgElem) avgElem.textContent = `${avgPercent}%`;
}

function calculateHabitStreak(checks) {
    let count = 0;
    for (let i = checks.length - 1; i >= 0; i--) {
        if (checks[i]) count++;
        else break;
    }
    return count;
}

function renderHabits() {
    const tbody = document.getElementById('habitTableBody');
    if (!tbody) return;
    tbody.innerHTML = '';

    appState.habits.forEach(habit => {
        const checks = getHabitChecks(habit, appState.weekStartDate);
        const tr = document.createElement('tr');
        let checksHTML = '';

        DAYS_CONFIG.forEach((day, index) => {
            const isChecked = checks[index] ? 'checked' : '';
            checksHTML += `
                <td>
                    <input type="checkbox" class="habit-checkbox" data-habit-id="${habit.id}" data-day-index="${index}" ${isChecked} />
                </td>
            `;
        });

        const streak = calculateHabitStreak(checks);

        tr.innerHTML = `
            <td class="habit-name-col" title="${escapeHtml(habit.title)}">${escapeHtml(habit.title)}</td>
            ${checksHTML}
            <td class="streak-col">
                <span class="streak-badge" title="Chuỗi ngày tích lũy">🔥 ${streak}d</span>
            </td>
            <td class="action-col">
                <button class="del-habit-btn" data-habit-id="${habit.id}" title="Xóa">
                    <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </td>
        `;

        tbody.appendChild(tr);
    });

    tbody.querySelectorAll('.habit-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const habitId = e.target.dataset.habitId;
            const dayIdx = parseInt(e.target.dataset.dayIndex, 10);
            const habit = appState.habits.find(h => h.id === habitId);
            if (habit) {
                const checks = getHabitChecks(habit, appState.weekStartDate);
                checks[dayIdx] = e.target.checked;
                saveState();
                renderHabits();
            }
        });
    });

    tbody.querySelectorAll('.del-habit-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const habitId = e.currentTarget.dataset.habitId;
            appState.habits = appState.habits.filter(h => h.id !== habitId);
            saveState();
            renderHabits();
        });
    });
}

function renderPlannerGrid() {
    const grid = document.getElementById('plannerGrid');
    grid.innerHTML = '';

    const mondayDate = parseLocalDate(appState.weekStartDate);
    const today = new Date();
    const currentWeekData = getWeekData(appState.weekStartDate);

    DAYS_CONFIG.forEach((day, index) => {
        const dayDate = new Date(mondayDate);
        dayDate.setDate(dayDate.getDate() + index);

        const isToday = dayDate.getDate() === today.getDate() &&
                        dayDate.getMonth() === today.getMonth() &&
                        dayDate.getFullYear() === today.getFullYear();

        const solarDateStr = formatSolarDate(dayDate);
        const lunarDateStr = formatLunarDateStr(dayDate);

        const dayData = currentWeekData[day.key] || { focus: '', notes: '', tasks: [] };
        const totalTasks = dayData.tasks.length;
        const doneTasks = dayData.tasks.filter(t => t.done).length;
        const pendingTasks = totalTasks - doneTasks;
        const percent = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

        const radius = 18;
        const circumference = 2 * Math.PI * radius;
        const strokeDashoffset = circumference - (percent / 100) * circumference;

        const dayCard = document.createElement('div');
        dayCard.className = `day-column ${isToday ? 'today-column' : ''}`;
        dayCard.dataset.dayKey = day.key;
        dayCard.style.borderTop = `3px solid ${day.color}`;

        dayCard.innerHTML = `
            ${isToday ? '<span class="today-badge">HÔM NAY</span>' : ''}
            <div class="day-header">
                <div class="day-name" style="color: ${day.color}">${day.name}</div>
                <div class="day-date-box">
                    <span class="solar-date">${solarDateStr}</span>
                    <span class="lunar-date">${lunarDateStr}</span>
                </div>
            </div>

            <div class="progress-ring-container">
                <div class="progress-ring-wrapper">
                    <svg width="44" height="44" viewBox="0 0 44 44">
                        <circle class="ring-bg" cx="22" cy="22" r="${radius}"></circle>
                        <circle class="ring-circle" cx="22" cy="22" r="${radius}" 
                            stroke="${day.color}" 
                            stroke-dasharray="${circumference}" 
                            stroke-dashoffset="${strokeDashoffset}">
                        </circle>
                    </svg>
                    <div class="ring-text" style="color: ${day.color}">${percent}%</div>
                </div>
            </div>

            <div class="focus-container">
                <label class="focus-label">Main Focus</label>
                <textarea class="focus-input" data-day="${day.key}" placeholder="Mục tiêu chính...">${escapeHtml(dayData.focus || '')}</textarea>
            </div>

            <div class="task-stats-bar">
                <div class="stat-item"><span class="stat-num" style="color: ${day.color};">${doneTasks}</span><span>Done</span></div>
                <div class="stat-item"><span class="stat-num" style="color: var(--day-fri);">${pendingTasks}</span><span>Pending</span></div>
                <div class="stat-item"><span class="stat-num">${totalTasks}</span><span>Total</span></div>
            </div>

            <div class="tasks-section">
                <div class="section-title">Today Tasks</div>
                <ul class="tasks-list" id="tasksList_${day.key}" data-day-key="${day.key}">
                    ${renderTasksListHTML(day.key, dayData.tasks)}
                </ul>
                <form class="add-task-form" data-day="${day.key}">
                    <input type="text" placeholder="Công việc..." required />
                    <select class="task-cat-select" title="Chọn nhãn">
                        <option value="work">💼</option>
                        <option value="study">📚</option>
                        <option value="health">🏋️</option>
                        <option value="personal">🏠</option>
                        <option value="finance">💰</option>
                    </select>
                    <input type="time" value="09:00" title="Giờ nhắc nhở" />
                    <button type="submit" class="btn btn-accent" style="background: ${day.grad};">+</button>
                </form>
            </div>

            <div class="notes-container">
                <div class="section-title">Notes</div>
                <textarea class="notes-input" data-day="${day.key}" placeholder="Ghi chú...">${escapeHtml(dayData.notes || '')}</textarea>
            </div>
        `;

        grid.appendChild(dayCard);
    });

    attachGridEventListeners();
}

function renderTasksListHTML(dayKey, tasks) {
    if (!tasks || tasks.length === 0) {
        return `<li style="font-size: 0.65rem; color: var(--text-tertiary); text-align: center; padding: 4px;">Chưa có task</li>`;
    }

    const sorted = [...tasks].sort((a, b) => (a.time || '').localeCompare(b.time || ''));

    return sorted.map(t => {
        const catInfo = CATEGORIES_CONFIG[t.category || 'work'] || CATEGORIES_CONFIG.work;
        return `
        <li class="task-item" draggable="true" data-day="${dayKey}" data-task-id="${t.id}" data-category="${t.category || 'work'}">
            <input type="checkbox" class="task-checkbox" data-day="${dayKey}" data-task-id="${t.id}" ${t.done ? 'checked' : ''} />
            <div class="task-content">
                <span class="task-tag ${catInfo.class}">${catInfo.icon}</span>
                <span class="task-title" title="${escapeHtml(t.title)}">${escapeHtml(t.title)}</span>
                ${t.time ? `<span class="task-time">${t.time}</span>` : ''}
            </div>
            <button class="del-task-btn" data-day="${dayKey}" data-task-id="${t.id}">
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
        </li>
    `;
    }).join('');
}

function attachGridEventListeners() {
    const currentWeekData = getWeekData(appState.weekStartDate);

    document.querySelectorAll('.focus-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const dayKey = e.target.dataset.day;
            if (currentWeekData[dayKey]) {
                currentWeekData[dayKey].focus = e.target.value;
                saveState();
            }
        });
    });

    document.querySelectorAll('.notes-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const dayKey = e.target.dataset.day;
            if (currentWeekData[dayKey]) {
                currentWeekData[dayKey].notes = e.target.value;
                saveState();
            }
        });
    });

    document.querySelectorAll('.add-task-form').forEach(form => {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const dayKey = form.dataset.day;
            const titleInput = form.querySelector('input[type="text"]');
            const catSelect = form.querySelector('select');
            const timeInput = form.querySelector('input[type="time"]');

            const title = titleInput.value.trim();
            const category = catSelect.value;
            const time = timeInput.value;

            if (title && currentWeekData[dayKey]) {
                const newTask = {
                    id: 't_' + Date.now() + Math.random().toString(36).substr(2, 4),
                    title,
                    category,
                    time,
                    done: false,
                    notified: false
                };
                currentWeekData[dayKey].tasks.push(newTask);
                titleInput.value = '';
                saveState();
                renderPlannerGrid();
            }
        });
    });

    document.querySelectorAll('.task-checkbox').forEach(cb => {
        cb.addEventListener('change', (e) => {
            const dayKey = e.target.dataset.day;
            const taskId = e.target.dataset.taskId;
            const dayTasks = currentWeekData[dayKey]?.tasks;
            if (dayTasks) {
                const task = dayTasks.find(t => t.id === taskId);
                if (task) {
                    task.done = e.target.checked;
                    saveState();
                    renderPlannerGrid();
                }
            }
        });
    });

    document.querySelectorAll('.del-task-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const dayKey = e.currentTarget.dataset.day;
            const taskId = e.currentTarget.dataset.taskId;
            if (currentWeekData[dayKey]) {
                currentWeekData[dayKey].tasks = currentWeekData[dayKey].tasks.filter(t => t.id !== taskId);
                saveState();
                renderPlannerGrid();
            }
        });
    });

    // DRAG & DROP TASKS
    document.querySelectorAll('.task-item').forEach(item => {
        item.addEventListener('dragstart', (e) => {
            draggedTaskId = e.currentTarget.dataset.taskId;
            draggedSourceDayKey = e.currentTarget.dataset.day;
            e.currentTarget.classList.add('dragging');
        });

        item.addEventListener('dragend', (e) => {
            e.currentTarget.classList.remove('dragging');
            document.querySelectorAll('.day-column').forEach(col => col.classList.remove('drag-over'));
        });
    });

    document.querySelectorAll('.day-column').forEach(col => {
        col.addEventListener('dragover', (e) => {
            e.preventDefault();
            col.classList.add('drag-over');
        });

        col.addEventListener('dragleave', () => {
            col.classList.remove('drag-over');
        });

        col.addEventListener('drop', (e) => {
            e.preventDefault();
            col.classList.remove('drag-over');

            const targetDayKey = col.dataset.dayKey;
            if (draggedTaskId && draggedSourceDayKey && targetDayKey && draggedSourceDayKey !== targetDayKey) {
                const sourceTasks = currentWeekData[draggedSourceDayKey]?.tasks;
                const taskIdx = sourceTasks ? sourceTasks.findIndex(t => t.id === draggedTaskId) : -1;
                if (taskIdx > -1) {
                    const [movedTask] = sourceTasks.splice(taskIdx, 1);
                    currentWeekData[targetDayKey].tasks.push(movedTask);
                    saveState();
                    renderPlannerGrid();
                }
            }
            draggedTaskId = null;
            draggedSourceDayKey = null;
        });
    });
}

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission !== 'granted' && Notification.permission !== 'denied') {
        Notification.requestPermission();
    }
}

function playAlarmSound() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
        console.log('Audio playback prevented', e);
    }
}

function startTaskReminderChecker() {
    setInterval(() => {
        const now = new Date();
        const currentDayIndex = now.getDay() === 0 ? 6 : now.getDay() - 1;
        const dayKey = DAYS_CONFIG[currentDayIndex]?.key;
        const currentWeekData = getWeekData(appState.weekStartDate);
        if (!dayKey || !currentWeekData[dayKey]) return;

        const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        const dayTasks = currentWeekData[dayKey].tasks;

        dayTasks.forEach(task => {
            if (task.time === timeStr && !task.done && !task.notified) {
                task.notified = true;
                playAlarmSound();
                if ('Notification' in window && Notification.permission === 'granted') {
                    new Notification('⏰ Nhắc nhở công việc!', {
                        body: `Đã đến giờ: ${task.title} (${task.time})`,
                        icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="%236366f1" d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>'
                    });
                }
            }
        });
    }, 20000);
}

// DUPLICATE/CLONE CURRENT WEEK TO NEXT WEEK (ROBUST IMPLEMENTATION)
function duplicateCurrentWeekToNext() {
    const currentWeekKey = appState.weekStartDate;
    const nextMondayStr = addDaysToDateStr(currentWeekKey, 7);

    if (confirm(`Sao chép toàn bộ công việc sang tuần mới (${nextMondayStr})?`)) {
        const currentWeekData = getWeekData(currentWeekKey);
        const copiedData = JSON.parse(JSON.stringify(currentWeekData));

        DAYS_CONFIG.forEach(d => {
            if (copiedData[d.key] && copiedData[d.key].tasks) {
                copiedData[d.key].tasks.forEach(t => {
                    t.done = false;
                    t.notified = false;
                });
            }
        });

        if (!appState.weeksData) appState.weeksData = {};
        appState.weeksData[nextMondayStr] = copiedData;
        appState.weekStartDate = nextMondayStr;

        saveState();
        updateHeaderWeekDateDisplay();
        renderPlannerGrid();
        renderSidebarStats();
        renderHabits();
        alert(`Đã sao chép thành công sang tuần mới (${nextMondayStr})!`);
    }
}

function renderHistoryModal() {
    const historyList = document.getElementById('historySnapshotsList');
    historyList.innerHTML = '';

    if (historySnapshots.length === 0) {
        historyList.innerHTML = '<li style="font-size:0.75rem; color:var(--text-tertiary); text-align:center;">Chưa có bản sao lưu nào.</li>';
        return;
    }

    historySnapshots.forEach((snap, idx) => {
        const li = document.createElement('li');
        li.className = 'history-item';
        li.innerHTML = `
            <div>
                <span class="history-time">📅 Tuần: ${snap.weekDate}</span>
                <div class="history-date">Tạo lúc: ${snap.time}</div>
            </div>
            <button class="btn btn-sm btn-accent restore-snap-btn" data-snap-idx="${idx}">Phục hồi</button>
        `;
        historyList.appendChild(li);
    });

    historyList.querySelectorAll('.restore-snap-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.currentTarget.dataset.snapIdx);
            const snap = historySnapshots[idx];
            if (snap && snap.data) {
                if (confirm(`Khôi phục dữ liệu phiên bản (${snap.time})?`)) {
                    appState = JSON.parse(JSON.stringify(snap.data));
                    saveState();
                    initTheme();
                    updateHeaderWeekDateDisplay();
                    renderHabits();
                    renderPlannerGrid();
                    document.getElementById('historyModal').classList.add('hidden');
                    alert('Khôi phục dữ liệu thành công!');
                }
            }
        });
    });
}

function attachGlobalEventListeners() {
    // GOOGLE CALENDAR EXPORT (.ICS)
    const exportIcsBtn = document.getElementById('exportIcsBtn');
    if (exportIcsBtn) {
        exportIcsBtn.addEventListener('click', exportToIcsCalendar);
    }

    // DUPLICATE / CLONE WEEK BUTTON
    const duplicateWeekBtn = document.getElementById('duplicateWeekBtn');
    if (duplicateWeekBtn) {
        duplicateWeekBtn.addEventListener('click', duplicateCurrentWeekToNext);
    }

    // HISTORY MODAL HANDLER
    const historyBtn = document.getElementById('historyBtn');
    const historyModal = document.getElementById('historyModal');
    const closeHistoryModalBtn = document.getElementById('closeHistoryModalBtn');
    const cancelHistoryBtn = document.getElementById('cancelHistoryBtn');

    if (historyBtn) {
        historyBtn.addEventListener('click', () => {
            renderHistoryModal();
            historyModal.classList.remove('hidden');
        });
    }

    if (closeHistoryModalBtn) closeHistoryModalBtn.addEventListener('click', () => historyModal.classList.add('hidden'));
    if (cancelHistoryBtn) cancelHistoryBtn.addEventListener('click', () => historyModal.classList.add('hidden'));

    // CATEGORY FILTER SELECT
    const categoryFilterSelect = document.getElementById('categoryFilterSelect');
    if (categoryFilterSelect) {
        categoryFilterSelect.addEventListener('change', (e) => {
            const selectedCat = e.target.value;
            document.querySelectorAll('.task-item').forEach(item => {
                const itemCat = item.dataset.category || 'work';
                if (selectedCat === 'all' || itemCat === selectedCat) {
                    item.classList.remove('search-dimmed');
                } else {
                    item.classList.add('search-dimmed');
                }
            });
        });
    }

    // EXPORT TO PNG IMAGE
    const exportPngBtn = document.getElementById('exportPngBtn');
    if (exportPngBtn) {
        exportPngBtn.addEventListener('click', () => {
            const layout = document.querySelector('.planner-layout');
            if (!layout) return;

            if (typeof html2canvas === 'undefined') {
                alert('Hệ thống đang chuẩn bị bộ chụp ảnh, vui lòng bấm lại sau 2 giây!');
                return;
            }

            const oldText = exportPngBtn.innerHTML;
            exportPngBtn.innerHTML = '⌛ PNG...';

            html2canvas(layout, {
                scale: 2,
                useCORS: true,
                backgroundColor: document.body.classList.contains('dark-theme') ? '#070a12' : '#eef2f9'
            }).then(canvas => {
                const link = document.createElement('a');
                link.download = `Weekly_Planner_${appState.weekStartDate}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                exportPngBtn.innerHTML = oldText;
            }).catch(err => {
                console.error('PNG export error', err);
                alert('Lỗi tạo ảnh PNG!');
                exportPngBtn.innerHTML = oldText;
            });
        });
    }

    // LIVE TASK SEARCH FILTER
    const taskSearchInput = document.getElementById('taskSearchInput');
    if (taskSearchInput) {
        taskSearchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            document.querySelectorAll('.task-item').forEach(item => {
                const titleElem = item.querySelector('.task-title');
                if (titleElem) {
                    const titleText = titleElem.textContent.toLowerCase();
                    if (query.length > 0) {
                        if (titleText.includes(query)) {
                            item.classList.add('search-match');
                            item.classList.remove('search-dimmed');
                        } else {
                            item.classList.remove('search-match');
                            item.classList.add('search-dimmed');
                        }
                    } else {
                        item.classList.remove('search-match');
                        item.classList.remove('search-dimmed');
                    }
                }
            });
        });
    }

    document.getElementById('printBtn').addEventListener('click', () => {
        window.print();
    });

    document.getElementById('themeToggleBtn').addEventListener('click', () => {
        appState.theme = appState.theme === 'dark' ? 'light' : 'dark';
        initTheme();
        saveState();
    });

    document.getElementById('clearPlannerBtn').addEventListener('click', () => {
        if (confirm('Xóa toàn bộ công việc trong tuần?')) {
            const currentWeekData = getWeekData(appState.weekStartDate);
            DAYS_CONFIG.forEach(d => {
                currentWeekData[d.key] = { focus: '', notes: '', tasks: [] };
            });
            appState.habits.forEach(h => {
                const checks = getHabitChecks(h, appState.weekStartDate);
                for (let i = 0; i < 7; i++) checks[i] = false;
            });
            saveState();
            renderHabits();
            renderPlannerGrid();
        }
    });

    document.getElementById('exportBtn').addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(appState, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", `Weekly_Planner_Backup_${appState.weekStartDate}.json`);
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });

    document.getElementById('importInput').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                try {
                    const imported = JSON.parse(event.target.result);
                    if (imported.weeksData || imported.daysData) {
                        appState = imported;
                        saveState();
                        initTheme();
                        initWeekPicker();
                        renderHabits();
                        renderPlannerGrid();
                        alert('Nhập dữ liệu thành công!');
                    }
                } catch (err) {
                    alert('Lỗi đọc file JSON!');
                }
            };
            reader.readAsText(file);
        }
    });

    const habitModal = document.getElementById('habitModal');
    const addHabitBtn = document.getElementById('addHabitBtn');
    const closeHabitModalBtn = document.getElementById('closeHabitModalBtn');
    const cancelHabitBtn = document.getElementById('cancelHabitBtn');
    const saveHabitBtn = document.getElementById('saveHabitBtn');
    const habitTitleInput = document.getElementById('habitTitleInput');

    const openHabitModal = () => {
        habitTitleInput.value = '';
        habitModal.classList.remove('hidden');
        habitTitleInput.focus();
    };

    const closeHabitModal = () => habitModal.classList.add('hidden');

    if (addHabitBtn) addHabitBtn.addEventListener('click', openHabitModal);
    if (closeHabitModalBtn) closeHabitModalBtn.addEventListener('click', closeHabitModal);
    if (cancelHabitBtn) cancelHabitBtn.addEventListener('click', closeHabitModal);

    if (saveHabitBtn) {
        saveHabitBtn.addEventListener('click', () => {
            const val = habitTitleInput.value.trim();
            if (val) {
                appState.habits.push({
                    id: 'h_' + Date.now(),
                    title: val,
                    weeksChecks: {}
                });
                closeHabitModal();
                saveState();
                renderHabits();
            }
        });
    }
}

function escapeHtml(str) {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
