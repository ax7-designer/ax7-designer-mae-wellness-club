import { supabase } from '../shared/supabaseClient.js';
import { isAdmin } from '../auth/admin.js';
import { DISCIPLINE_ICONS, DISCIPLINE_CAPACITY } from '../credits/creditRules.js';
import { showToast, getISOFromDate, getChetumalDate } from '../shared/uiHelpers.js';

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Initializes classes list and calendar strip controller.
 */
export function initClassController(state, controllers) {
    const dateScrollContainer = document.getElementById('dateScrollContainer');
    const dailyClassesList = document.getElementById('dailyClassesList');
    const selectedDateDisplay = document.getElementById('selectedDateDisplay');
    const addAdminClassBtn = document.getElementById('addAdminClassBtn');
    const addInactiveDayBtn = document.getElementById('addInactiveDayBtn');
    const selectedClassProfile = document.getElementById('selectedClassProfile');
    const spotsGrid = document.getElementById('spotsGrid');

    /* ----------------------- Inactive Days Loader ----------------------- */
    async function loadInactiveDays() {
        try {
            const { data } = await supabase.from('inactive_days').select('*');
            state.inactiveDays.weekdays = new Set([0]); // Sunday inactive by default
            state.inactiveDays.specific = new Set();
            (data || []).forEach(row => {
                if (row.type === 'weekday') state.inactiveDays.weekdays.add(row.weekday);
                else if (row.type === 'specific') state.inactiveDays.specific.add(row.date);
            });
        } catch (e) {
            console.warn("Could not load inactive days", e);
        }
    }

    /* ----------------------- Date Pills Generation ----------------------- */
    function buildDatePills() {
        if (!dateScrollContainer) return;
        dateScrollContainer.innerHTML = '';
        const today = getChetumalDate();

        for (let i = 0; i < 60; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const thisISO = getISOFromDate(d);
            const dayName = i === 0 ? 'Hoy' : DAYS_ES[d.getDay()];
            const dateNum = d.getDate();
            const inactive = state.inactiveDays.weekdays.has(d.getDay()) || state.inactiveDays.specific.has(thisISO);

            const pill = document.createElement('div');
            pill.className = `date-pill ${thisISO === state.selectedDateISO ? 'active' : ''} ${inactive ? 'inactive' : ''}`;
            pill.dataset.iso = thisISO;
            pill.innerHTML = `
                <span class="day">${dayName}</span>
                <span class="date">${dateNum}</span>
                ${inactive ? '<span class="inactive-icon"><i class="fa-solid fa-moon"></i></span>' : ''}
            `;

            if (!inactive) {
                if (thisISO === state.selectedDateISO && selectedDateDisplay) {
                    selectedDateDisplay.textContent = i === 0 ? 'Clases de Hoy' : `Clases del ${dateNum} — ${dayName}`;
                }
                pill.addEventListener('click', () => {
                    document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    state.selectedDateISO = thisISO;
                    try {
                        localStorage.setItem('mae_last_date', thisISO);
                    } catch (e) {
                        console.warn("Error caching last viewed date", e);
                    }
                    if (selectedDateDisplay) {
                        selectedDateDisplay.textContent = i === 0 ? 'Clases de Hoy' : `Clases del ${dateNum} — ${dayName}`;
                    }
                    renderDailyClasses();
                });
            } else {
                pill.setAttribute('title', 'Día inactivo');
            }
            dateScrollContainer.appendChild(pill);
        }

        // Auto-scroll the active pill into view
        setTimeout(() => {
            const activePill = dateScrollContainer.querySelector('.date-pill.active');
            if (activePill) {
                activePill.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }, 100);
    }

    /* ----------------------- Render Daily Classes ----------------------- */
    async function renderDailyClasses() {
        if (!dailyClassesList) return;
        const d = new Date(state.selectedDateISO + 'T12:00:00');
        const isInactive = state.inactiveDays.weekdays.has(d.getDay()) || state.inactiveDays.specific.has(state.selectedDateISO);

        if (isInactive) {
            dailyClassesList.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-style:italic;"><i class="fa-solid fa-moon" style="color:var(--accent-gold);margin-right:8px;"></i>Este día está marcado como inactivo.</p>`;
            if (selectedClassProfile) selectedClassProfile.style.display = 'none';
            if (spotsGrid) spotsGrid.innerHTML = '';
            return;
        }

        const cacheKey = 'mae_classes_' + state.selectedDateISO;
        const cachedDataStr = localStorage.getItem(cacheKey);
        let cachedRaw = null;
        let didRenderFromCache = false;

        if (cachedDataStr) {
            try {
                cachedRaw = JSON.parse(cachedDataStr);
                if (Array.isArray(cachedRaw)) {
                    doRender(cachedRaw);
                    didRenderFromCache = true;
                }
            } catch (e) {
                console.warn("Error parsing cached classes", e);
            }
        }

        if (!didRenderFromCache) {
            dailyClassesList.innerHTML = '<p style="text-align:center;color:var(--accent-gold);"><i class="fa-solid fa-spinner fa-spin"></i> Cargando clases...</p>';
            if (selectedClassProfile) selectedClassProfile.style.display = 'none';
            if (spotsGrid) spotsGrid.innerHTML = '';
        }

        try {
            const { data: rawClasses, error } = await supabase
                .from('classes').select('*').eq('date', state.selectedDateISO);

            if (error) {
                if (!didRenderFromCache) {
                    dailyClassesList.innerHTML = `<p style="color:#ff5555;">Error: ${error.message}</p>`;
                }
                return;
            }

            const rawClassesStr = JSON.stringify(rawClasses);
            const cachedRawStr = cachedRaw ? JSON.stringify(cachedRaw) : null;

            if (!didRenderFromCache || rawClassesStr !== cachedRawStr) {
                doRender(rawClasses);
                localStorage.setItem(cacheKey, rawClassesStr);
            }
        } catch (err) {
            console.error("Fetch classes error:", err);
            if (!didRenderFromCache) {
                dailyClassesList.innerHTML = `<p style="color:#ff5555;">Error de conexión</p>`;
            }
        }

        function doRender(classesArray) {
            if (!classesArray || classesArray.length === 0) {
                dailyClassesList.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-style:italic;">No hay clases programadas para este día.</p>`;
                if (selectedClassProfile) selectedClassProfile.style.display = 'none';
                if (spotsGrid) spotsGrid.innerHTML = '';
                return;
            }

            const seenSlots = new Set();
            const dayClassesRaw = classesArray
                .map(cls => {
                    let time = cls.class_time || "00:00";
                    let hasValidTime = !!cls.class_time;
                    let displayNote = cls.note || "";

                    if (cls.note && cls.note.includes("[T:")) {
                        const match = cls.note.match(/\[T:(\d{2}:\d{2})\]/);
                        if (match) {
                            time = match[1];
                            displayNote = cls.note.replace(match[0], "");
                            hasValidTime = true;
                        }
                    }

                    const [hh, mm] = time.split(':').map(Number);
                    const hour12 = hh % 12 || 12;
                    const ampm = hh >= 12 ? 'PM' : 'AM';
                    const time12 = `${hour12}:${String(mm).padStart(2, '0')} ${ampm}`;
                    const isPM = hh >= 12;

                    return { ...cls, time, time12, isPM, displayNote, sortVal: hh * 60 + mm, hasValidTime };
                })
                .filter(cls => {
                    if (!cls.hasValidTime) return false;
                    const dayNum = d.getDay();
                    if (dayNum === 0) return false; // Sunday always inactive
                    return true;
                });

            const nowChetumal = getChetumalDate();
            const currentMinutes = nowChetumal.getHours() * 60 + nowChetumal.getMinutes();
            const todayISO = getISOFromDate(nowChetumal);
            const GRACE_PERIOD = 10;

            const disciplinePriority = { 'Pilates': 1, 'Train': 2, 'Indoor Cycling': 3 };
            const dayClasses = dayClassesRaw
                .sort((a, b) => {
                    if (a.sortVal !== b.sortVal) return a.sortVal - b.sortVal;
                    const priorityA = disciplinePriority[a.discipline] || 99;
                    const priorityB = disciplinePriority[b.discipline] || 99;
                    if (priorityA !== priorityB) return priorityA - priorityB;
                    return 0;
                })
                .filter(cls => {
                    const key = `${cls.discipline}_${cls.time}`;
                    if (seenSlots.has(key)) return false;
                    seenSlots.add(key);
                    return true;
                })
                .map(cls => {
                    const isPast = (state.selectedDateISO === todayISO) && (cls.sortVal < currentMinutes - GRACE_PERIOD);
                    return { ...cls, isPast };
                })
                .filter(cls => {
                    if (!isAdmin(state.currentUser) && cls.isPast) return false;
                    return state.activeDisciplineFilter === 'all' || cls.discipline === state.activeDisciplineFilter;
                });

            dailyClassesList.innerHTML = '';
            if (dayClasses.length === 0) {
                let emptyMsg = "No hay clases disponibles para estos criterios.";
                if (state.selectedDateISO === todayISO && state.activeDisciplineFilter === 'all') {
                    emptyMsg = "¡Todas las clases de hoy han terminado! Nos vemos mañana para seguir dándolo todo. ✨";
                }
                dailyClassesList.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-style:italic;margin-top:20px;padding: 0 20px;line-height:1.5;">${emptyMsg}</p>`;
                return;
            }

            let currentGroup = null;
            let lastSortVal = null;

            dayClasses.forEach(cls => {
                const group = cls.isPM ? 'Vespertino' : 'Matutino';

                if (group !== currentGroup) {
                    currentGroup = group;
                    const header = document.createElement('div');
                    header.className = 'session-group-header';
                    header.innerHTML = `<span>${group}</span>`;
                    dailyClassesList.appendChild(header);
                } else if (lastSortVal !== null && lastSortVal !== cls.sortVal) {
                    const spacer = document.createElement('div');
                    spacer.className = 'time-slot-spacer';
                    dailyClassesList.appendChild(spacer);
                }
                lastSortVal = cls.sortVal;

                const occupied = cls.occupied_spots || [];
                const freeCount = cls.capacity - occupied.length;
                const card = document.createElement('div');
                const isActive = state.selectedClassConfig && state.selectedClassConfig.id === cls.id;
                card.className = `daily-class-card ${cls.isPast ? 'past' : ''} ${isActive ? 'active' : ''}`;
                const discIcon = DISCIPLINE_ICONS[cls.discipline] || 'fa-star';
                card.innerHTML = `
                    <div class="daily-class-time-tag">${cls.time12}</div>
                    <div class="daily-class-info">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <i class="fa-solid ${discIcon}" style="color:var(--accent-gold); font-size:1.1rem; width:20px; text-align:center;"></i>
                            <h4 style="margin:0;">${cls.discipline}</h4>
                        </div>
                        <p class="coach-name-item" style="display: none;"><i class="fa-solid fa-user"></i> Coach ${cls.coach_name}</p>
                    </div>
                    <div class="daily-class-meta">
                        <span class="spots-badge">${freeCount} lugares libres</span>
                        ${isAdmin(state.currentUser) ? `
                            <button class="roster-btn" title="Pase de lista" style="background:rgba(201,169,110,0.12); border:1px solid rgba(201,169,110,0.3); color:var(--accent-gold); cursor:pointer; padding:5px 10px; border-radius:6px; margin-left:6px; font-size:0.75rem;">
                                <i class="fa-solid fa-clipboard-list"></i>
                            </button>
                            <button class="delete-class-btn" title="Eliminar clase" style="background:none; border:none; color:#e63946; cursor:pointer; padding:5px; margin-left:4px;">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>` : ''}
                        <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);font-size:0.8rem; margin-left:10px;"></i>
                    </div>`;

                const delBtn = card.querySelector('.delete-class-btn');
                if (delBtn) {
                    delBtn.addEventListener('click', async (e) => {
                        e.stopPropagation();
                        if (confirm(`¿Estás seguro de eliminar la clase de ${cls.discipline}?`)) {
                            const { error } = await supabase.from('classes').delete().eq('id', cls.id);
                            if (error) showToast(`Error al eliminar: ${error.message}`, 'error');
                            else {
                                showToast('✓ Clase eliminada');
                                renderDailyClasses();
                            }
                        }
                    });
                }

                const rosterBtn = card.querySelector('.roster-btn');
                if (rosterBtn && controllers.adminController) {
                    rosterBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        controllers.adminController.showRosterModal(cls);
                    });
                }

                card.addEventListener('click', async () => {
                    document.querySelectorAll('.daily-class-card').forEach(c => c.classList.remove('active'));
                    card.classList.add('active');
                    if (controllers.bookingController) {
                        await controllers.bookingController.showClassDetails(cls);
                    }
                });
                dailyClassesList.appendChild(card);
            });

            // Update details view silently if active
            if (state.selectedClassConfig) {
                const freshConfig = classesArray.find(c => c.id === state.selectedClassConfig.id);
                if (freshConfig) {
                    state.selectedClassConfig = freshConfig;
                    if (selectedClassProfile && selectedClassProfile.style.display === 'block' && controllers.bookingController) {
                        controllers.bookingController.renderSpotsGrid(freshConfig);
                    }
                }
            }
        }
    }

    /* ----------------------- Filter Buttons Binding ----------------------- */
    const filterButtons = document.querySelectorAll('.filter-btn');
    if (state.activeDisciplineFilter !== 'all') {
        filterButtons.forEach(btn => btn.classList.remove('active'));
        document.querySelector(`.filter-btn[data-filter="${state.activeDisciplineFilter}"]`)?.classList.add('active');
    }
    filterButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const isAlreadyActive = btn.classList.contains('active');
            filterButtons.forEach(b => b.classList.remove('active'));

            if (isAlreadyActive && btn.dataset.filter !== 'all') {
                state.activeDisciplineFilter = 'all';
                document.querySelector('.filter-btn[data-filter="all"]')?.classList.add('active');
            } else {
                btn.classList.add('active');
                state.activeDisciplineFilter = btn.dataset.filter;
            }
            try {
                localStorage.setItem('mae_discipline_filter', state.activeDisciplineFilter);
            } catch (e) {
                console.warn("Error saving active discipline filter preference", e);
            }
            renderDailyClasses();
        });
    });

    return {
        loadInactiveDays,
        buildDatePills,
        renderDailyClasses
    };
}
