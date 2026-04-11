import { supabase } from './supabaseClient.js';

/* ============================================================
   CONSTANTS
   ============================================================ */
const ADMIN_EMAILS = ['jesuscomtreras.666@gmail.com', 'guemesana12@gmail.com', 'alexis.septem@gmail.com'];

const AVATAR_ICON_MAP = {
    bolt:     'fa-bolt',
    fire:     'fa-fire',
    dumbbell: 'fa-dumbbell',
    mountain: 'fa-mountain-sun',
    leaf:     'fa-leaf',
    tornado:  'fa-tornado',
    star:     'fa-star',
    dragon:   'fa-dragon',
    crown:    'fa-crown',
    infinity: 'fa-infinity',
    skull:    'fa-skull',
    gem:      'fa-gem',
};

const DISCIPLINE_CAPACITY = {
    'Train': 8,
    'Indoor Cycling': 11,
    'Pilates': 4
};

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/* ============================================================
   STATE
   ============================================================ */
let currentUser    = null;
let selectedAvatar = 'bolt';
let selectedDateISO = new Date().toISOString().split('T')[0];
let selectedClassConfig = null;
// inactiveDays: { weekdays: Set<number>, specific: Set<string> }
let inactiveDays = { weekdays: new Set(), specific: new Set() };

/* ============================================================
   HELPERS
   ============================================================ */
function getISOFromDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function isAdmin(user) {
    return user && ADMIN_EMAILS.includes(user.email);
}

function showToast(message, type = 'success') {
    const existing = document.getElementById('siteToast');
    if (existing) existing.remove();
    const toast = document.createElement('div');
    toast.id = 'siteToast';
    toast.innerHTML = message;
    const colors = { success: '#2a9d8f', error: '#e63946', info: 'var(--accent-gold)' };
    Object.assign(toast.style, {
        position: 'fixed', bottom: '28px', left: '50%', transform: 'translateX(-50%)',
        background: colors[type] || colors.success, color: '#fff', padding: '12px 28px',
        borderRadius: '30px', fontFamily: 'inherit', fontSize: '0.9rem', fontWeight: '600',
        zIndex: '99999', boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
        transition: 'opacity 0.4s', opacity: '0', whiteSpace: 'nowrap'
    });
    document.body.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; });
    setTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 400); }, 3000);
}

