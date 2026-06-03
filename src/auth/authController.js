import { supabase } from '../shared/supabaseClient.js';
import { isAdmin } from './admin.js';
import { showToast, getISOFromDate, getChetumalDate } from '../shared/uiHelpers.js';

export const AVATAR_ICON_MAP = {
    bolt: 'fa-bolt',
    fire: 'fa-fire',
    dumbbell: 'fa-dumbbell',
    mountain: 'fa-mountain-sun',
    leaf: 'fa-leaf',
    tornado: 'fa-tornado',
    star: 'fa-star',
    dragon: 'fa-dragon',
    crown: 'fa-crown',
    infinity: 'fa-infinity',
    skull: 'fa-skull',
    gem: 'fa-gem',
};

/**
 * Initializes authentication controller logic.
 * Binds DOM listeners, handles session changes, and profile management.
 */
export function initAuthController(state, controllers) {
    const loginBtn = document.getElementById('loginBtn');
    const loginModal = document.getElementById('loginModal');
    const closeModal = document.getElementById('closeModal');
    const loginForm = document.getElementById('loginForm');
    const emailInput = document.getElementById('email');
    const passInput = document.getElementById('password');
    const logInBtnMsg = document.querySelector('.log-in-btn');
    const profileModal = document.getElementById('profileModal');
    const closeProfileModal = document.getElementById('closeProfileModal');
    const profileGreeting = document.getElementById('profileGreeting');
    const profileAvatarDisp = document.getElementById('profileAvatarDisplay');
    const saveProfileBtn = document.getElementById('saveProfileBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const avatarOptions = document.querySelectorAll('.avatar-option');
    const btnGoogle = document.getElementById('btnGoogle');
    const btnFacebook = document.getElementById('btnFacebook');

    /* ----------------------- Helper Dialogs ----------------------- */
    function openModal() {
        if (loginModal) {
            loginModal.classList.add('active');
            document.body.style.overflow = 'hidden';
        }
    }

    function closeModalFunc() {
        if (loginModal) {
            loginModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
        // Revert modal UI if modified by purchase intent
        const loginHeader = document.getElementById('loginModalHeader');
        const waHelp = document.getElementById('loginWhatsAppHelp');
        if (loginHeader && window.originalLoginHTML) {
            loginHeader.innerHTML = window.originalLoginHTML;
        }
        if (waHelp) waHelp.style.display = 'none';
        window.pendingStripeUrl = null;
    }

    function closeProfileModalFunc() {
        if (profileModal) {
            profileModal.classList.remove('active');
            document.body.style.overflow = 'auto';
        }
    }

    async function syncProfile(user) {
        if (!user) return;
        const { data } = await supabase.from('profiles').select('id').eq('id', user.id).single();
        if (!data) {
            await supabase.from('profiles').insert({
                id: user.id,
                email_fallback: user.email,
                nickname: user.user_metadata?.nickname || user.email.split('@')[0],
                avatar: user.user_metadata?.avatar || 'bolt',
                preferred_discipline: user.user_metadata?.preferred_discipline || 'all',
                credits: 0
            });
        } else {
            await supabase.from('profiles').update({ email_fallback: user.email }).eq('id', user.id);
        }
    }

    async function openProfileModal(user) {
        if (!profileModal) return;

        // Show/hide admin section
        const adminCreditMgmt = document.getElementById('adminCreditMgmt');
        const adminFailedPayments = document.getElementById('adminFailedPayments');
        const adminIsVisible = isAdmin(user);
        if (adminCreditMgmt) adminCreditMgmt.style.display = adminIsVisible ? 'block' : 'none';
        if (adminFailedPayments) adminFailedPayments.style.display = adminIsVisible ? 'block' : 'none';

        if (adminIsVisible && controllers.adminController) {
            controllers.adminController.loadFailedPayments();
        }

        // Fetch official profile from table
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();

        if (document.getElementById('fullNameInput')) document.getElementById('fullNameInput').value = profile?.full_name || '';
        if (document.getElementById('birthdayInput')) document.getElementById('birthdayInput').value = profile?.birthday || '';
        if (document.getElementById('interestInput')) document.getElementById('interestInput').value = profile?.preferred_discipline || 'all';

        // Show per-discipline credit breakdown
        const box = document.getElementById('profileBalanceBox');
        if (box) {
            const indoor = profile?.credits_indoor ?? 0;
            const train = profile?.credits_train ?? 0;
            const pilates = profile?.credits_pilates ?? 0;
            const open = profile?.credits_open ?? 0;
            const total = indoor + train + pilates + open;

            const hasCategories = indoor > 0 || train > 0 || pilates > 0;
            if (hasCategories || open > 0) {
                box.innerHTML = `
                    <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">Clases Disponibles</span>
                    <div id="profileCreditsCount" style="font-size: 2.5rem; font-weight: 800; color: #2a9d8f;">${total}</div>
                    ${hasCategories ? `
                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px; margin-top:12px; font-size:0.78rem;">
                        <div style="background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.2);border-radius:8px;padding:8px 10px;text-align:center;">
                            <i class="fa-solid fa-bicycle" style="color:var(--accent-gold);"></i>
                            <div style="font-size:1.1rem;font-weight:700;color:#fff;margin-top:2px;">${indoor}</div>
                            <div style="color:var(--text-muted);font-size:0.7rem;">Indoor Cycling</div>
                        </div>
                        <div style="background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.2);border-radius:8px;padding:8px 10px;text-align:center;">
                            <i class="fa-solid fa-dumbbell" style="color:var(--accent-gold);"></i>
                            <div style="font-size:1.1rem;font-weight:700;color:#fff;margin-top:2px;">${train}</div>
                            <div style="color:var(--text-muted);font-size:0.7rem;">Train</div>
                        </div>
                        <div style="background:rgba(201,169,110,0.08);border:1px solid rgba(201,169,110,0.2);border-radius:8px;padding:8px 10px;text-align:center;">
                            <i class="fa-solid fa-child-reaching" style="color:var(--accent-gold);"></i>
                            <div style="font-size:1.1rem;font-weight:700;color:#fff;margin-top:2px;">${pilates}</div>
                            <div style="color:var(--text-muted);font-size:0.7rem;">Pilates</div>
                        </div>
                        <div style="background:rgba(42,157,143,0.08);border:1px solid rgba(42,157,143,0.25);border-radius:8px;padding:8px 10px;text-align:center;">
                            <i class="fa-solid fa-crown" style="color:#2a9d8f;"></i>
                            <div style="font-size:1.1rem;font-weight:700;color:#2a9d8f;margin-top:2px;">${open}</div>
                            <div style="color:var(--text-muted);font-size:0.7rem;">VIP (Comodín)</div>
                        </div>
                    </div>` : ''}
                `;
            } else {
                box.innerHTML = `
                    <span style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">Clases Disponibles</span>
                    <div id="profileCreditsCount" style="font-size: 2.5rem; font-weight: 800; color: #2a9d8f;">0</div>
                `;
            }
        }

        if (profileGreeting) profileGreeting.textContent = `Hola, ${user.user_metadata?.full_name || user.email}`;

        const adminBadge = document.getElementById('profileAdminBadge');
        if (adminBadge) adminBadge.style.display = isAdmin(user) ? 'flex' : 'none';

        // Load current avatar
        state.selectedAvatar = profile?.avatar || user.user_metadata?.avatar || 'bolt';
        avatarOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.avatar === state.selectedAvatar);
        });
        if (profileAvatarDisp) {
            const iconClass = AVATAR_ICON_MAP[state.selectedAvatar] || 'fa-bolt';
            profileAvatarDisp.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
        }

        profileModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        if (controllers.bookingController) {
            controllers.bookingController.renderMyReservations();
        }
    }

    async function updateAuthUI(user) {
        state.currentUser = user;
        if (!loginBtn) return;
        const addAdminClassBtn = document.getElementById('addAdminClassBtn');
        const addInactiveDayBtn = document.getElementById('addInactiveDayBtn');

        if (user) {
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).single();
            if (profile) {
                user.role = profile.role;
            }
            const nickname = profile?.nickname || user.user_metadata?.nickname || user.email.split('@')[0];
            const avatar = profile?.avatar || user.user_metadata?.avatar || 'bolt';

            try {
                localStorage.setItem('mae_cached_user', JSON.stringify({
                    name: nickname,
                    email: user.email,
                    avatar: avatar,
                    isAdmin: isAdmin(user)
                }));
            } catch (e) {
                console.warn("Error caching user session", e);
            }

            if (profile?.preferred_discipline && profile.preferred_discipline !== 'all' && (state.activeDisciplineFilter === 'all' || state.activeDisciplineFilter === undefined)) {
                state.activeDisciplineFilter = profile.preferred_discipline;
                const filterBtns = document.querySelectorAll('.filter-btn');
                filterBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.filter === state.activeDisciplineFilter));
                if (controllers.classController) {
                    controllers.classController.renderDailyClasses();
                }
            }

            const iconClass = AVATAR_ICON_MAP[avatar] || 'fa-bolt';
            const adminTag = isAdmin(user)
                ? `<span class="admin-badge-nav"><i class="fa-solid fa-shield-halved"></i> Admin</span>`
                : '';
            loginBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span class="action-text">Hola, ${nickname}</span>${adminTag}`;

            if (addAdminClassBtn) addAdminClassBtn.style.display = isAdmin(user) ? 'inline-flex' : 'none';
            if (addInactiveDayBtn) addInactiveDayBtn.style.display = isAdmin(user) ? 'inline-flex' : 'none';

            // ATTACH ID TO STRIPE LINKS
            const stripeLinks = document.querySelectorAll('a[href^="https://buy.stripe.com/"]');
            stripeLinks.forEach(link => {
                const url = new URL(link.href);
                url.searchParams.set('client_reference_id', user.id);
                url.searchParams.set('prefilled_email', user.email);
                link.href = url.toString();
            });
        } else {
            try {
                localStorage.removeItem('mae_cached_user');
            } catch (e) {
                console.warn("Error clearing cached user session", e);
            }

            loginBtn.innerHTML = `<i class="fa-regular fa-user"></i> <span class="action-text">Iniciar Sesión</span>`;
            if (addAdminClassBtn) addAdminClassBtn.style.display = 'none';
            if (addInactiveDayBtn) addInactiveDayBtn.style.display = 'none';

            // CLEAN ID FROM STRIPE LINKS
            const stripeLinks = document.querySelectorAll('a[href^="https://buy.stripe.com/"]');
            stripeLinks.forEach(link => {
                const url = new URL(link.href);
                url.searchParams.delete('client_reference_id');
                url.searchParams.delete('prefilled_email');
                link.href = url.toString();
            });
        }
    }

    /* ----------------------- Post-Payment Return Handler ----------------------- */
    async function handlePaymentReturn() {
        const params = new URLSearchParams(window.location.search);
        if (params.get('pago') !== 'exitoso') return;

        const cleanUrl = window.location.pathname;
        window.history.replaceState(null, null, cleanUrl);

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        showToast('💳 ¡Pago recibido! Asignando tu(s) clase(s)...', 'info');

        const { data: baseline } = await supabase
            .from('profiles')
            .select('credits_indoor, credits_train, credits_pilates, credits_open')
            .eq('id', session.user.id)
            .single();

        const baseTotal = baseline
            ? (baseline.credits_indoor + baseline.credits_train + baseline.credits_pilates + baseline.credits_open)
            : 0;

        let attempts = 0;
        const maxAttempts = 10;

        const poll = setInterval(async () => {
            attempts++;
            const { data: current } = await supabase
                .from('profiles')
                .select('credits_indoor, credits_train, credits_pilates, credits_open')
                .eq('id', session.user.id)
                .single();

            if (!current) {
                if (attempts >= maxAttempts) clearInterval(poll);
                return;
            }

            const currentTotal = current.credits_indoor + current.credits_train + current.credits_pilates + current.credits_open;

            if (currentTotal > baseTotal) {
                clearInterval(poll);
                const gained = currentTotal - baseTotal;
                showToast(`✅ ¡Listo! Se añadieron ${gained} clase(s) a tu cuenta.`, 'success');
                const box = document.getElementById('profileCreditsCount');
                if (box) box.textContent = currentTotal;
                return;
            }

            if (attempts >= maxAttempts) {
                clearInterval(poll);
                const existingBanner = document.getElementById('paymentAlertBanner');
                if (existingBanner) return;

                const banner = document.createElement('div');
                banner.id = 'paymentAlertBanner';
                banner.innerHTML = `
                    <div style="
                        position: fixed; bottom: 0; left: 0; right: 0; z-index: 99998;
                        background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
                        border-top: 2px solid var(--accent-gold);
                        padding: 16px 24px;
                        display: flex; align-items: center; justify-content: space-between;
                        flex-wrap: wrap; gap: 12px;
                        box-shadow: 0 -8px 30px rgba(0,0,0,0.5);
                        font-family: inherit;
                    ">
                        <div style="display:flex; align-items:center; gap:12px;">
                            <i class="fa-solid fa-triangle-exclamation" style="color:var(--accent-gold); font-size:1.4rem;"></i>
                            <div>
                                <div style="color:#fff; font-weight:700; font-size:0.95rem;">Tu pago fue exitoso, pero tus clases aún no aparecen</div>
                                <div style="color:var(--text-muted); font-size:0.82rem; margin-top:2px;">Nuestro equipo lo revisará. Escríbenos por WhatsApp y lo resolvemos al instante.</div>
                            </div>
                        </div>
                        <div style="display:flex; gap:10px; align-items:center;">
                            <a href="https://wa.me/529984910522?text=Hola%2C%20pagu%C3%A9%20una%20clase%20pero%20no%20me%20aparece%20en%20mi%20cuenta" 
                               target="_blank" rel="noopener"
                               style="
                                   background: #25D366; color: #fff; text-decoration:none;
                                   padding: 10px 18px; border-radius: 25px;
                                   font-weight: 700; font-size: 0.85rem;
                                   display:flex; align-items:center; gap:7px;
                                   white-space: nowrap;
                               ">
                                <i class="fa-brands fa-whatsapp"></i> Escribir por WhatsApp
                            </a>
                            <button id="closePaymentAlertBtn" style="
                                background: transparent; border: 1px solid rgba(255,255,255,0.2);
                                color: var(--text-muted); padding: 9px 14px; border-radius: 20px;
                                cursor: pointer; font-size: 0.82rem; font-family: inherit;
                            ">Cerrar</button>
                        </div>
                    </div>
                `;
                document.body.appendChild(banner);
                document.getElementById('closePaymentAlertBtn').onclick = () => banner.remove();
            }
        }, 3000);
    }

    /* ----------------------- Event Binding ----------------------- */
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('#loginBtn');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            if (state.currentUser) {
                console.log("Opening profile for", state.currentUser.email);
                openProfileModal(state.currentUser);
            } else {
                openModal();
            }
        }

        // --- STRIPE LINK INTERCEPTOR FOR GUESTS ---
        const buyLink = e.target.closest('a[href^="https://buy.stripe.com"]');
        if (buyLink && !state.currentUser) {
            e.preventDefault();
            e.stopPropagation();
            window.pendingStripeUrl = buyLink.href;

            const loginHeader = document.getElementById('loginModalHeader');
            const waHelp = document.getElementById('loginWhatsAppHelp');
            if (loginHeader) {
                if (!window.originalLoginHTML) window.originalLoginHTML = loginHeader.innerHTML;
                loginHeader.innerHTML = `
                    <h2 style="color: var(--accent-gold); font-size: 1.8rem; margin-bottom: 10px;">¡Estás a un paso!</h2>
                    <p style="font-size: 0.95rem; line-height: 1.5; color: var(--text-muted); max-width: 380px; margin: 0 auto;">Para comprar tus clases y reservar tu lugar. Necesitamos crear tu perfil,<br>te tomará menos de un minuto.</p>
                `;
            }
            if (waHelp) waHelp.style.display = 'block';

            if (!state.isSignupMode) {
                const signupLink = document.getElementById('showSignupLink');
                if (signupLink) signupLink.click();
            }
            openModal();
        }
    }, { capture: true, passive: false });

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

    if (closeModal) closeModal.addEventListener('click', closeModalFunc);
    if (loginModal) loginModal.addEventListener('click', (e) => { if (e.target === loginModal) closeModalFunc(); });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            closeModalFunc();
            closeProfileModalFunc();
        }
    });

    avatarOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            state.selectedAvatar = opt.dataset.avatar;
            avatarOptions.forEach(el => el.classList.remove('active'));
            opt.classList.add('active');

            if (profileAvatarDisp) {
                const iconClass = AVATAR_ICON_MAP[state.selectedAvatar] || 'fa-bolt';
                profileAvatarDisp.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;
            }
        });
    });

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async () => {
            const fullName = document.getElementById('fullNameInput')?.value.trim() || '';
            const birthday = document.getElementById('birthdayInput')?.value.trim() || '';
            const interest = document.getElementById('interestInput')?.value || 'all';

            saveProfileBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
            saveProfileBtn.disabled = true;

            await supabase.auth.updateUser({
                data: {
                    full_name: fullName,
                    preferred_discipline: interest,
                    avatar: state.selectedAvatar
                }
            });

            const { error } = await supabase.from('profiles').upsert({
                id: state.currentUser.id,
                email_fallback: state.currentUser.email,
                full_name: fullName,
                birthday: birthday,
                avatar: state.selectedAvatar,
                preferred_discipline: interest,
                updated_at: new Date()
            });

            if (error) {
                showToast(`Error al guardar tabla: ${error.message}`, 'error');
            } else {
                updateAuthUI(state.currentUser);
                closeProfileModalFunc();
                showToast('✓ Perfil actualizado');
            }
            saveProfileBtn.innerHTML = `<i class="fa-solid fa-check"></i> Guardar Perfil`;
            saveProfileBtn.disabled = false;
        });
    }

    if (profileModal) {
        profileModal.addEventListener('click', (e) => { if (e.target === profileModal) closeProfileModalFunc(); });
    }
    if (closeProfileModal) {
        closeProfileModal.addEventListener('click', closeProfileModalFunc);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            closeProfileModalFunc();
            await supabase.auth.signOut();
            updateAuthUI(null);
            window.location.reload();
        });
    }

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
                state.isSignupMode = !state.isSignupMode;
                logInBtnMsg.textContent = state.isSignupMode ? 'Crear Cuenta' : 'Iniciar Sesión';
                signupLink.textContent = state.isSignupMode ? 'Ya tengo cuenta, ingresar' : 'Regístrate aquí';
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

            if (state.isSignupMode) {
                const { data, error } = await supabase.auth.signUp({ email, password });
                if (error) showToast(`Error: ${error.message}`, 'error');
                else {
                    if (data.session) {
                        closeModalFunc();
                        updateAuthUI(data.user);
                    } else {
                        showToast('✓ Revisa tu correo de confirmación', 'info');
                    }
                }
            } else {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });
                if (error) showToast(`Error de acceso: ${error.message}`, 'error');
                else {
                    closeModalFunc();
                    updateAuthUI(data.user);
                }
            }
            logInBtnMsg.innerHTML = originalText;
            logInBtnMsg.disabled = false;
        });
    }

    // Run payment return handler on page load
    handlePaymentReturn();

    // Supabase Auth Listener
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED') {
            console.log('Token renovado silenciosamente');
        }
        if (event === 'SIGNED_OUT') {
            state.currentUser = null;
            updateAuthUI(null);
            return;
        }

        if (session) {
            updateAuthUI(session.user);
            if (window.location.hash.includes('access_token')) {
                window.history.replaceState(null, null, window.location.pathname + window.location.search);
            }
            if (event === 'SIGNED_IN') {
                showToast(isAdmin(session.user) ? '🛡️ Modo Admin activado' : '¡Bienvenido/a a Team Mae!', 'info');
                syncProfile(session.user);
                closeModalFunc();
                if (isAdmin(session.user) && controllers.adminController) {
                    controllers.adminController.performAutoCleanup();
                }

                if (window.pendingStripeUrl) {
                    const finalUrl = new URL(window.pendingStripeUrl);
                    finalUrl.searchParams.set('client_reference_id', session.user.id);
                    finalUrl.searchParams.set('prefilled_email', session.user.email);
                    window.location.href = finalUrl.toString();
                    window.pendingStripeUrl = null;
                }
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

    return {
        openProfileModal,
        updateAuthUI,
        closeProfileModalFunc,
        closeModalFunc
    };
}
