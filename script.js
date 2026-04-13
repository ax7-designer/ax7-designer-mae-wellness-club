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
// Get initial date in Chetumal (UTC-5)
const getChetumalDate = () => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (3600000 * -5));
};
let selectedDateISO = getChetumalDate().toISOString().split('T')[0];
let selectedClassConfig = null;
let inactiveDays = { weekdays: new Set(), specific: new Set() };
let isSignupMode = false;

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

/** 
 * Compresses an image file locally to save bandwidth
 */
async function compressImage(file, maxWidth = 300) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const scale  = maxWidth / img.width;
                if (scale < 1) {
                    canvas.width = maxWidth;
                    canvas.height = img.height * scale;
                } else {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                canvas.toBlob((blob) => {
                    resolve(new File([blob], file.name, { type: 'image/jpeg' }));
                }, 'image/jpeg', 0.85);
            };
        };
    });
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
    const mobileMenu         = document.getElementById('mobileMenu');
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

    /* -----------------------------------------------
       0. ATTACH LISTENERS IMMEDIATELY
    ----------------------------------------------- */
    // Attaching listeners early ensures UI is interactive even if data fetch is slow
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            if (currentUser) openProfileModal(currentUser);
            else openModal();
        });
    }

    if (btnGoogle) {
        btnGoogle.addEventListener('click', async () => {
            const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
            if (error) showToast(`Error Google: ${error.message}`, 'error');
        });
    }

    if (btnFacebook) {
        btnFacebook.addEventListener('click', async () => {
            const { error } = await supabase.auth.signInWithOAuth({ provider: 'facebook' });
            if (error) showToast(`Error Facebook: ${error.message}`, 'error');
        });
    }

    if (closeModal) closeModal.addEventListener('click', closeModalFunc);
    if (loginModal) loginModal.addEventListener('click', (e) => { if (e.target === loginModal) closeModalFunc(); });
    
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openMobileMenu);
    
    const mobileClose = document.getElementById('mobileMenuClose');
    if (mobileClose) mobileClose.addEventListener('click', closeMobileMenu);
    
    if (mobileMenu) {
        mobileMenu.addEventListener('click', (e) => { 
            const panel = mobileMenu.querySelector('.mobile-menu-panel'); 
            if (panel && !panel.contains(e.target)) closeMobileMenu(); 
        });
    }

    const mobileLinks = document.querySelectorAll('.mobile-nav-link');
    mobileLinks.forEach(link => link.addEventListener('click', closeMobileMenu));

    document.addEventListener('keydown', (e) => { 
        if (e.key === 'Escape') { closeModalFunc(); closeProfileModalFunc(); } 
    });

    /* -----------------------------------------------
       1. SCROLL REVEAL (IntersectionObserver)
    ----------------------------------------------- */
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target); // Reveal only once
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.scroll-reveal').forEach(el => revealObserver.observe(el));



    /* -----------------------------------------------
       3. PROFILE MODAL
    ----------------------------------------------- */
/**
 * Ensures the user has a profile record with email_fallback for admin search
 */
