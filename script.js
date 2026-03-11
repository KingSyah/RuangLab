document.addEventListener('DOMContentLoaded', () => {
    const SHEETS_BASE_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vRFAwLD3PgidBYNKVR3gdW2wS_oD0VyYhuLP8IYh34eXEJ8iEA3KVaX_nWxLJVmZsB62cj1P-bisn70/pub?output=csv';
    const CORS_PROXY = 'https://api.allorigins.win/raw?url=';

    const dom = {
        grid: document.getElementById('calendar-grid'),
        loading: document.getElementById('loading'),
        weekDisplay: document.getElementById('week-display'),
        prevWeekBtn: document.getElementById('prev-week'),
        nextWeekBtn: document.getElementById('next-week'),
        refreshBtn: document.getElementById('refresh-btn'),
        addDataBtn: document.getElementById('add-data-btn'),
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

    // Parse "DD/MM/YYYY" as a LOCAL date (avoids UTC timezone shift bug)
    const parseTanggal = (str) => {
        const [d, m, y] = str.split('/');
        return new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    };

    // Count schedule items for a given week (Mon–Sat)
    const countItemsInWeek = (weekStart) => {
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 5);
        return allScheduleData.filter(item => {
            if (!item.Tanggal) return false;
            const parts = item.Tanggal.split('/');
            if (parts.length < 3) return false;
            const itemDate = parseTanggal(item.Tanggal);
            const status = (item.Status || '').toLowerCase().trim();
            if (status === 'ulang') return true; // recurring always present
            return itemDate >= weekStart && itemDate <= weekEnd;
        }).length;
    };

    // Find nearest week (forward first, then backward) that has data
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

        // Attach jump button handler
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

    const parseCSV = (text) => {
        // Normalize line endings: strip \r so Windows CRLF doesn't corrupt values
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

        const data = lines.slice(1).map(line => {
            if (!line.trim()) return null;

            const values = [];
            let currentVal = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i + 1] === '"') {
                        currentVal += '"';
                        i++;
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(currentVal.trim());
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim());

            // Pad or trim values to match headers length so rows aren't silently dropped
            while (values.length < headers.length) values.push('');
            if (values.length >= headers.length) {
                const obj = headers.reduce((result, header, index) => {
                    result[header] = (values[index] || '').replace(/[\r\n]/g, '').trim();
                    return result;
                }, {});

                if (obj.Sesi) {
                    // Strip invisible chars and whitespace first
                    const cleanSesi = obj.Sesi.replace(/[\u200B-\u200D\uFEFF\r\n]/g, '').trim();
                    const sesiMatch = cleanSesi.match(/(\d+)/);
                    obj.Sesi = sesiMatch ? sesiMatch[1] : cleanSesi;
                }

                return obj;
            }
            return null;
        }).filter(Boolean);

        return data;
    };

    const getLabColorClass = (labName) => {
        if (!labName) return 'lab-default';
        const name = labName.toLowerCase();
        if (name.includes('prk')) return 'lab-prk';
        if (name.includes('jarkom')) return 'lab-jarkom';
        if (name.includes('ai')) return 'lab-ai';
        if (name.includes('multimedia')) return 'lab-multimedia';
        return 'lab-default';
    };

    const renderCalendar = (weekStartDate) => {
        currentWeekStartDate = new Date(weekStartDate);
        dom.grid.innerHTML = '';
        dom.loading.style.display = 'none';
        hideNotice();

        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekStartDate.getDate() + 5);
        dom.weekDisplay.textContent = `${formatDate(weekStartDate)} – ${formatDate(weekEndDate)}`;

        const todayMonday = getMonday(new Date());
        const isCurrentWeek = weekStartDate.toDateString() === todayMonday.toDateString();

        // Corner spacer
        dom.grid.appendChild(document.createElement('div'));

        // Day headers
        DAYS.forEach((day, i) => {
            const d = new Date(weekStartDate);
            d.setDate(weekStartDate.getDate() + i);
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

        // Filter this week's data
        const weekData = allScheduleData.filter(item => {
            if (!item.Tanggal) return false;
            const parts = item.Tanggal.split('/');
            if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return false;
            const itemDate = parseTanggal(item.Tanggal);
            const status = (item.Status || '').toLowerCase().trim();

            if (status === 'ulang') {
                const itemDow = itemDate.getDay();
                for (let i = 0; i < 6; i++) {
                    const checkDay = new Date(weekStartDate);
                    checkDay.setDate(weekStartDate.getDate() + i);
                    if (checkDay.getDay() === itemDow) return true;
                }
                return false;
            }
            return itemDate >= weekStartDate && itemDate <= weekEndDate;
        });

        const weekDataCount = weekData.length;
        const pengajarInWeek = [...new Set(weekData.map(i => i.Pengajar).filter(Boolean))];

        if (dom.weekInfo) {
            dom.weekInfo.innerHTML = weekDataCount > 0
                ? `<span>${weekDataCount} jadwal</span><span>${pengajarInWeek.length} pengajar</span>`
                : '';
        }

        // Show notice if this week is empty
        if (weekDataCount === 0) {
            const nearest = findNearestWeekWithData(weekStartDate);
            if (nearest) {
                const nearestFormatted = formatDate(nearest.date);
                if (nearest.direction === 'future') {
                    const weekWord = nearest.weeks === 1 ? 'minggu depan' : `${nearest.weeks} minggu lagi`;
                    const msg = isCurrentWeek
                        ? `Belum ada jadwal untuk minggu ini. Jadwal tersedia mulai <strong>${nearestFormatted}</strong> (${weekWord}).`
                        : `Tidak ada jadwal di minggu ini. Jadwal terdekat tersedia mulai <strong>${nearestFormatted}</strong>.`;
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

        // Render session rows
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

                const currentDay = new Date(weekStartDate);
                currentDay.setDate(weekStartDate.getDate() + dayIndex);

                const isToday = currentDay.toDateString() === new Date().toDateString();
                if (isToday) cell.classList.add('cell-today');

                const schedules = weekData.filter(item => {
                    const parts = item.Tanggal.split('/');
                    if (parts.length < 3 || !parts[0] || !parts[1] || !parts[2]) return false;
                    const itemDate = parseTanggal(item.Tanggal);
                    const status = (item.Status || '').toLowerCase().trim();
                    const sesiMatch = item.Sesi === sessionKey;
                    let dateMatch = false;

                    if (status === 'ulang') {
                        dateMatch = itemDate.getDay() === currentDay.getDay();
                    } else {
                        dateMatch = itemDate.toDateString() === currentDay.toDateString();
                    }

                    return dateMatch && sesiMatch;
                });

                if (schedules.length > 0) {
                    schedules.forEach(schedule => {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = `schedule-item ${getLabColorClass(schedule.Ruang)}`;

                        const keterangan = (schedule.Keterangan || '').toLowerCase().trim();
                        const isPindah = keterangan === 'pindah';
                        const isTambah = keterangan === 'tambah';
                        const isBatal  = keterangan === 'batal';

                        if (isPindah) itemDiv.classList.add('schedule-pindah');
                        if (isTambah) itemDiv.classList.add('schedule-tambah');
                        if (isBatal)  itemDiv.classList.add('schedule-batal');

                        // Format Pengajar
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

                        // Format Kegiatan
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

                        // Status labels — shown as pill badges
                        const labels = [];
                        if (isBatal)  labels.push(`<span class="badge badge-batal">✕ Dibatalkan</span>`);
                        if (isPindah) labels.push(`<span class="badge badge-pindah">↩ Dipindah</span>`);
                        if (isTambah) labels.push(`<span class="badge badge-tambah">＋ Tambahan</span>`);
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

    const fetchDataAndRender = async (preserveCurrentWeek = false) => {
        dom.loading.style.display = 'flex';
        dom.grid.innerHTML = '';
        hideNotice();

        const previousWeekStartDate = currentWeekStartDate ? new Date(currentWeekStartDate) : null;

        try {
            const timestamp = Date.now();
            const randomParam = Math.floor(Math.random() * 1000000);
            const sheetsUrl = `${SHEETS_BASE_URL}&t=${timestamp}&r=${randomParam}`;

            let csvText;

            try {
                const response = await fetch(sheetsUrl);
                if (response.ok) csvText = await response.text();
            } catch (_) { /* fallthrough to proxy */ }

            if (!csvText) {
                const proxyUrl = `${CORS_PROXY}${encodeURIComponent(sheetsUrl)}`;
                const response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                csvText = await response.text();
            }

            allScheduleData = parseCSV(csvText);

            const now = new Date();
            dom.lastUpdated.textContent = now.toLocaleString('id-ID', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }) + ` · ${allScheduleData.length} data`;

            let targetMonday;

            if (preserveCurrentWeek && previousWeekStartDate) {
                targetMonday = previousWeekStartDate;
            } else {
                // Always open to the current week (today)
                targetMonday = getMonday(new Date());
            }

            renderCalendar(targetMonday);

        } catch (error) {
            dom.grid.innerHTML = '<p class="error-msg">Gagal memuat data. Silakan coba lagi nanti.</p>';
            dom.loading.style.display = 'none';
            throw error;
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

    dom.addDataBtn.addEventListener('click', () => {
        const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfkRcjb5wr1Q0rizu_JgQYyYi8495sLwW7QBqywJIXrjNbnUQ/viewform';
        window.open(formUrl, '_blank', 'noopener,noreferrer');
        const orig = dom.addDataBtn.textContent;
        dom.addDataBtn.textContent = '✓';
        dom.addDataBtn.style.backgroundColor = '#22c55e';
        setTimeout(() => {
            dom.addDataBtn.textContent = orig;
            dom.addDataBtn.style.backgroundColor = '';
        }, 1200);
    });

    fetchDataAndRender(false);
    setFooter();
});
