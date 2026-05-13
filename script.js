/**
 * ⚠️ SEBELUM EDIT: baca CHANGELOG.md untuk arsitektur & format tanggal
 */
document.addEventListener('DOMContentLoaded', () => {
    const GAS_URL = 'https://script.google.com/macros/s/AKfycbxrf-aBS_KjdcQmt38IbsTmEOogEb17Y6S8AX0y1so67UutWTRKFs5LyNr-JEJhN4v25A/exec';
    const SHEETS_CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vT9xmHY6W92EDZKypOk-SRPJHhkMzdAhbg2jhji5_1Dd6uBde-GEWr0bIimXKoEtbUlHfEXZtg364LB/pub?gid=1659908339&single=true&output=csv';
    const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

    const dom = {
        grid: document.getElementById('calendar-grid'),
        loading: document.getElementById('loading'),
        weekDisplay: document.getElementById('week-display'),
        prevWeekBtn: document.getElementById('prev-week'),
        nextWeekBtn: document.getElementById('next-week'),
        refreshBtn: document.getElementById('refresh-btn'),
        weekInfo: document.getElementById('week-info'),
        lastUpdated: document.getElementById('last-updated'),
        year: document.getElementById('year'),
        notice: document.getElementById('week-notice'),
    };

    const SESSIONS = {
        '1': '08.30–10.30',
        '2': '10.45–12.30',
        '3': '14.00–16.30',
        '4': '16.30–18.00',
    };

    const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    let allScheduleData = [];
    let currentWeekStartDate = null;

    const getMonday = (d) => {
        d = new Date(d);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        return new Date(d.setDate(diff));
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const parseTanggal = (str) => {
        if (!str) return null;
        const clean = String(str).split(' ')[0].trim();
        if (!clean) return null;

        if (clean.includes('-')) {
            const parts = clean.split('-');
            if (parts.length >= 3) {
                const yyyy = parseInt(parts[0]);
                const mm = parseInt(parts[1]);
                const dd = parseInt(parts[2]);
                if (!isNaN(yyyy) && !isNaN(mm) && !isNaN(dd)) {
                    return new Date(yyyy, mm - 1, dd);
                }
            }
            return null;
        }

        const parts = clean.split('/');
        if (parts.length < 3) return null;
        const a = parseInt(parts[0]);
        const b = parseInt(parts[1]);
        const yyyy = parseInt(parts[2]);
        if (isNaN(a) || isNaN(b) || isNaN(yyyy)) return null;

        let dd, mm;
        if (a > 12 && b <= 12) {
            dd = a; mm = b;
        } else if (b > 12 && a <= 12) {
            dd = b; mm = a;
        } else {
            dd = a; mm = b;
        }

        return new Date(yyyy, mm - 1, dd);
    };

    const extractSesiNumber = (val) => {
        if (!val) return '';
        const clean = String(val).replace(/[\u200B-\u200D\uFEFF\r\n]/g, '').trim();
        const m = clean.match(/(\d)/);
        return m ? m[1] : '';
    };

    // FIX: normalize semua tanggal ke midnight sebelum perbandingan
    const toMidnight = (d) => {
        const n = new Date(d);
        n.setHours(0, 0, 0, 0);
        return n;
    };

    const countItemsInWeek = (weekStart) => {
        const ws = toMidnight(weekStart);
        const weekEnd = new Date(ws);
        weekEnd.setDate(ws.getDate() + 5);
        weekEnd.setHours(23, 59, 59, 999);

        return allScheduleData.filter(item => {
            if (!item.Tanggal) return false;
            const itemDate = parseTanggal(item.Tanggal);
            if (!itemDate || isNaN(itemDate.getTime())) return false;
            const id = toMidnight(itemDate);
            const status = (item.Status || '').toLowerCase().trim();

            if (status === 'ulang') {
                const dow = id.getDay();
                return dow >= 1 && dow <= 6;
            }
            if (status === 'mingguan') {
                const rangeEnd = new Date(id);
                rangeEnd.setDate(id.getDate() + 6);
                rangeEnd.setHours(23, 59, 59, 999);
                return rangeEnd >= ws && id <= weekEnd;
            }
            if (status === 'bulanan') {
                return (id.getMonth() === ws.getMonth() && id.getFullYear() === ws.getFullYear())
                    || (id.getMonth() === weekEnd.getMonth() && id.getFullYear() === weekEnd.getFullYear());
            }
            return id >= ws && id <= weekEnd;
        }).length;
    };

    const findNearestWeekWithData = (fromMonday) => {
        for (let delta = 1; delta <= 12; delta++) {
            const nextWeek = new Date(fromMonday);
            nextWeek.setDate(fromMonday.getDate() + delta * 7);
            if (countItemsInWeek(nextWeek) > 0) return { date: nextWeek, direction: 'future', weeks: delta };
        }
        for (let delta = 1; delta <= 8; delta++) {
            const prevWeek = new Date(fromMonday);
            prevWeek.setDate(fromMonday.getDate() - delta * 7);
            if (countItemsInWeek(prevWeek) > 0) return { date: prevWeek, direction: 'past', weeks: delta };
        }
        return null;
    };

    const showNotice = (msg, type = 'info', nearestDate = null) => {
        if (!dom.notice) return;
        let html = `<span class="notice-icon">${type === 'info' ? '📭' : '⚠️'}</span><span class="notice-text">${msg}</span>`;
        if (nearestDate) {
            html += `<button class="notice-jump" data-date="${nearestDate.getTime()}">Lihat Jadwal →</button>`;
        }
        dom.notice.innerHTML = html;
        dom.notice.className = `week-notice week-notice--${type}`;
        dom.notice.style.display = 'flex';

        const btn = dom.notice.querySelector('.notice-jump');
        if (btn) {
            btn.addEventListener('click', () => {
                const target = new Date(parseInt(btn.dataset.date));
                renderCalendar(target);
            });
        }
    };

    const hideNotice = () => {
        if (!dom.notice) return;
        dom.notice.style.display = 'none';
    };

    const getLabColorClass = (labName) => {
        if (!labName) return 'lab-default';
        const name = labName.toLowerCase();
        if (name.includes('sinyal')) return 'lab-sinyal';
        if (name.includes('data')) return 'lab-data';
        if (name.includes('musiq')) return 'lab-musiq';
        if (name.includes('multimedia')) return 'lab-multimedia';
        return 'lab-default';
    };

    const matchesDate = (item, checkDate) => {
        if (!item.Tanggal) return false;
        const itemDate = parseTanggal(item.Tanggal);
        if (!itemDate || isNaN(itemDate.getTime())) return false;

        const id = toMidnight(itemDate);
        const check = toMidnight(checkDate);
        const status = (item.Status || '').toLowerCase().trim();

        switch (status) {
            case 'ulang':
                return id.getDay() === check.getDay();

            case 'mingguan': {
                const mEnd = new Date(id);
                mEnd.setDate(id.getDate() + 6);
                mEnd.setHours(23, 59, 59, 999);
                return check >= id && check <= mEnd;
            }

            case 'bulanan':
                return id.getMonth() === check.getMonth()
                    && id.getFullYear() === check.getFullYear();

            default:
                return id.getTime() === check.getTime();
        }
    };

    const renderCalendar = (weekStartDate) => {
        currentWeekStartDate = new Date(weekStartDate);
        dom.grid.innerHTML = '';
        dom.loading.style.display = 'none';
        hideNotice();

        const ws = toMidnight(weekStartDate);
        const weekEndDate = new Date(ws);
        weekEndDate.setDate(ws.getDate() + 5);
        weekEndDate.setHours(23, 59, 59, 999);

        dom.weekDisplay.textContent = `${formatDate(ws)} – ${formatDate(weekEndDate)}`;

        const todayMonday = getMonday(new Date());
        const isCurrentWeek = ws.toDateString() === todayMonday.toDateString();

        dom.grid.appendChild(document.createElement('div'));

        DAYS.forEach((day, i) => {
            const d = new Date(ws);
            d.setDate(ws.getDate() + i);
            const headerCell = document.createElement('div');
            headerCell.className = 'grid-header';
            const isToday = d.toDateString() === new Date().toDateString();
            if (isToday) headerCell.classList.add('is-today');
            headerCell.innerHTML = `
                <span class="day-name${isToday ? ' today' : ''}">${day}</span>
                <span class="day-date">${d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' })}</span>
            `;
            dom.grid.appendChild(headerCell);
        });

        const weekData = allScheduleData.filter(item => {
            if (!item.Tanggal) return false;
            const itemDate = parseTanggal(item.Tanggal);
            if (!itemDate || isNaN(itemDate.getTime())) return false;
            const id = toMidnight(itemDate);
            const status = (item.Status || '').toLowerCase().trim();

            if (status === 'ulang') {
                const dow = id.getDay();
                return dow >= 1 && dow <= 6;
            }
            if (status === 'mingguan') {
                const rangeEnd = new Date(id);
                rangeEnd.setDate(id.getDate() + 6);
                rangeEnd.setHours(23, 59, 59, 999);
                return rangeEnd >= ws && id <= weekEndDate;
            }
            if (status === 'bulanan') {
                return (id.getMonth() === ws.getMonth() && id.getFullYear() === ws.getFullYear())
                    || (id.getMonth() === weekEndDate.getMonth() && id.getFullYear() === weekEndDate.getFullYear());
            }
            return id >= ws && id <= weekEndDate;
        });

        const weekDataCount = weekData.length;
        const pengajarInWeek = [...new Set(weekData.map(i => i.Pengajar).filter(Boolean))];

        if (dom.weekInfo) {
            dom.weekInfo.innerHTML = weekDataCount > 0
                ? `<span>${weekDataCount} jadwal</span>  <span>${pengajarInWeek.length} pengajar</span>`
                : '';
        }

        if (weekDataCount === 0) {
            const nearest = findNearestWeekWithData(ws);
            if (nearest) {
                const nearestFormatted = formatDate(nearest.date);
                if (nearest.direction === 'future') {
                    const weekWord = nearest.weeks === 1 ? 'minggu depan' : `${nearest.weeks} minggu lagi`;
                    const msg = isCurrentWeek
                        ? `Belum ada jadwal untuk minggu ini. Jadwal tersedia mulai <strong>${nearestFormatted}</strong> (${weekWord}).`
                        : `Tidak ada jadwal di minggu ini. Jadwal tersedia mulai <strong>${nearestFormatted}</strong>.`;
                    showNotice(msg, 'info', nearest.date);
                } else {
                    showNotice(
                        `Tidak ada jadwal di minggu ini. Jadwal terakhir tersedia pada minggu <strong>${nearestFormatted}</strong>.`,
                        'warn', nearest.date
                    );
                }
            } else {
                showNotice('Tidak ada jadwal yang tersedia saat ini.', 'warn');
            }
        }

        Object.keys(SESSIONS).forEach(sessionKey => {
            const sessionHeader = document.createElement('div');
            sessionHeader.className = 'session-header';
            sessionHeader.innerHTML = `
                <span class="sesi-label">Sesi ${sessionKey}</span>
                <span class="sesi-time">${SESSIONS[sessionKey]}</span>
            `;
            dom.grid.appendChild(sessionHeader);

            DAYS.forEach((_, dayIndex) => {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';

                const currentDay = new Date(ws);
                currentDay.setDate(ws.getDate() + dayIndex);

                const isToday = currentDay.toDateString() === new Date().toDateString();
                if (isToday) cell.classList.add('cell-today');

                const schedules = weekData.filter(item => {
                    const sesiMatch = extractSesiNumber(item.Sesi) === sessionKey;
                    if (!sesiMatch) return false;
                    return matchesDate(item, currentDay);
                });

                if (schedules.length > 0) {
                    schedules.forEach(schedule => {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = `schedule-item ${getLabColorClass(schedule.Ruang)}`;

                        const keterangan = (schedule.Keterangan || '').toLowerCase().trim();
                        const status = (schedule.Status || '').toLowerCase().trim();
                        const isPindah = keterangan === 'pindah';
                        const isTambah = keterangan === 'tambah';
                        const isBatal  = keterangan === 'batal';

                        if (isPindah) itemDiv.classList.add('schedule-pindah');
                        if (isTambah) itemDiv.classList.add('schedule-tambah');
                        if (isBatal)  itemDiv.classList.add('schedule-batal');

                        const pengajar = (schedule.Pengajar || '').trim();
                        let formattedPengajar = '';
                        if (pengajar) {
                            let clean = pengajar.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ').trim();
                            if (clean.includes(',')) {
                                formattedPengajar = clean.split(',').map(n => n.trim()).filter(n => n).join(', ');
                            } else {
                                formattedPengajar = clean;
                            }
                        }

                        const kegiatan = (schedule.Kegiatan || '').trim();
                        let formattedKegiatan = '';
                        if (kegiatan) {
                            const clean = kegiatan.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ');
                            formattedKegiatan = clean.split(',').map(a => a.trim()).filter(a => a).join(', ');
                        }

                        const ruang = (schedule.Ruang || '').trim();

                        let htmlContent = `<p class="item-room">${ruang || 'Ruang tidak diketahui'}</p>`;
                        if (formattedPengajar) htmlContent += `<p class="item-lecturer">${formattedPengajar}</p>`;
                        if (formattedKegiatan) htmlContent += `<p class="item-activity">${formattedKegiatan}</p>`;
                        if (!formattedPengajar && !formattedKegiatan) {
                            htmlContent += `<p class="item-activity empty-data">Data tidak lengkap</p>`;
                        }

                        const labels = [];
                        if (isBatal)  labels.push(`<span class="badge badge-batal">✕ Dibatalkan</span>`);
                        if (isPindah) labels.push(`<span class="badge badge-pindah">↩ Dipindah</span>`);
                        if (isTambah) labels.push(`<span class="badge badge-tambah">＋ Tambahan</span>`);
                        if (status === 'ulang') labels.push(`<span class="badge badge-ulang">⟳ Ulang</span>`);
                        if (status === 'mingguan') labels.push(`<span class="badge badge-mingguan">📅 Mingguan</span>`);
                        if (status === 'bulanan') labels.push(`<span class="badge badge-bulanan">🗓️ Bulanan</span>`);
                        if (labels.length > 0) {
                            htmlContent += `<div class="badge-row">${labels.join('')}</div>`;
                        }

                        itemDiv.innerHTML = htmlContent;
                        cell.appendChild(itemDiv);
                    });
                }

                dom.grid.appendChild(cell);
            });
        });
    };

    function fetchViaJsonp(timeout) {
        return new Promise((resolve, reject) => {
            const callbackName = '_gasCallback_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
            const script = document.createElement('script');
            const timer = setTimeout(() => {
                cleanup();
                reject(new Error('JSONP timeout'));
            }, timeout || 10000);

            function cleanup() {
                clearTimeout(timer);
                delete window[callbackName];
                if (script.parentNode) script.parentNode.removeChild(script);
            }

            window[callbackName] = function(data) {
                cleanup();
                resolve(data);
            };

            script.src = GAS_URL + '?action=getData&callback=' + callbackName + '&_t=' + Date.now();
            script.onerror = function() {
                cleanup();
                reject(new Error('JSONP script load error'));
            };

            document.head.appendChild(script);
        });
    }

    function fetchViaCsv() {
        const cacheBuster = `&_t=${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const csvUrl = SHEETS_CSV_URL + cacheBuster;

        return new Promise(async (resolve, reject) => {
            let csvText = null;

            try {
                const response = await fetch(csvUrl);
                if (response.ok) csvText = await response.text();
            } catch (_) {}

            if (!csvText) {
                try {
                    const proxyUrl = CORS_PROXY + encodeURIComponent(csvUrl);
                    const response = await fetch(proxyUrl);
                    if (response.ok) csvText = await response.text();
                } catch (_) {}
            }

            if (!csvText) {
                reject(new Error('CSV fetch failed'));
                return;
            }

            resolve(parseCSV(csvText));
        });
    }

    const parseCSV = (text) => {
        const lines = text.trim().replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
        const headersLine = lines[0] || '';

        const headers = [];
        let currentHeader = '';
        let inQuotes = false;

        for (let i = 0; i < headersLine.length; i++) {
            const char = headersLine[i];
            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                headers.push(currentHeader.trim());
                currentHeader = '';
            } else {
                currentHeader += char;
            }
        }
        headers.push(currentHeader.trim());

        const data = [];
        for (let lineIdx = 1; lineIdx < lines.length; lineIdx++) {
            const line = lines[lineIdx];
            if (!line || !line.trim()) continue;

            const values = [];
            let currentVal = '';
            let inQ = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQ && line[i + 1] === '"') {
                        currentVal += '"';
                        i++;
                    } else {
                        inQ = !inQ;
                    }
                } else if (char === ',' && !inQ) {
                    values.push(currentVal.trim());
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim());

            const obj = {};
            for (let h = 0; h < headers.length; h++) {
                obj[headers[h]] = (values[h] || '').replace(/[\r\n]/g, '').trim();
            }

            if (obj['R'] !== undefined && obj['Timestamp'] === undefined) {
                obj['Timestamp'] = obj['R'];
            }

            if (!obj.Tanggal && !obj.Hari && !obj.Sesi && !obj.Ruang) continue;

            data.push(obj);
        }

        return data;
    };

    const fetchDataAndRender = async (preserveCurrentWeek = false) => {
        dom.loading.style.display = 'flex';
        dom.grid.innerHTML = '';
        hideNotice();

        const previousWeekStartDate = currentWeekStartDate ? new Date(currentWeekStartDate) : null;
        let dataSource = 'unknown';

        try {
            try {
                const result = await fetchViaJsonp(12000);
                if (result && result.success && result.data) {
                    allScheduleData = result.data;
                    dataSource = 'API';
                } else {
                    throw new Error(result ? result.error : 'Invalid JSONP response');
                }
            } catch (jsonpErr) {
                console.warn('JSONP failed, trying CSV:', jsonpErr.message);
                allScheduleData = await fetchViaCsv();
                dataSource = 'CSV';
            }

            const now = new Date();
            dom.lastUpdated.textContent = now.toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }) + ` · ${allScheduleData.length} data · ${dataSource}`;

            let targetMonday;
            if (preserveCurrentWeek && previousWeekStartDate) {
                targetMonday = previousWeekStartDate;
            } else {
                targetMonday = getMonday(new Date());
            }

            renderCalendar(targetMonday);

        } catch (error) {
            dom.grid.innerHTML = `<p class="error-msg">Gagal memuat data. Silakan coba lagi nanti.<br><small>${error.message}</small></p>`;
            dom.loading.style.display = 'none';
            console.error('All fetch methods failed:', error);
        }
    };

    const setFooter = () => {
        dom.year.textContent = new Date().getFullYear();
    };

    const changeWeek = (weeks) => {
        if (!currentWeekStartDate) return;
        const newWeekStart = new Date(currentWeekStartDate);
        newWeekStart.setDate(currentWeekStartDate.getDate() + weeks * 7);
        renderCalendar(newWeekStart);
    };

    dom.prevWeekBtn.addEventListener('click', () => changeWeek(-1));
    dom.nextWeekBtn.addEventListener('click', () => changeWeek(1));

    dom.refreshBtn.addEventListener('click', () => {
        dom.refreshBtn.textContent = 'Memuat...';
        dom.refreshBtn.disabled = true;
        fetchDataAndRender(true).finally(() => {
            dom.refreshBtn.innerHTML = '↻ Refresh';
            dom.refreshBtn.disabled = false;
        });
    });

    fetchDataAndRender(false);
    setFooter();
});
