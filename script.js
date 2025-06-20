document.addEventListener('DOMContentLoaded', () => {
    // Using a CORS proxy to bypass the CORS issue for client-side fetching from local files or other domains.
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
    let currentWeekStartDate = null; // Track the current week being displayed

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
        console.log('CSV Headers:', headersLine);

        // Parse headers with proper CSV parsing
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
        headers.push(currentHeader.trim()); // Add the last header

        console.log('Parsed headers:', headers);

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
                const obj = headers.reduce((result, header, index) => {
                    result[header] = values[index] || '';
                    return result;
                }, {});

                // Normalize the Sesi field to extract just the session number
                if (obj.Sesi) {
                    const sesiMatch = obj.Sesi.match(/Sesi\s*(\d+)/i);
                    if (sesiMatch) {
                        obj.Sesi = sesiMatch[1];
                    }
                }

                return obj;
            } else {
                // Debug malformed lines
                console.warn('⚠️ Malformed CSV line - column count mismatch:', {
                    expected: headers.length,
                    got: values.length,
                    line: line,
                    values: values,
                    headers: headers
                });
                return null;
            }
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
        // Update the current week being displayed
        currentWeekStartDate = new Date(weekStartDate);

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

        console.log('📅 Displaying week:', {
            start: weekStartDate,
            end: weekEndDate,
            startString: weekStartDate.toDateString(),
            endString: weekEndDate.toDateString()
        });
        
        const weekData = allScheduleData.filter(item => {
            if (!item.Tanggal) {
                console.log('⚠️ Item without Tanggal filtered out:', item);
                return false;
            }
            const [day, month, year] = item.Tanggal.split('/');
            if (!day || !month || !year) {
                console.log('⚠️ Item with invalid Tanggal format filtered out:', {
                    tanggal: item.Tanggal,
                    pengajar: item.Pengajar,
                    ruang: item.Ruang
                });
                return false;
            }
            const itemDate = new Date(`${year}-${month}-${day}`);
            const inRange = itemDate >= weekStartDate && itemDate <= weekEndDate;

            // Debug for items in current week
            if (inRange) {
                console.log('✅ Item in current week:', {
                    pengajar: item.Pengajar,
                    ruang: item.Ruang,
                    tanggal: item.Tanggal,
                    sesi: item.Sesi,
                    keterangan: item.Keterangan || '[EMPTY]'
                });
            }

            // Debug for names with formatting issues (space after dot)
            if (item.Pengajar && item.Pengajar.includes('. ') && !inRange) {
                console.log('⚠️ Name with space after dot filtered out (different week):', {
                    pengajar: item.Pengajar,
                    tanggal: item.Tanggal,
                    itemDate: itemDate.toDateString(),
                    weekRange: `${weekStartDate.toDateString()} - ${weekEndDate.toDateString()}`
                });
            }

            return inRange;
        });

        // Update week info display
        const weekDataCount = weekData.length;
        const pengajarInWeek = [...new Set(weekData.map(item => item.Pengajar).filter(Boolean))];
        const hasSpaceAfterDot = weekData.some(item => item.Pengajar && item.Pengajar.includes('. '));


        // Debug: Log names with formatting issues in this week
        const namesWithDotsInWeek = weekData.filter(item =>
            item.Pengajar && item.Pengajar.includes('.')
        );
        const namesWithSpacesInWeek = weekData.filter(item =>
            item.Pengajar && item.Pengajar.includes('. ')
        );

        if (namesWithDotsInWeek.length > 0) {
            console.log('🎓 Names with academic titles in this week:', namesWithDotsInWeek.length);
        }
        if (namesWithSpacesInWeek.length > 0) {
            console.log('⚠️ Names with space after dot in this week:', namesWithSpacesInWeek.length);
        }



        if (dom.weekInfo) {
            dom.weekInfo.innerHTML = `
                📊 Data minggu ini: ${weekDataCount} jadwal |
                👨‍🏫 Pengajar: ${pengajarInWeek.length} orang
                ${hasSpaceAfterDot ? ' | ⚠️ Ada data dengan spasi setelah gelar' : ''}
                ${namesWithDotsInWeek.length > 0 ? ` | 🎓 Dengan gelar: ${namesWithDotsInWeek.length}` : ''}
                ${namesWithSpacesInWeek.length > 0 ? ` | ⚠️ Perlu perbaikan format: ${namesWithSpacesInWeek.length}` : ''}
            `;
        }

        console.log('📊 Week filtering results:', {
            totalData: allScheduleData.length,
            weekData: weekDataCount,
            pengajarInWeek: pengajarInWeek,
            hasSpaceAfterDot: hasSpaceAfterDot,
            namesWithDotsInWeek: namesWithDotsInWeek.length,
            namesWithSpacesInWeek: namesWithSpacesInWeek.length
        });



        Object.keys(SESSIONS).forEach(sessionKey => {
            const sessionHeader = document.createElement('div');
            sessionHeader.className = 'session-header';
            sessionHeader.innerHTML = `Sesi ${sessionKey}<br><small>${SESSIONS[sessionKey]}</small>`;
            dom.grid.appendChild(sessionHeader);

            DAYS.forEach((_, dayIndex) => {
                const cell = document.createElement('div');
                cell.className = 'grid-cell';
                
                const currentDay = new Date(weekStartDate);
                currentDay.setDate(weekStartDate.getDate() + dayIndex);

                const schedules = weekData.filter(item => {
                    const [d, m, y] = item.Tanggal.split('/');
                    if (!d || !m || !y) {
                        console.log('⚠️ Schedule item filtered out - invalid date format:', {
                            tanggal: item.Tanggal,
                            pengajar: item.Pengajar,
                            ruang: item.Ruang,
                            sesi: item.Sesi
                        });
                        return false;
                    }
                    const itemDate = new Date(`${y}-${m}-${d}`);
                    const dateMatch = itemDate.toDateString() === currentDay.toDateString();
                    const sesiMatch = item.Sesi === sessionKey;

                    // Debug logging for schedule matching
                    if (!dateMatch || !sesiMatch) {
                        console.log('⚠️ Schedule item filtered out - date/session mismatch:', {
                            pengajar: item.Pengajar,
                            ruang: item.Ruang,
                            tanggal: item.Tanggal,
                            sesi: item.Sesi,
                            expectedDate: currentDay.toDateString(),
                            expectedSession: sessionKey,
                            dateMatch: dateMatch,
                            sesiMatch: sesiMatch,
                            keterangan: item.Keterangan || '[EMPTY]'
                        });
                    } else {
                        console.log('✅ Schedule item matched for rendering:', {
                            pengajar: item.Pengajar,
                            ruang: item.Ruang,
                            tanggal: item.Tanggal,
                            sesi: item.Sesi,
                            keterangan: item.Keterangan || '[EMPTY]'
                        });
                    }

                    return dateMatch && sesiMatch;
                });

                if (schedules.length > 0) {
                    schedules.forEach(schedule => {
                        const itemDiv = document.createElement('div');
                        itemDiv.className = `schedule-item ${getLabColorClass(schedule.Ruang)}`;

                        // Check if this item has "pindah" status
                        const keterangan = (schedule.Keterangan || '').toLowerCase().trim();
                        const isPindah = keterangan === 'pindah';

                        // Debug logging for pindah detection
                        if (keterangan) {
                            console.log('🔍 Keterangan detected:', {
                                raw: schedule.Keterangan,
                                cleaned: keterangan,
                                isPindah: isPindah,
                                pengajar: schedule.Pengajar
                            });
                        }

                        // Add pindah class for styling
                        if (isPindah) {
                            itemDiv.classList.add('schedule-pindah');
                            console.log('🎨 Added schedule-pindah class to:', schedule.Pengajar);
                        }

                        // Safely process pengajar and kegiatan fields
                        const pengajar = (schedule.Pengajar || '').trim();
                        const kegiatan = (schedule.Kegiatan || '').trim();
                        const ruang = (schedule.Ruang || '').trim();

                        // Format pengajar - handle multiple names separated by comma
                        // More robust handling of pengajar field
                        let formattedPengajar = '';
                        if (pengajar) {
                            // Clean up any invisible characters and normalize spaces
                            let cleanPengajar = pengajar.replace(/[\u200B-\u200D\uFEFF]/g, '');

                            // Normalize multiple spaces to single space, but preserve structure
                            cleanPengajar = cleanPengajar.replace(/\s+/g, ' ').trim();

                            // Special handling for names with academic titles (dots)
                            if (cleanPengajar.includes('.')) {
                                // For names with dots, handle comma separation carefully
                                if (cleanPengajar.includes(',')) {
                                    formattedPengajar = cleanPengajar.split(',')
                                        .map(name => name.trim())
                                        .filter(name => name.length > 0)
                                        .join(', ');
                                } else {
                                    formattedPengajar = cleanPengajar;
                                }
                            } else if (cleanPengajar.includes(',')) {
                                // Only split by comma if no dots present
                                formattedPengajar = cleanPengajar.split(',')
                                    .map(name => name.trim())
                                    .filter(name => name.length > 0)
                                    .join(', ');
                            } else {
                                formattedPengajar = cleanPengajar;
                            }
                        }

                        // Debug logging untuk kasus bermasalah dengan formatting
                        if (pengajar && pengajar.includes('.') && !formattedPengajar) {
                            console.warn('⚠️ Name with academic title formatting issue:', {
                                raw: schedule.Pengajar,
                                trimmed: pengajar,
                                formatted: formattedPengajar
                            });
                        }



                        // Format kegiatan - handle multiple activities separated by comma
                        let formattedKegiatan = '';
                        if (kegiatan) {
                            // Clean up any invisible characters and normalize spaces
                            const cleanKegiatan = kegiatan.replace(/[\u200B-\u200D\uFEFF]/g, '').replace(/\s+/g, ' ');
                            formattedKegiatan = cleanKegiatan.split(',')
                                .map(activity => activity.trim())
                                .filter(activity => activity.length > 0)
                                .join(', ');
                        }

                        // Always show ruang, and show pengajar/kegiatan if they exist
                        let htmlContent = `<p class="item-room">${ruang || 'Ruang tidak diketahui'}</p>`;

                        if (formattedPengajar) {
                            htmlContent += `<p class="item-lecturer">${formattedPengajar}</p>`;
                        }

                        if (formattedKegiatan) {
                            htmlContent += `<p class="item-activity">${formattedKegiatan}</p>`;
                        }

                        // If both pengajar and kegiatan are empty, show a placeholder
                        if (!formattedPengajar && !formattedKegiatan) {
                            htmlContent += `<p class="item-activity" style="font-style: italic; color: #999;">Data tidak lengkap</p>`;
                        }

                        // Add PINDAH stamp if status is pindah
                        if (isPindah) {
                            htmlContent += `<div class="pindah-stamp">PINDAH</div>`;
                            console.log('✅ Added PINDAH stamp for:', {
                                pengajar: formattedPengajar,
                                ruang: ruang,
                                keterangan: schedule.Keterangan
                            });
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
        dom.loading.style.display = 'block';
        dom.grid.innerHTML = '';

        // Store the current week being displayed before fetching new data
        const previousWeekStartDate = currentWeekStartDate ? new Date(currentWeekStartDate) : null;

        try {
            // Try different approaches to fix HTTP 400 error with better cache busting
            const timestamp = Date.now();
            const randomParam = Math.floor(Math.random() * 1000000);
            const sheetsUrl = `${SHEETS_BASE_URL}&t=${timestamp}&r=${randomParam}`;

            // Try direct fetch first, then fallback to proxy
            let response;
            let csvText;

            try {
                console.log('Trying direct fetch from:', sheetsUrl);
                response = await fetch(sheetsUrl);
                if (response.ok) {
                    csvText = await response.text();
                    console.log('✅ Direct fetch successful');
                }
            } catch (directError) {
                console.log('❌ Direct fetch failed, trying proxy:', directError.message);
            }

            // If direct fetch failed, try proxy
            if (!csvText) {
                const proxyUrl = `${CORS_PROXY}${encodeURIComponent(sheetsUrl)}`;
                console.log('Fetching data via proxy:', proxyUrl);
                response = await fetch(proxyUrl);
                if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                csvText = await response.text();
                console.log('✅ Proxy fetch successful');
            }

            console.log('Received CSV data:', csvText.slice(0, 200)); // Log first 200 chars
            allScheduleData = parseCSV(csvText);

            // Debug: Log raw parsed data before any filtering
            console.log('🔍 Raw parsed data count:', allScheduleData.length);
            console.log('🔍 Sample raw data:', allScheduleData.slice(0, 5));

            // Debug: Log all keterangan values before filtering (including empty ones)
            const allKeterangan = allScheduleData.map(item => item.Keterangan || '[EMPTY]');
            console.log('📋 All Keterangan values found (including empty):', [...new Set(allKeterangan)]);

            // Debug: Log all pengajar values
            const allPengajar = allScheduleData.map(item => item.Pengajar).filter(Boolean);
            const uniquePengajar = [...new Set(allPengajar)];
            console.log('👨‍🏫 All Pengajar values found:', uniquePengajar);

            // Debug: Check for records with empty keterangan
            const emptyKeteranganRecords = allScheduleData.filter(item => !item.Keterangan || item.Keterangan.trim() === '');
            console.log('📝 Records with empty keterangan:', emptyKeteranganRecords.length);
            if (emptyKeteranganRecords.length > 0) {
                console.log('📝 Sample empty keterangan records:', emptyKeteranganRecords.slice(0, 3));
            }

            // Debug: Check for names with formatting variations (dots and spaces)
            const namesWithDots = uniquePengajar.filter(name => name.includes('.'));
            const namesWithSpaces = uniquePengajar.filter(name => name.includes('. '));
            console.log('🎓 Names with academic titles found:', namesWithDots.length);
            if (namesWithSpaces.length > 0) {
                console.log('⚠️ Names with space after dot found:', namesWithSpaces.length, 'samples:', namesWithSpaces.slice(0, 3));
            }

            // Filter out ONLY data with "batal" status, keep "pindah" data
            const originalCount = allScheduleData.length;
            allScheduleData = allScheduleData.filter(item => {
                const keterangan = (item.Keterangan || '').toLowerCase().trim();
                const isBatal = keterangan === 'batal';
                const isPindah = keterangan === 'pindah';
                const isEmpty = !item.Keterangan || item.Keterangan.trim() === '';

                if (isBatal) {
                    console.log('🚫 Filtering out batal record:', {
                        pengajar: item.Pengajar,
                        keterangan: item.Keterangan,
                        tanggal: item.Tanggal
                    });
                }

                if (isPindah) {
                    console.log('✅ Keeping pindah record (will show with stamp):', {
                        pengajar: item.Pengajar,
                        keterangan: item.Keterangan,
                        tanggal: item.Tanggal
                    });
                }

                if (isEmpty) {
                    console.log('📝 Keeping record with empty keterangan:', {
                        pengajar: item.Pengajar,
                        ruang: item.Ruang,
                        tanggal: item.Tanggal,
                        sesi: item.Sesi
                    });
                }

                // Only filter out "batal", keep everything else including "pindah" and empty
                return !isBatal;
            });

            const filteredCount = originalCount - allScheduleData.length;
            if (filteredCount > 0) {
                console.log(`🚫 Filtered out ${filteredCount} records with 'batal' status`);
            }

            // Debug: Check for pindah records
            const pindahRecords = allScheduleData.filter(item => {
                const keterangan = (item.Keterangan || '').toLowerCase().trim();
                return keterangan === 'pindah';
            });
            console.log('🔄 Found pindah records:', pindahRecords.length, pindahRecords);

            console.log('Parsed data sample:', allScheduleData.slice(0, 3));
            console.log('Total parsed records after filtering:', allScheduleData.length);

            // Debug: Check for records with space after dot in pengajar
            const pengajarWithSpaces = allScheduleData.filter(item =>
                item.Pengajar && item.Pengajar.includes('. ')
            );
            if (pengajarWithSpaces.length > 0) {
                console.log('📋 Found records with space after dot:', pengajarWithSpaces.length);
                console.log('Sample:', pengajarWithSpaces.slice(0, 2));
            }

            const now = new Date();
            dom.lastUpdated.textContent = now.toLocaleString('id-ID', {
                dateStyle: 'full',
                timeStyle: 'long'
            }) + ` | Jumlah Data: ${allScheduleData.length}`;

            // Determine target date based on the refresh type
            let targetDate;

            if (preserveCurrentWeek && previousWeekStartDate) {
                // Use the previously displayed week (for refresh button)
                targetDate = previousWeekStartDate;
                console.log('🔄 Preserving current week for refresh:', targetDate.toDateString());
            } else if (allScheduleData.length > 0) {
                // Find the week with the most data to show (for initial load)
                const weekDataCounts = {};

                allScheduleData.forEach(item => {
                    if (!item.Tanggal) return;
                    const [day, month, year] = item.Tanggal.split('/');
                    if (!day || !month || !year) return;
                    const itemDate = new Date(`${year}-${month}-${day}`);
                    const monday = getMonday(itemDate);
                    const weekKey = monday.toDateString();

                    if (!weekDataCounts[weekKey]) {
                        weekDataCounts[weekKey] = { count: 0, date: monday, items: [] };
                    }
                    weekDataCounts[weekKey].count++;
                    weekDataCounts[weekKey].items.push(item);
                });

                // Find week with most data
                const sortedWeeks = Object.values(weekDataCounts)
                    .sort((a, b) => b.count - a.count);

                if (sortedWeeks.length > 0) {
                    targetDate = sortedWeeks[0].date;
                    console.log('🎯 Using week with most data:', targetDate.toDateString(),
                               `(${sortedWeeks[0].count} items)`);

                    // Log all weeks for debugging
                    console.log('📊 All weeks with data:', sortedWeeks.map(w => ({
                        week: w.date.toDateString(),
                        count: w.count,
                        pengajar: [...new Set(w.items.map(i => i.Pengajar).filter(Boolean))]
                    })));
                } else {
                    targetDate = new Date(); // Fallback to current date
                }
            } else {
                targetDate = new Date(); // Fallback to current date
            }

            const monday = getMonday(targetDate);
            renderCalendar(monday);

        } catch (error) {
            console.error('Error fetching or parsing data:', error);
            dom.grid.innerHTML = '<p>Gagal memuat data. Silakan coba lagi nanti.</p>';
            dom.loading.style.display = 'none';
            throw error; // Re-throw untuk handling di refresh button
        }
    };

    const setFooter = () => {
        dom.year.textContent = new Date().getFullYear();
    };

    const changeWeek = (weeks) => {
        console.log('🔄 Navigating week by', weeks, 'weeks from', currentWeekStartDate?.toDateString());

        // Ensure we have data before navigating
        if (allScheduleData.length === 0) {
            console.warn('⚠️ No data available for navigation');
            return;
        }

        // Use the current displayed week as base, not currentDate
        if (currentWeekStartDate) {
            const newWeekStart = new Date(currentWeekStartDate);
            newWeekStart.setDate(currentWeekStartDate.getDate() + weeks * 7);
            console.log('New week start date:', newWeekStart);

            // Debug: Check data count for the new week
            const newWeekEnd = new Date(newWeekStart);
            newWeekEnd.setDate(newWeekStart.getDate() + 5);
            const dataInNewWeek = allScheduleData.filter(item => {
                if (!item.Tanggal) return false;
                const [day, month, year] = item.Tanggal.split('/');
                if (!day || !month || !year) return false;
                const itemDate = new Date(`${year}-${month}-${day}`);
                return itemDate >= newWeekStart && itemDate <= newWeekEnd;
            });
            console.log('� Data in new week:', dataInNewWeek.length, 'records');

            renderCalendar(newWeekStart);
        } else {
            // Fallback to currentDate if currentWeekStartDate is not set
            console.log('Using fallback to currentDate');
            currentDate.setDate(currentDate.getDate() + weeks * 7);
            const monday = getMonday(currentDate);
            renderCalendar(monday);
        }
    };

    dom.prevWeekBtn.addEventListener('click', () => changeWeek(-1));
    dom.nextWeekBtn.addEventListener('click', () => changeWeek(1));
    dom.refreshBtn.addEventListener('click', () => {
        // Show loading state
        dom.refreshBtn.textContent = '🔄 Memuat...';
        dom.refreshBtn.disabled = true;

        // Fetch new data and preserve the current week being displayed
        fetchDataAndRender(true).finally(() => {
            // Reset button state
            dom.refreshBtn.textContent = '🔄 Refresh Data';
            dom.refreshBtn.disabled = false;
        });
    });

    dom.addDataBtn.addEventListener('click', () => {
        // Open Google Form in new tab
        const formUrl = 'https://docs.google.com/forms/d/e/1FAIpQLSfkRcjb5wr1Q0rizu_JgQYyYi8495sLwW7QBqywJIXrjNbnUQ/viewform';
        window.open(formUrl, '_blank', 'noopener,noreferrer');

        // Optional: Add visual feedback
        const originalText = dom.addDataBtn.textContent;
        dom.addDataBtn.textContent = '✓';
        dom.addDataBtn.style.backgroundColor = '#28a745';

        setTimeout(() => {
            dom.addDataBtn.textContent = originalText;
            dom.addDataBtn.style.backgroundColor = '';
        }, 1000);
    });



    // Initial load - show week with most data by default
    fetchDataAndRender(false);
    setFooter();
}); 