document.addEventListener('DOMContentLoaded', () => {
    // Using a CORS proxy to bypass the CORS issue for client-side fetching from local files or other domains.
    const SPREADSHEET_URL = 'https://api.allorigins.win/raw?url=https://docs.google.com/spreadsheets/d/e/2PACX-1vSmTCmQy0ILA-70ZSt0z8FGLDb_pn6R-12PDdIWuHXCATt_BfOTQ7iv2st6YJWaCjXwQBD50eUTwT_d/pub?output=csv';

    const dom = {
        grid: document.getElementById('calendar-grid'),
        loading: document.getElementById('loading'),
        weekDisplay: document.getElementById('week-display'),
        prevWeekBtn: document.getElementById('prev-week'),
        nextWeekBtn: document.getElementById('next-week'),
        lastUpdated: document.getElementById('last-updated'),
        year: document.getElementById('year'),
    };

    const SESSIONS = {
        '1': '08.30 - 10.30',
        '2': '10.45 - 12.30',
        '3': '14.00 - 16.30',
        '4': '16.30 - 18.00',
    };
    
    const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    let allScheduleData = [];
    let currentDate = new Date();

    const getMonday = (d) => {
        d = new Date(d);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
        return new Date(d.setDate(diff));
    };

    const formatDate = (date) => {
        return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const parseCSV = (text) => {
        const lines = text.trim().split('\n');
        const headersLine = lines[0] || '';
        // Trim and handle potential carriage return characters
        const headers = headersLine.split(',').map(h => h.trim());

        const data = lines.slice(1).map(line => {
            if (!line.trim()) return null; // Skip empty lines

            const values = [];
            let currentVal = '';
            let inQuotes = false;

            for (let i = 0; i < line.length; i++) {
                const char = line[i];

                if (char === '"') {
                    // Handle escaped quotes ("") by treating them as a single quote literal
                    if (inQuotes && line[i + 1] === '"') {
                        currentVal += '"';
                        i++; // Skip the next quote
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
            values.push(currentVal.trim()); // Add the last value after the loop

            if (values.length === headers.length) {
                return headers.reduce((obj, header, index) => {
                    obj[header] = values[index] || '';
                    return obj;
                }, {});
            }
            return null; // Ignore malformed lines
        }).filter(Boolean); // Remove null entries

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
        dom.grid.innerHTML = '';
        dom.loading.style.display = 'none';

        // Header row
        dom.grid.appendChild(document.createElement('div')); // Empty corner
        DAYS.forEach(day => {
            const headerCell = document.createElement('div');
            headerCell.className = 'grid-header';
            headerCell.textContent = day;
            dom.grid.appendChild(headerCell);
        });

        const weekEndDate = new Date(weekStartDate);
        weekEndDate.setDate(weekStartDate.getDate() + 5); // Monday to Saturday
        dom.weekDisplay.textContent = `${formatDate(weekStartDate)} - ${formatDate(weekEndDate)}`;
        
        const weekData = allScheduleData.filter(item => {
            const [day, month, year] = item.Tanggal.split('/');
            const itemDate = new Date(`${year}-${month}-${day}`);
            return itemDate >= weekStartDate && itemDate <= weekEndDate;
        });

        Object.keys(SESSIONS).forEach(sessionKey => {
            const sessionHeader = document.createElement('div');
            sessionHeader.className = 'session-header';
            sessionHeader.innerHTML = `Sesi ${sessionKey}<br><small>${SESSIONS[sessionKey]}</small>`;
            dom.grid.appendChild(sessionHeader);

            DAYS.forEach((dayName, dayIndex) => {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                
                const currentDay = new Date(weekStartDate);
                currentDay.setDate(weekStartDate.getDate() + dayIndex);

                const schedules = weekData.filter(item => {
                    const [d, m, y] = item.Tanggal.split('/');
                    if (!d || !m || !y) return false;
                    const itemDate = new Date(`${y}-${m}-${d}`);
                    return itemDate.toDateString() === currentDay.toDateString() && item.Sesi === sessionKey;
                });

                if (schedules.length > 0) {
                    schedules.forEach(schedule => {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = `schedule-item ${getLabColorClass(schedule.Ruang)}`;
                        itemDiv.innerHTML = `
                            <p class="item-room">${schedule.Ruang || ''}</p>
                            <p class="item-lecturer">${schedule.Pengajar || ''}</p>
                            <p class="item-activity">${schedule.Kegiatan || ''}</p>
                        `;
                        cell.appendChild(itemDiv);
                    });
                }
                dom.grid.appendChild(cell);
            });
        });
    };

    const fetchDataAndRender = async () => {
        dom.loading.style.display = 'block';
        dom.grid.innerHTML = '';
        try {
            const response = await fetch(`${SPREADSHEET_URL}&_=${new Date().getTime()}`); // Cache-busting
            const csvText = await response.text();
            allScheduleData = parseCSV(csvText);
            
            const now = new Date();
            dom.lastUpdated.textContent = now.toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'long' });

            const monday = getMonday(currentDate);
            renderCalendar(monday);

        } catch (error) {
            console.error('Error fetching or parsing data:', error);
            dom.grid.innerHTML = '<p>Gagal memuat data. Silakan coba lagi nanti.</p>';
            dom.loading.style.display = 'none';
        }
    };

    const setFooter = () => {
        dom.year.textContent = new Date().getFullYear();
    };

    const changeWeek = (weeks) => {
        currentDate.setDate(currentDate.getDate() + weeks * 7);
        const monday = getMonday(currentDate);
        renderCalendar(monday);
    };

    dom.prevWeekBtn.addEventListener('click', () => changeWeek(-1));
    dom.nextWeekBtn.addEventListener('click', () => changeWeek(1));

    // Initial load
    fetchDataAndRender();
    setFooter();
}); 