/* ============================================================
   MAIN INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {

    /* ------- DOM References ------- */
    const loginBtn           = document.getElementById('loginBtn');
    const loginModal         = document.getElementById('loginModal');
    const closeModal         = document.getElementById('closeModal');
    const loginForm          = document.getElementById('loginForm');
    const emailInput         = document.getElementById('email');
    const passInput          = document.getElementById('password');
    const logInBtnMsg        = document.querySelector('.log-in-btn');
    const profileModal       = document.getElementById('profileModal');
    const closeProfileModal  = document.getElementById('closeProfileModal');
    const profileGreeting    = document.getElementById('profileGreeting');
    const profileAvatarDisp  = document.getElementById('profileAvatarDisplay');
    const nicknameInput      = document.getElementById('nicknameInput');
    const saveProfileBtn     = document.getElementById('saveProfileBtn');
    const logoutBtn          = document.getElementById('logoutBtn');
    const avatarOptions      = document.querySelectorAll('.avatar-option');
    const btnGoogle          = document.getElementById('btnGoogle');
    const btnFacebook        = document.getElementById('btnFacebook');
    const navbar             = document.getElementById('navbar');

    /* -----------------------------------------------
       1. PROFILE MODAL
    ----------------------------------------------- */
    function openProfileModal(user) {
        if (!profileModal) return;
        const meta     = user.user_metadata || {};
        const nickname = meta.nickname || user.email.split('@')[0];
        const avatar   = meta.avatar   || 'bolt';
        if (nicknameInput)   nicknameInput.value = nickname;
        if (profileGreeting) profileGreeting.textContent = `Hola, ${nickname}`;
        selectedAvatar = avatar;
        syncAvatarUI(avatar);

        // Show/hide admin badge
        const adminBadge = document.getElementById('profileAdminBadge');
        if (adminBadge) adminBadge.style.display = isAdmin(user) ? 'flex' : 'none';

        profileModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeProfileModalFunc() {
        if (!profileModal) return;
        profileModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    function syncAvatarUI(key) {
        const iconClass = AVATAR_ICON_MAP[key] || 'fa-bolt';
        if (profileAvatarDisp) profileAvatarDisp.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        avatarOptions.forEach(opt => opt.classList.toggle('selected', opt.dataset.avatar === key));
    }

    avatarOptions.forEach(opt => {
        opt.addEventListener('click', () => { selectedAvatar = opt.dataset.avatar; syncAvatarUI(selectedAvatar); });
    });

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async () => {
            const nickname = nicknameInput ? nicknameInput.value.trim() || 'Miembro' : 'Miembro';
            saveProfileBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
            saveProfileBtn.disabled = true;
            const { error } = await supabase.auth.updateUser({ data: { nickname, avatar: selectedAvatar } });
            if (error) { showToast(`Error: ${error.message}`, 'error'); }
            else {
                const { data: { user } } = await supabase.auth.getUser();
                updateAuthUI(user);
                closeProfileModalFunc();
                showToast('✓ Perfil actualizado');
            }
            saveProfileBtn.innerHTML = `<i class="fa-solid fa-check"></i> Guardar Perfil`;
            saveProfileBtn.disabled = false;
        });
    }

    if (closeProfileModal) closeProfileModal.addEventListener('click', closeProfileModalFunc);
    if (profileModal) profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeProfileModalFunc(); });

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            closeProfileModalFunc();
            await supabase.auth.signOut();
            updateAuthUI(null);
            window.location.reload();
        });
    }

    /* -----------------------------------------------
       2. AUTH UI UPDATER
    ----------------------------------------------- */
    const updateAuthUI = (user) => {
        currentUser = user;
        if (!loginBtn) return;
        const addAdminClassBtn = document.getElementById('addAdminClassBtn');
        const addInactiveDayBtn = document.getElementById('addInactiveDayBtn');

        if (user) {
            const meta      = user.user_metadata || {};
            const nickname  = meta.nickname || user.email.split('@')[0];
            const avatar    = meta.avatar   || 'bolt';
            const iconClass = AVATAR_ICON_MAP[avatar] || 'fa-bolt';
            const adminTag  = isAdmin(user)
                ? `<span class="admin-badge-nav"><i class="fa-solid fa-shield-halved"></i> Admin</span>`
                : '';
            loginBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span class="action-text">Hola, ${nickname}</span>${adminTag}`;

            if (addAdminClassBtn)  addAdminClassBtn.style.display  = isAdmin(user) ? 'inline-flex' : 'none';
            if (addInactiveDayBtn) addInactiveDayBtn.style.display = isAdmin(user) ? 'inline-flex' : 'none';
        } else {
            loginBtn.innerHTML = `<i class="fa-regular fa-user"></i> <span class="action-text">Iniciar Sesión</span>`;
            if (addAdminClassBtn)  addAdminClassBtn.style.display  = 'none';
            if (addInactiveDayBtn) addInactiveDayBtn.style.display = 'none';
        }
    };

    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            if (currentUser) openProfileModal(currentUser);
            else openModal();
        });
    }

    const { data: { session } } = await supabase.auth.getSession();
    updateAuthUI(session?.user || null);

    /* -----------------------------------------------
       3. LOGIN MODAL
    ----------------------------------------------- */
    function openModal() {
        if (loginModal) { loginModal.classList.add('active'); document.body.style.overflow = 'hidden'; }
    }
    function closeModalFunc() {
        if (loginModal) { loginModal.classList.remove('active'); document.body.style.overflow = 'auto'; }
    }

    if (closeModal) closeModal.addEventListener('click', closeModalFunc);
    if (loginModal) loginModal.addEventListener('click', (e) => { if (e.target === loginModal) closeModalFunc(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModalFunc(); closeProfileModalFunc(); } });

    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            updateAuthUI(session.user);
            if (window.location.hash.includes('access_token')) {
                window.history.replaceState(null, null, window.location.pathname + window.location.search);
            }
            if (event === 'SIGNED_IN') {
                showToast(isAdmin(session.user) ? '🛡️ Modo Admin activado' : '¡Bienvenido/a a Team Mae!', 'info');
                closeModalFunc();
            }
        } else {
            updateAuthUI(null);
        }
    });

    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value, password = passInput.value;
            const originalText = logInBtnMsg.innerHTML;
            logInBtnMsg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cargando...`;
            logInBtnMsg.disabled = true;

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                if (error.message.includes('Invalid login credentials') || error.status === 400) {
                    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
                    if (signUpError) { showToast(`Error: ${signUpError.message}`, 'error'); }
                    else {
                        const user = signUpData.user || signUpData.session?.user;
                        if (user) { closeModalFunc(); updateAuthUI(user); }
                        else { showToast('Revisa tu correo para confirmar tu cuenta.', 'info'); }
                    }
                } else { showToast(`Error: ${error.message}`, 'error'); }
            } else {
                closeModalFunc(); updateAuthUI(data.user);
            }
            logInBtnMsg.innerHTML = originalText;
            logInBtnMsg.disabled = false;
        });
    }

    if (btnGoogle) {
        btnGoogle.addEventListener('click', async () => {
            const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
            if (error) showToast(`Error Google: ${error.message}`, 'error');
        });
    }
    if (btnFacebook) {
        btnFacebook.addEventListener('click', async () => {
            const { error } = await supabase.auth.signInWithOAuth({ provider: 'facebook', options: { redirectTo: window.location.origin } });
            if (error) showToast(`Error Facebook: ${error.message}`, 'error');
        });
    }

    /* -----------------------------------------------
       4. NAVBAR SCROLL
    ----------------------------------------------- */
    if (navbar) {
        const handleNavScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 60);
        window.addEventListener('scroll', handleNavScroll);
        handleNavScroll();
    }

    /* -----------------------------------------------
       5. MOBILE MENU
    ----------------------------------------------- */
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileMenu   = document.getElementById('mobileMenu');
    const mobileClose  = document.getElementById('mobileMenuClose');
    const mobileLinks  = document.querySelectorAll('.mobile-nav-link');

    function openMobileMenu() {
        if (!mobileMenu) return;
        mobileMenu.classList.add('open'); mobileMenu.setAttribute('aria-hidden', 'false');
        hamburgerBtn?.classList.add('open'); hamburgerBtn?.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }
    function closeMobileMenu() {
        if (!mobileMenu) return;
        mobileMenu.classList.remove('open'); mobileMenu.setAttribute('aria-hidden', 'true');
        hamburgerBtn?.classList.remove('open'); hamburgerBtn?.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = 'auto';
    }
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openMobileMenu);
    if (mobileClose)  mobileClose.addEventListener('click', closeMobileMenu);
    if (mobileMenu)   mobileMenu.addEventListener('click', (e) => { const panel = mobileMenu.querySelector('.mobile-menu-panel'); if (panel && !panel.contains(e.target)) closeMobileMenu(); });
    mobileLinks.forEach(link => link.addEventListener('click', closeMobileMenu));

    /* -----------------------------------------------
       6. SCROLL REVEAL
    ----------------------------------------------- */
    const reveals = document.querySelectorAll('.scroll-reveal');
    const checkReveal = () => {
        reveals.forEach(el => { if (el.getBoundingClientRect().top < window.innerHeight - 80) el.classList.add('visible'); });
    };
    window.addEventListener('scroll', checkReveal);
    checkReveal();

    /* -----------------------------------------------
       7. SCHEDULE — INACTIVE DAYS
    ----------------------------------------------- */
    async function loadInactiveDays() {
        try {
            const { data } = await supabase.from('inactive_days').select('*');
            inactiveDays.weekdays = new Set();
            inactiveDays.specific = new Set();
            (data || []).forEach(row => {
                if (row.type === 'weekday') inactiveDays.weekdays.add(row.weekday);
                else if (row.type === 'specific') inactiveDays.specific.add(row.date);
            });
        } catch(e) { /* table may not exist yet */ }
    }

    /* -----------------------------------------------
       8. SCHEDULE — DATE PILLS
    ----------------------------------------------- */
    const dateScrollContainer = document.getElementById('dateScrollContainer');
    const spotsGrid           = document.getElementById('spotsGrid');
    const dailyClassesList    = document.getElementById('dailyClassesList');
    const selectedDateDisplay = document.getElementById('selectedDateDisplay');
    const addAdminClassBtn    = document.getElementById('addAdminClassBtn');
    const addInactiveDayBtn   = document.getElementById('addInactiveDayBtn');
    const adminClassModal     = document.getElementById('adminClassModal');
    const closeAdminClassModal= document.getElementById('closeAdminClassModal');
    const adminClassForm      = document.getElementById('adminClassForm');
    const selectedClassProfile= document.getElementById('selectedClassProfile');
    const scCoachImg          = document.getElementById('scCoachImg');
    const scCoachName         = document.getElementById('scCoachName');
    const scCoachDiscipline   = document.getElementById('scCoachDiscipline');
    const scCoachNote         = document.getElementById('scCoachNote');

    await loadInactiveDays();

    function buildDatePills() {
        if (!dateScrollContainer) return;
        dateScrollContainer.innerHTML = '';
        const today = new Date();

        for (let i = 0; i < 31; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const thisISO  = getISOFromDate(d);
            const dayName  = i === 0 ? 'Hoy' : DAYS_ES[d.getDay()];
            const dateNum  = d.getDate();
            const inactive = inactiveDays.weekdays.has(d.getDay()) || inactiveDays.specific.has(thisISO);

            const pill = document.createElement('div');
            pill.className = `date-pill ${i === 0 ? 'active' : ''} ${inactive ? 'inactive' : ''}`;
            pill.dataset.iso = thisISO;
            pill.innerHTML = `
                <span class="day">${dayName}</span>
                <span class="date">${dateNum}</span>
                ${inactive ? '<span class="inactive-icon"><i class="fa-solid fa-moon"></i></span>' : ''}
            `;

            if (!inactive) {
                pill.addEventListener('click', () => {
                    document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
                    pill.classList.add('active');
                    selectedDateISO = thisISO;
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
    }
    buildDatePills();

    /* -----------------------------------------------
       9. ADMIN INACTIVE DAY MODAL
    ----------------------------------------------- */
    const inactiveDayModal = document.getElementById('inactiveDayModal');
    const closeInactiveModal = document.getElementById('closeInactiveDayModal');
    const inactiveDayForm = document.getElementById('inactiveDayForm');

    if (addInactiveDayBtn) {
        addInactiveDayBtn.addEventListener('click', () => {
            if (inactiveDayModal) inactiveDayModal.classList.add('active');
        });
    }
    if (closeInactiveModal) {
        closeInactiveModal.addEventListener('click', () => {
            inactiveDayModal.classList.remove('active');
            inactiveDayForm?.reset();
        });
    }
    if (inactiveDayModal) {
        inactiveDayModal.addEventListener('click', (e) => { if (e.target === inactiveDayModal) { inactiveDayModal.classList.remove('active'); inactiveDayForm?.reset(); } });
    }

    if (inactiveDayForm) {
        inactiveDayForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const type    = document.getElementById('inactiveType').value;
            const weekday = parseInt(document.getElementById('inactiveWeekday').value);
            const date    = document.getElementById('inactiveDate').value;

            const record = type === 'weekday' ? { type, weekday } : { type: 'specific', date };

            const { error } = await supabase.from('inactive_days').insert([record]);
            if (error) {
                showToast(`Error: ${error.message}. Asegúrate de crear la tabla en Supabase.`, 'error');
            } else {
                await loadInactiveDays();
                buildDatePills();
                inactiveDayModal.classList.remove('active');
                inactiveDayForm.reset();
                showToast('✓ Día marcado como inactivo');
            }
        });
    }

    // Toggle weekday/date input in inactive form
    const inactiveTypeSelect = document.getElementById('inactiveType');
    const weekdayGroup = document.getElementById('weekdayGroup');
    const specificGroup = document.getElementById('specificGroup');
    if (inactiveTypeSelect) {
        inactiveTypeSelect.addEventListener('change', () => {
            const isWeekday = inactiveTypeSelect.value === 'weekday';
            if (weekdayGroup) weekdayGroup.style.display = isWeekday ? 'block' : 'none';
            if (specificGroup) specificGroup.style.display = isWeekday ? 'none' : 'block';
        });
    }

    /* -----------------------------------------------
       10. ADMIN CLASS MODAL — with preview
    ----------------------------------------------- */
    const recurrencePreview = document.getElementById('recurrencePreview');
    const recurrenceFreqEl  = document.getElementById('adminRecurrenceFreq');
    const recurrenceCountEl = document.getElementById('adminRecurrenceCount');

    function updateRecurrencePreview() {
        if (!recurrencePreview) return;
        const freq  = recurrenceFreqEl?.value || 'none';
        const count = parseInt(recurrenceCountEl?.value) || 1;
        if (freq === 'none' || count < 2) {
            recurrencePreview.innerHTML = '';
            return;
        }
        const baseDate = new Date(selectedDateISO + 'T12:00:00');
        const dates = [selectedDateISO];
        for (let i = 1; i < count; i++) {
            const d = new Date(baseDate);
            if (freq === 'daily')  d.setDate(baseDate.getDate() + i);
            if (freq === 'weekly') d.setDate(baseDate.getDate() + i * 7);
            dates.push(getISOFromDate(d));
        }
        const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
        const formatted = dates.map(iso => {
            const d = new Date(iso + 'T12:00:00');
            return `<span class="preview-date-tag">${DAYS_ES[d.getDay()]} ${d.getDate()} ${monthNames[d.getMonth()]}</span>`;
        }).join('');
        recurrencePreview.innerHTML = `
            <p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:8px;">
                <i class="fa-solid fa-calendar-check" style="color:var(--accent-gold);"></i>
                Se crearán <strong style="color:var(--accent-gold);">${dates.length} clases</strong> en:
            </p>
            <div class="preview-dates-list">${formatted}</div>`;
    }

    if (recurrenceFreqEl)  recurrenceFreqEl.addEventListener('change', updateRecurrencePreview);
    if (recurrenceCountEl) recurrenceCountEl.addEventListener('input', updateRecurrencePreview);

    if (addAdminClassBtn) {
        addAdminClassBtn.addEventListener('click', () => {
            if (adminClassModal) {
                updateRecurrencePreview();
                adminClassModal.classList.add('active');
            }
        });
    }

    if (closeAdminClassModal) {
        closeAdminClassModal.addEventListener('click', () => {
            adminClassModal.classList.remove('active');
            adminClassForm.reset();
            if (recurrencePreview) recurrencePreview.innerHTML = '';
        });
    }
    if (adminClassModal) {
        adminClassModal.addEventListener('click', (e) => {
            if (e.target === adminClassModal) {
                adminClassModal.classList.remove('active');
                adminClassForm?.reset();
                if (recurrencePreview) recurrencePreview.innerHTML = '';
            }
        });
    }

    if (adminClassForm) {
        adminClassForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const discipline     = document.getElementById('adminDiscipline').value;
            const coachName      = document.getElementById('adminCoachName').value;
            const coachImg       = document.getElementById('adminCoachImg').value;
            const note           = document.getElementById('adminClassNote').value;
            const recurrenceFreq = recurrenceFreqEl?.value || 'none';
            const recurrenceCount= parseInt(recurrenceCountEl?.value) || 1;

            const saveBtn = document.getElementById('saveClassBtn');
            const originalBtnText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';

            const baseDate  = new Date(selectedDateISO + 'T12:00:00');
            const baseClass = {
                date: selectedDateISO, discipline, coach_name: coachName,
                coach_img: coachImg, note, capacity: DISCIPLINE_CAPACITY[discipline], occupied_spots: []
            };
            const classesToInsert = [baseClass];

            if (recurrenceFreq !== 'none' && recurrenceCount > 1) {
                for (let i = 1; i < recurrenceCount; i++) {
                    const d = new Date(baseDate);
                    if (recurrenceFreq === 'daily')  d.setDate(baseDate.getDate() + i);
                    if (recurrenceFreq === 'weekly') d.setDate(baseDate.getDate() + i * 7);
                    classesToInsert.push({ ...baseClass, date: getISOFromDate(d) });
                }
            }

            const { error } = await supabase.from('classes').insert(classesToInsert);
            if (error) {
                showToast(`Error: ${error.message}`, 'error');
            } else {
                adminClassModal.classList.remove('active');
                adminClassForm.reset();
                if (recurrencePreview) recurrencePreview.innerHTML = '';
                renderDailyClasses();
                showToast(`✓ ${classesToInsert.length} clase${classesToInsert.length > 1 ? 's' : ''} programada${classesToInsert.length > 1 ? 's' : ''}`);
            }
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnText;
        });
    }

    /* -----------------------------------------------
       11. RENDER DAILY CLASSES
    ----------------------------------------------- */
    async function renderDailyClasses() {
        if (!dailyClassesList) return;
        const d = new Date(selectedDateISO + 'T12:00:00');
        const isInactive = inactiveDays.weekdays.has(d.getDay()) || inactiveDays.specific.has(selectedDateISO);

        if (isInactive) {
            dailyClassesList.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-style:italic;"><i class="fa-solid fa-moon" style="color:var(--accent-gold);margin-right:8px;"></i>Este día está marcado como inactivo.</p>`;
            if (selectedClassProfile) selectedClassProfile.style.display = 'none';
            if (spotsGrid) spotsGrid.innerHTML = '';
            return;
        }

        dailyClassesList.innerHTML = '<p style="text-align:center;color:var(--accent-gold);"><i class="fa-solid fa-spinner fa-spin"></i> Cargando clases...</p>';
        if (selectedClassProfile) selectedClassProfile.style.display = 'none';
        if (spotsGrid) spotsGrid.innerHTML = '';

        const { data: dayClasses, error } = await supabase
            .from('classes').select('*').eq('date', selectedDateISO).order('created_at', { ascending: true });

        if (error) { dailyClassesList.innerHTML = `<p style="color:#ff5555;">Error: ${error.message}</p>`; return; }

        dailyClassesList.innerHTML = '';
        if (!dayClasses || dayClasses.length === 0) {
            dailyClassesList.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-style:italic;">No hay clases programadas para este día.</p>`;
            return;
        }

        dayClasses.forEach(cls => {
            const occupied  = cls.occupied_spots || [];
            const freeCount = cls.capacity - occupied.length;
            const card = document.createElement('div');
            card.className = 'daily-class-card';
            card.innerHTML = `
                <div class="daily-class-info">
                    <h4>${cls.discipline}</h4>
                    <p><i class="fa-solid fa-user"></i> Coach ${cls.coach_name}</p>
                </div>
                <div class="daily-class-meta">
                    <span class="spots-badge">${freeCount} lugares libres</span>
                    <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);font-size:0.8rem;"></i>
                </div>`;
            card.addEventListener('click', () => {
                document.querySelectorAll('.daily-class-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                showClassDetails(cls);
            });
            dailyClassesList.appendChild(card);
        });
    }

    function showClassDetails(cls) {
        selectedClassConfig = cls;
        if (scCoachImg)       scCoachImg.src = cls.coach_img;
        if (scCoachName)      scCoachName.textContent = `Coach ${cls.coach_name}`;
        if (scCoachDiscipline)scCoachDiscipline.textContent = `${cls.discipline} · ${cls.capacity} Lugares`;
        if (scCoachNote)      scCoachNote.textContent = cls.note ? `"${cls.note}"` : '';
        if (selectedClassProfile) selectedClassProfile.style.display = 'block';
        renderSpotsGrid(cls);
    }

    /* -----------------------------------------------
       12. SPOTS GRID — with reservation modal
    ----------------------------------------------- */
    const reserveModal     = document.getElementById('reserveModal');
    const closeReserveModal= document.getElementById('closeReserveModal');
    let pendingSpot = null;
    let pendingCls  = null;

    if (closeReserveModal) {
        closeReserveModal.addEventListener('click', () => { reserveModal?.classList.remove('active'); });
    }
    if (reserveModal) {
        reserveModal.addEventListener('click', (e) => { if (e.target === reserveModal) reserveModal.classList.remove('active'); });
    }

    const confirmReserveBtn = document.getElementById('confirmReserveBtn');
    if (confirmReserveBtn) {
        confirmReserveBtn.addEventListener('click', async () => {
            if (!pendingCls || !pendingSpot || !currentUser) return;

            const displaySelect = document.getElementById('reserveDisplayName');
            const selected      = displaySelect?.value || 'anon';
            const meta          = currentUser.user_metadata || {};
            let displayName;
            if (selected === 'name')     displayName = meta.full_name || currentUser.email.split('@')[0];
            else if (selected === 'nick')displayName = meta.nickname  || currentUser.email.split('@')[0];
            else                         displayName = 'Anónimo';

            confirmReserveBtn.disabled = true;
            confirmReserveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            // occupied_spots stores objects: { spot, userId, displayName }
            const currentOccupied = (pendingCls.occupied_spots || []);
            // Migrate legacy int format
            const normalized = currentOccupied.map(s => typeof s === 'number' ? { spot: s, userId: null, displayName: 'Miembro' } : s);

            // Check user doesn't already have a spot in this class
            const alreadyBooked = normalized.some(s => s.userId === currentUser.id);
            if (alreadyBooked) {
                showToast('Ya tienes un lugar reservado en esta clase.', 'error');
                reserveModal.classList.remove('active');
                confirmReserveBtn.disabled = false;
                confirmReserveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Reserva';
                return;
            }

            const newEntry   = { spot: pendingSpot, userId: currentUser.id, displayName };
            const newOccupied = [...normalized, newEntry];

            const { data, error } = await supabase
                .from('classes')
                .update({ occupied_spots: newOccupied })
                .eq('id', pendingCls.id)
                .select();

            if (error) {
                showToast(`Error en la reserva: ${error.message}`, 'error');
                renderSpotsGrid(pendingCls);
            } else {
                showToast(`✓ ¡Lugar ${pendingSpot} reservado como "${displayName}"!`);
                const updatedCls = data[0];
                renderSpotsGrid(updatedCls);
                renderDailyClasses();
            }

            reserveModal.classList.remove('active');
            confirmReserveBtn.disabled = false;
            confirmReserveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Reserva';
            pendingSpot = null;
            pendingCls  = null;
        });
    }

    const renderSpotsGrid = (cls) => {
        if (!spotsGrid || !cls) return;
        spotsGrid.innerHTML = '';
        const totalCapacity = cls.capacity;
        const occupied = cls.occupied_spots || [];
        // Normalize legacy int format
        const normalized = occupied.map(s => typeof s === 'number' ? { spot: s, userId: null, displayName: 'Miembro' } : s);
        const occupiedSpotNums = new Set(normalized.map(s => s.spot));

        for (let i = 1; i <= totalCapacity; i++) {
            const spotDiv = document.createElement('div');
            spotDiv.className = 'spot';
            const entry = normalized.find(s => s.spot === i);

            if (occupiedSpotNums.has(i)) {
                const isMine = entry?.userId === currentUser?.id;
                spotDiv.classList.add(isMine ? 'mine' : 'member');
                spotDiv.innerHTML = `
                    <div class="spot-num">${i}</div>
                    <i class="fa-solid fa-user icon"></i>
                    <div class="status">${entry?.displayName || 'Miembro'}</div>
                    ${isMine ? '<div class="mine-tag">Tú</div>' : ''}`;
            } else {
                spotDiv.classList.add('free');
                spotDiv.innerHTML = `<div class="spot-num">${i}</div><div class="status">Reservar</div>`;
                spotDiv.addEventListener('click', () => {
                    if (!currentUser) { openModal(); return; }
                    pendingSpot = i;
                    pendingCls  = cls;
                    const meta  = currentUser.user_metadata || {};
                    // Populate display name options
                    const sel = document.getElementById('reserveDisplayName');
                    if (sel) {
                        sel.innerHTML = `
                            <option value="anon">Anónimo</option>
                            <option value="nick">${meta.nickname ? `Apodo: ${meta.nickname}` : 'Apodo (no definido)'}</option>
                            <option value="name">Nombre: ${meta.full_name || currentUser.email.split('@')[0]}</option>
                        `;
                    }
                    const spotLabel = document.getElementById('reserveSpotLabel');
                    if (spotLabel) spotLabel.textContent = `Lugar #${i}`;
                    const classLabel = document.getElementById('reserveClassLabel');
                    if (classLabel) classLabel.textContent = `${cls.discipline} · Coach ${cls.coach_name}`;
                    if (reserveModal) reserveModal.classList.add('active');
                });
            }

            spotDiv.style.animationDelay = `${i * 0.04}s`;
            spotDiv.classList.add('fade-in-up');
            spotsGrid.appendChild(spotDiv);
        }
    };

    renderDailyClasses();

    /* -----------------------------------------------
       13. SMOOTH SCROLL
    ----------------------------------------------- */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) { e.preventDefault(); target.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
        });
    });

    /* -----------------------------------------------
       14. DISCIPLINE CARD PARALLAX
    ----------------------------------------------- */
    document.querySelectorAll('.disc-card').forEach(card => {
        const img = card.querySelector('.disc-card-img');
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const xPct = (e.clientX - rect.left) / rect.width - 0.5;
            const yPct = (e.clientY - rect.top)  / rect.height - 0.5;
            if (img) img.style.transform = `scale(1.04) translate(${xPct * -12}px, ${yPct * -8}px)`;
        });
        card.addEventListener('mouseleave', () => { if (img) img.style.transform = 'scale(1.0)'; });
    });

    /* -----------------------------------------------
       15. PRICING TABS
    ----------------------------------------------- */
    const pricingTabs   = document.querySelectorAll('.btn-pricing-tab');
    const pricingPanels = document.querySelectorAll('.pricing-panel');
    pricingTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            pricingTabs.forEach(t => t.classList.remove('active'));
            pricingPanels.forEach(p => p.classList.remove('active'));
            tab.classList.add('active');
            const panel = document.getElementById(`panel-${tab.dataset.tab}`);
            if (panel) panel.classList.add('active');
        });
    });

});