async function syncProfile(user) {
    if (!user) return;
    const { data } = await supabase.from('profiles').select('id').eq('id', user.id).single();
    if (!data) {
        await supabase.from('profiles').insert({
            id: user.id,
            email_fallback: user.email,
            nickname: user.user_metadata?.nickname || user.email.split('@')[0],
            avatar: user.user_metadata?.avatar || 'bolt',
            credits: 0
        });
    } else {
        // Ensure email_fallback is set if it was missing
        await supabase.from('profiles').update({ email_fallback: user.email }).eq('id', user.id);
    }
}

    async function openProfileModal(user) {
        if (!profileModal) return;
        
        // Show/hide admin section
        const adminCreditMgmt = document.getElementById('adminCreditMgmt');
        if (adminCreditMgmt) adminCreditMgmt.style.display = isAdmin(user) ? 'block' : 'none';

        // Fetch official profile from table
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
        const nickname = profile?.nickname || user.user_metadata?.nickname || user.email.split('@')[0];
        const avatar   = profile?.avatar   || user.user_metadata?.avatar   || 'bolt';
        
        if (document.getElementById('fullNameInput'))  document.getElementById('fullNameInput').value  = profile?.full_name || '';
        if (document.getElementById('nicknameInput'))  document.getElementById('nicknameInput').value  = nickname;
        if (document.getElementById('birthdayInput'))  document.getElementById('birthdayInput').value  = profile?.birthday  || '';
        if (document.getElementById('phoneInput'))     document.getElementById('phoneInput').value     = profile?.phone     || '';
        if (document.getElementById('emergencyContactInput')) document.getElementById('emergencyContactInput').value = profile?.emergency || '';
        if (document.getElementById('profileCreditsCount'))  document.getElementById('profileCreditsCount').textContent = profile?.credits || '0';
        
        if (profileGreeting) profileGreeting.textContent = `Hola, ${nickname}`;
        selectedAvatar = avatar;
        syncAvatarUI(avatar);

        const adminBadge = document.getElementById('profileAdminBadge');
        if (adminBadge) adminBadge.style.display = isAdmin(user) ? 'flex' : 'none';

        profileModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async () => {
            const nickname = document.getElementById('nicknameInput')?.value.trim() || 'Miembro';
            const fullName = document.getElementById('fullNameInput')?.value.trim() || '';
            const birthday = document.getElementById('birthdayInput')?.value.trim() || '';
            const phone    = document.getElementById('phoneInput')?.value.trim() || '';
            const emergency= document.getElementById('emergencyContactInput')?.value.trim() || '';

            saveProfileBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
            saveProfileBtn.disabled = true;

            // Updated meta in Auth
            await supabase.auth.updateUser({ data: { nickname, avatar: selectedAvatar, full_name: fullName } });
            
            // Upsert into Profiles table
            const { error } = await supabase.from('profiles').upsert({
                id: currentUser.id,
                email_fallback: currentUser.email,
                full_name: fullName,
                nickname: nickname,
                birthday: birthday,
                phone: phone,
                emergency: emergency,
                avatar: selectedAvatar,
                updated_at: new Date()
            });

            if (error) { showToast(`Error al guardar tabla: ${error.message}`, 'error'); }
            else {
                updateAuthUI(currentUser);
                closeProfileModalFunc();
                showToast('✓ Perfil actualizado');
            }
            saveProfileBtn.innerHTML = `<i class="fa-solid fa-check"></i> Guardar Perfil`;
            saveProfileBtn.disabled = false;
        });
    }

    /* --- Admin: Manual Credit Assignment --- */
    const adminAddCreditsBtn = document.getElementById('adminAddCreditsBtn');
    if (adminAddCreditsBtn) {
        adminAddCreditsBtn.addEventListener('click', async () => {
            const email = document.getElementById('adminTargetEmail').value.trim();
            const amount = parseInt(document.getElementById('adminCreditAmount').value);
            if (!email || isNaN(amount)) return showToast('Email y cantidad requeridos', 'error');

            adminAddCreditsBtn.disabled = true;
            
            // 1. Find user ID by email (This is usually blocked by RLS/Security unless we have a specific endpoint or logic)
            // Simplified: We use a RPC or we assume the admin knows the ID? 
            // Better: We match by email in a custom 'usage_ledger' or similar if possible.
            // For now, if we don't have a 'search user' endpoint, let's use the provided email to filter public profiles.
            const { data: targetProfile, error: searchError } = await supabase.from('profiles').select('id, credits').ilike('email_fallback', email).single();
            // Note: I'll need to add email_fallback to the SQL later or use auth metadata search.
            
            // Codeforcing workaround: Update by email directly if the table has it
            const { error } = await supabase.rpc('add_credits_by_email', { target_email: email, amount: amount });
            
            if (error) showToast(`Error: ${error.message}`, 'error');
            else showToast(`✓ Se añadieron ${amount} clases a ${email}`);
            
            adminAddCreditsBtn.disabled = false;
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
    async function updateAuthUI(user) {
        currentUser = user;
        if (!loginBtn) return;
        const addAdminClassBtn = document.getElementById('addAdminClassBtn');
        const addInactiveDayBtn = document.getElementById('addInactiveDayBtn');

        if (user) {
            // Priority: Table profile > Meta > Derived from email
            const { data: profile } = await supabase.from('profiles').select('nickname, avatar').eq('id', user.id).single();
            const nickname  = profile?.nickname || user.user_metadata?.nickname || user.email.split('@')[0];
            const avatar    = profile?.avatar   || user.user_metadata?.avatar   || 'bolt';
            
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
    }



    /* -----------------------------------------------
       3. LOGIN MODAL
    ----------------------------------------------- */
    function openModal() {
        if (loginModal) { loginModal.classList.add('active'); document.body.style.overflow = 'hidden'; }
    }
    function closeModalFunc() {
        if (loginModal) { loginModal.classList.remove('active'); document.body.style.overflow = 'auto'; }
    }
    function closeProfileModalFunc() {
        if (profileModal) { profileModal.classList.remove('active'); document.body.style.overflow = 'auto'; }
    }



    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            updateAuthUI(session.user);
            if (window.location.hash.includes('access_token')) {
                window.history.replaceState(null, null, window.location.pathname + window.location.search);
            }
            if (event === 'SIGNED_IN') {
                showToast(isAdmin(session.user) ? '🛡️ Modo Admin activado' : '¡Bienvenido/a a Team Mae!', 'info');
                syncProfile(session.user);
                closeModalFunc();
            }
            if (event === 'PASSWORD_RECOVERY') {
                const resetModal = document.getElementById('resetPasswordModal');
                if (resetModal) {
                    resetModal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
            }
        } else {
            updateAuthUI(null);
        }
    });

    const resetPasswordForm = document.getElementById('resetPasswordForm');
    if (resetPasswordForm) {
        resetPasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPass = document.getElementById('newPassword').value;
            const confPass = document.getElementById('confirmNewPassword').value;

            if (newPass !== confPass) return showToast('Las contraseñas no coinciden', 'error');

            const submitBtn = resetPasswordForm.querySelector('button');
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Actualizando...';

            const { error } = await supabase.auth.updateUser({ password: newPass });
            if (error) {
                showToast(`Error: ${error.message}`, 'error');
            } else {
                showToast('✓ Contraseña actualizada correctamente');
                document.getElementById('resetPasswordModal').classList.remove('active');
                document.body.style.overflow = 'auto';
            }
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-lock-open"></i> Actualizar Contraseña';
        });
    }

    if (loginForm) {
        const signupLink = document.getElementById('showSignupLink');
        const forgotLink = document.getElementById('forgotPasswordLink');

        if (signupLink) {
            signupLink.addEventListener('click', (e) => {
                e.preventDefault();
                isSignupMode = !isSignupMode;
                logInBtnMsg.textContent = isSignupMode ? 'Crear Cuenta' : 'Iniciar Sesión';
                signupLink.textContent = isSignupMode ? 'Ya tengo cuenta, ingresar' : 'Regístrate aquí';
            });
        }

        if (forgotLink) {
            forgotLink.addEventListener('click', async (e) => {
                e.preventDefault();
                const email = emailInput.value;
                if (!email) return showToast('Ingresa tu email primero', 'error');
                const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
                if (error) showToast(`Error: ${error.message}`, 'error');
                else showToast('✓ Correo de recuperación enviado', 'info');
            });
        }

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = emailInput.value, password = passInput.value;
            const originalText = logInBtnMsg.innerHTML;
            logInBtnMsg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cargando...`;
            logInBtnMsg.disabled = true;

            if (isSignupMode) {
                const { data, error } = await supabase.auth.signUp({ email, password });
                if (error) showToast(`Error: ${error.message}`, 'error');
                else {
                    if (data.session) { closeModalFunc(); updateAuthUI(data.user); }
                    else showToast('✓ Revisa tu correo de confirmación', 'info');
                }
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) showToast(`Error de acceso: ${error.message}`, 'error');
                else { closeModalFunc(); updateAuthUI(data.user); }
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
        window.addEventListener('scroll', handleNavScroll, { passive: true });
        handleNavScroll();
    }

    /* -----------------------------------------------
       5. MOBILE MENU
    ----------------------------------------------- */
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




    /* -----------------------------------------------
       7. SCHEDULE — INACTIVE DAYS
    ----------------------------------------------- */
    async function loadInactiveDays() {
        try {
            const { data } = await supabase.from('inactive_days').select('*');
            inactiveDays.weekdays = new Set([0]); // Dom por defecto inactivo
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




    function buildDatePills() {
        if (!dateScrollContainer) return;
        dateScrollContainer.innerHTML = '';
        const today = getChetumalDate(); // Use Chetumal time for "Today"

        for (let i = 0; i < 31; i++) {
            const d = new Date(today);
            d.setDate(today.getDate() + i);
            const thisISO  = getISOFromDate(d);
            const dayName  = i === 0 ? 'Hoy' : DAYS_ES[d.getDay()];
            const dateNum  = d.getDate();
            const inactive = inactiveDays.weekdays.has(d.getDay()) || inactiveDays.specific.has(thisISO);

            const pill = document.createElement('div');
            pill.className = `date-pill ${thisISO === selectedDateISO ? 'active' : ''} ${inactive ? 'inactive' : ''}`;
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

    // Initialize date pills if not already done by the init flow
    if (dateScrollContainer && dateScrollContainer.innerHTML === '') {
        buildDatePills();
    }

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
       10. ADMIN CLASS MODAL — with photo upload
    ----------------------------------------------- */
    const recurrencePreview = document.getElementById('recurrencePreview');
    const recurrenceFreqEl  = document.getElementById('adminRecurrenceFreq');
    const recurrenceCountEl = document.getElementById('adminRecurrenceCount');
    const coachFileInput    = document.getElementById('adminCoachFile');
    const coachImgPreview   = document.getElementById('coachImgPreview');

    if (coachFileInput) {
        coachFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            coachImgPreview.style.display = 'block';
            const previewImg = coachImgPreview.querySelector('img');
            previewImg.src = URL.createObjectURL(file);
            previewImg.style.opacity = '0.5';

            try {
                const compressed = await compressImage(file, 200);
                const fileName   = `coach_${Date.now()}.jpg`;
                const { data, error } = await supabase.storage.from('coaches').upload(fileName, compressed);
                
                if (error) throw error;
                
                const { data: { publicUrl } } = supabase.storage.from('coaches').getPublicUrl(fileName);
                document.getElementById('adminCoachImg').value = publicUrl;
                previewImg.src = publicUrl;
                previewImg.style.opacity = '1';
                showToast('✓ Imagen optimizada y lista');
            } catch (err) {
                showToast(`Error al subir imagen: ${err.message}`, 'error');
                previewImg.style.opacity = '1';
            }
        });
    }

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
            const time           = document.getElementById('adminClassTime').value;
            const coachName      = document.getElementById('adminCoachName').value;
            const coachImg       = document.getElementById('adminCoachImg').value;
            const rawNote        = document.getElementById('adminClassNote').value;
            
            // Store time in the note field with a special prefix [T:HH:mm]
            const note = `[T:${time}]${rawNote}`;
            
            const recurrenceFreq = recurrenceFreqEl?.value || 'none';
            const recurrenceCount= parseInt(recurrenceCountEl?.value) || 1;

            if (!coachImg) return showToast('Espera a que suba la imagen...', 'error');

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
                coachImgPreview.style.display = 'none';
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

        const { data: rawClasses, error } = await supabase
            .from('classes').select('*').eq('date', selectedDateISO);

        if (error) { dailyClassesList.innerHTML = `<p style="color:#ff5555;">Error: ${error.message}</p>`; return; }

        if (!rawClasses || rawClasses.length === 0) {
            dailyClassesList.innerHTML = `<p style="text-align:center;color:var(--text-muted);font-style:italic;">No hay clases programadas para este día.</p>`;
            return;
        }

        // 1. Process and Sort classes
        const dayClasses = rawClasses.map(cls => {
            let time = "00:00";
            let displayNote = cls.note || "";
            if (cls.note && cls.note.startsWith("[T:")) {
                const match = cls.note.match(/\[T:(\d{2}:\d{2})\]/);
                if (match) {
                    time = match[1];
                    displayNote = cls.note.replace(match[0], "");
                }
            }
            const [hh, mm] = time.split(':').map(Number);
            const hour12 = hh % 12 || 12;
            const ampm = hh >= 12 ? 'PM' : 'AM';
            const time12 = `${hour12}:${String(mm).padStart(2, '0')} ${ampm}`;
            const isPM = hh >= 12;

            return { ...cls, time, time12, isPM, displayNote, sortVal: hh * 60 + mm };
        }).sort((a, b) => a.sortVal - b.sortVal);

        // 2. Clear loader and Prepare groups
        dailyClassesList.innerHTML = '';
        let currentGroup = null; // 'Matutino' or 'Vespertino'

        dayClasses.forEach(cls => {
            const group = cls.isPM ? 'Vespertino' : 'Matutino';
            
            // Add group header if changed
            if (group !== currentGroup) {
                currentGroup = group;
                const header = document.createElement('div');
                header.className = 'session-group-header';
                header.innerHTML = `<span>${group}</span>`;
                dailyClassesList.appendChild(header);
            }

            const occupied  = cls.occupied_spots || [];
            const freeCount = cls.capacity - occupied.length;
            const card = document.createElement('div');
            card.className = 'daily-class-card';
            card.innerHTML = `
                <div class="daily-class-time-tag">${cls.time12}</div>
                <div class="daily-class-info">
                    <h4>${cls.discipline}</h4>
                    <p class="coach-name-item" style="display: none;"><i class="fa-solid fa-user"></i> Coach ${cls.coach_name}</p>
                </div>
                <div class="daily-class-meta">
                    <span class="spots-badge">${freeCount} lugares libres</span>
                    ${isAdmin(currentUser) ? '<button class="delete-class-btn" style="background:none; border:none; color:#e63946; cursor:pointer; padding:5px; margin-left:10px;"><i class="fa-solid fa-trash-can"></i></button>' : ''}
                    <i class="fa-solid fa-chevron-right" style="color:var(--text-muted);font-size:0.8rem; margin-left:10px;"></i>
                </div>`;
            
            const delBtn = card.querySelector('.delete-class-btn');
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`¿Estás seguro de eliminar la clase de ${cls.discipline}?`)) {
                        const { error } = await supabase.from('classes').delete().eq('id', cls.id);
                        if (error) showToast(`Error al eliminar: ${error.message}`, 'error');
                        else { showToast('✓ Clase eliminada'); renderDailyClasses(); }
                    }
                });
            }

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
        if (scCoachName)      scCoachName.textContent = ""; // Oculto por ahora
        if (scCoachDiscipline)scCoachDiscipline.textContent = `${cls.discipline} · ${cls.capacity} Lugares`;
        if (scCoachNote)      scCoachNote.textContent = cls.displayNote ? `"${cls.displayNote}"` : '';
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

            // 0. CHECK CREDITS (Option A)
            const { data: profile } = await supabase.from('profiles').select('credits').eq('id', currentUser.id).single();
            if (!profile || profile.credits <= 0) {
                showToast('No tienes clases disponibles. Por favor adquiere un plan.', 'error');
                reserveModal.classList.remove('active');
                confirmReserveBtn.disabled = false;
                confirmReserveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Reserva';
                return;
            }

            // 1. UPDATE CLASS SPOTS (Legacy logic but with credit check)
            const currentOccupied = (pendingCls.occupied_spots || []);
            const normalized = currentOccupied.map(s => typeof s === 'number' ? { spot: s, userId: null, displayName: 'Miembro' } : s);
            
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

            const { data, error } = await supabase.from('classes').update({ occupied_spots: newOccupied }).eq('id', pendingCls.id).select();

            if (error) {
                showToast(`Error: ${error.message}`, 'error');
            } else {
                // 2. DEDUCT CREDIT
                await supabase.from('profiles').update({ credits: profile.credits - 1 }).eq('id', currentUser.id);
                showToast(`✓ ¡Reserva lista! Slot #${pendingSpot}`);
                renderSpotsGrid(data[0]);
                renderDailyClasses();
            }

            reserveModal.classList.remove('active');
            confirmReserveBtn.disabled = false;
            confirmReserveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Reserva';
            pendingSpot = null; pendingCls  = null;
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
                    if (classLabel) classLabel.textContent = `${cls.discipline}`;
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

    /* -----------------------------------------------
       16. FINAL INITIALIZATION
    ----------------------------------------------- */
    // 1. Render initial UI states immediately (show loaders)
    buildDatePills();
    renderDailyClasses();

    // 2. Fetch data in parallel
    (async () => {
        try {
            const results = await Promise.allSettled([
                supabase.auth.getSession(),
                loadInactiveDays()
            ]);

            const sessionResult = results[0];
            if (sessionResult.status === 'fulfilled') {
                const { data: { session }, error } = sessionResult.value;
                if (!error) updateAuthUI(session?.user || null);
            }

            // 3. Re-render UI now that we have all data (active/inactive days)
            buildDatePills();
            renderDailyClasses();
        } catch (err) {
            console.error("Initialization error:", err);
            showToast("Error al sincronizar datos. Intenta recargar.", "error");
        }
    })();

});
