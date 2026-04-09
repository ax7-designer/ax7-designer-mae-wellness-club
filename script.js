import { supabase } from './supabaseClient.js';

// Avatar icon map for rendering in the navbar button
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

document.addEventListener('DOMContentLoaded', async () => {

    /* -----------------------------------------------
       1. SUPABASE AUTH LOGIC
    ----------------------------------------------- */
    const loginBtn    = document.getElementById('loginBtn');
    const loginModal  = document.getElementById('loginModal');
    const closeModal  = document.getElementById('closeModal');
    const loginForm   = document.getElementById('loginForm');
    const emailInput  = document.getElementById('email');
    const passInput   = document.getElementById('password');
    const logInBtnMsg = document.querySelector('.log-in-btn');

    // Profile Modal elements
    const profileModal       = document.getElementById('profileModal');
    const closeProfileModal  = document.getElementById('closeProfileModal');
    const profileGreeting    = document.getElementById('profileGreeting');
    const profileAvatarDisp  = document.getElementById('profileAvatarDisplay');
    const nicknameInput      = document.getElementById('nicknameInput');
    const saveProfileBtn     = document.getElementById('saveProfileBtn');
    const logoutBtn          = document.getElementById('logoutBtn');
    const avatarOptions      = document.querySelectorAll('.avatar-option');

    let currentUser    = null;
    let selectedAvatar = 'bolt'; // default

    /* ---------- Profile Modal helpers ---------- */
    function openProfileModal(user) {
        if (!profileModal) return;
        // Pre-fill from user_metadata
        const meta     = user.user_metadata || {};
        const nickname = meta.nickname || user.email.split('@')[0];
        const avatar   = meta.avatar   || 'bolt';

        if (nicknameInput)   nicknameInput.value = nickname;
        if (profileGreeting) profileGreeting.textContent = `Hola, ${nickname}`;

        // Sync avatar display
        selectedAvatar = avatar;
        syncAvatarUI(avatar);

        profileModal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }

    function closeProfileModalFunc() {
        if (!profileModal) return;
        profileModal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }

    function syncAvatarUI(avatarKey) {
        // Update big display icon
        const iconClass = AVATAR_ICON_MAP[avatarKey] || 'fa-bolt';
        if (profileAvatarDisp) profileAvatarDisp.innerHTML = `<i class="fa-solid ${iconClass}"></i>`;

        // Highlight selected option in grid
        avatarOptions.forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.avatar === avatarKey);
        });
    }

    // Avatar grid click
    avatarOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            selectedAvatar = opt.dataset.avatar;
            syncAvatarUI(selectedAvatar);
        });
    });

    // Save profile
    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', async () => {
            const nickname = nicknameInput ? nicknameInput.value.trim() || 'Miembro' : 'Miembro';
            saveProfileBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Guardando...`;
            saveProfileBtn.disabled = true;

            const { error } = await supabase.auth.updateUser({
                data: { nickname, avatar: selectedAvatar }
            });

            if (error) {
                alert(`Error guardando perfil: ${error.message}`);
            } else {
                // Refresh user
                const { data: { user } } = await supabase.auth.getUser();
                updateAuthUI(user);
                closeProfileModalFunc();
            }

            saveProfileBtn.innerHTML = `<i class="fa-solid fa-check"></i> Guardar Perfil`;
            saveProfileBtn.disabled = false;
        });
    }

    // Close profile modal
    if (closeProfileModal) closeProfileModal.addEventListener('click', closeProfileModalFunc);
    if (profileModal) {
        profileModal.addEventListener('click', (e) => {
            if (e.target === profileModal) closeProfileModalFunc();
        });
    }

    // Logout
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async () => {
            closeProfileModalFunc();
            await supabase.auth.signOut();
            updateAuthUI(null);
            window.location.reload();
        });
    }

    /* ---------- Auth UI updater ---------- */
    const updateAuthUI = (user) => {
        currentUser = user;
        if (!loginBtn) return;

        const addAdminClassBtn = document.getElementById('addAdminClassBtn');

        if (user) {
            const meta     = user.user_metadata || {};
            const nickname = meta.nickname || user.email.split('@')[0];
            const avatar   = meta.avatar   || 'bolt';
            const iconClass = AVATAR_ICON_MAP[avatar] || 'fa-bolt';

            loginBtn.innerHTML = `<i class="fa-solid ${iconClass}"></i> <span class="action-text">Hola, ${nickname}</span>`;
            
            // Check Admin
            if (addAdminClassBtn) {
                const adminEmails = [
                    'jesuscomtreras.666@gmail.com',
                    'guemesana12@gmail.com',
                    'admin@maewellnessclub.com.mx',
                    'alexis.septem@gmail.com'
                ];
                if (adminEmails.includes(user.email)) {
                    addAdminClassBtn.style.display = 'inline-block';
                } else {
                    addAdminClassBtn.style.display = 'none';
                }
            }
        } else {
            loginBtn.innerHTML = `<i class="fa-regular fa-user"></i> <span class="action-text">Iniciar Sesión</span>`;
            if (addAdminClassBtn) addAdminClassBtn.style.display = 'none';
        }
    };

    // Global listener for the loginBtn that checks current user state
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            if (currentUser) {
                openProfileModal(currentUser);
            } else {
                openModal();
            }
        });
    }

    const { data: { session } } = await supabase.auth.getSession();
    updateAuthUI(session?.user || null);

    /* ---------- Login Modal helpers ---------- */
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
    }

    if (closeModal) closeModal.addEventListener('click', closeModalFunc);
    if (loginModal) {
        loginModal.addEventListener('click', (e) => {
            if (e.target === loginModal) closeModalFunc();
        });
    }

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') { closeModalFunc(); closeProfileModalFunc(); }
    });

    supabase.auth.onAuthStateChange((event, session) => {
        if (session) {
            updateAuthUI(session.user);
            if (event === 'SIGNED_IN') closeModalFunc();
        } else {
            updateAuthUI(null);
        }
    });

    // Form Submission for Supabase Login / Signup Flow
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const email    = emailInput.value;
            const password = passInput.value;

            const originalText = logInBtnMsg.innerHTML;
            logInBtnMsg.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cargando...`;
            logInBtnMsg.disabled = true;

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
                console.error("Login error:", error);
                // If the user doesn't exist, attempt to sign up automatically
                if (error.message.includes("Invalid login credentials") || error.message.includes("not confirmed") || error.status === 400) {
                    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
                    
                    if (signUpError) {
                        console.error("Signup error:", signUpError);
                        alert(`Error: ${signUpError.message}`);
                    } else {
                        // Success in signup
                        const user = signUpData.user || signUpData.session?.user;
                        if (user) {
                            alert("¡Cuenta creada exitosamente! Bienvenido a La Tribu.");
                            closeModalFunc();
                            updateAuthUI(user);
                        } else {
                            alert("Por favor revisa tu correo para confirmar tu cuenta.");
                        }
                    }
                } else {
                    alert(`Error al iniciar sesión: ${error.message}`);
                }
            } else {
                alert("¡Bienvenido de vuelta a La Tribu!");
                closeModalFunc();
                updateAuthUI(data.user);
            }

            logInBtnMsg.innerHTML = originalText;
            logInBtnMsg.disabled = false;
        });
    }

    // Social Login (OAuth) Handlers
    const btnGoogle   = document.getElementById('btnGoogle');
    const btnFacebook = document.getElementById('btnFacebook');

    if (btnGoogle) {
        btnGoogle.addEventListener('click', async () => {
            const { error } = await supabase.auth.signInWithOAuth({ provider: 'google' });
            if (error) alert(`Error conectando con Google: ${error.message}`);
        });
    }

    if (btnFacebook) {
        btnFacebook.addEventListener('click', async () => {
            const { error } = await supabase.auth.signInWithOAuth({ provider: 'facebook' });
            if (error) alert(`Error conectando con Facebook: ${error.message}`);
        });
    }

    /* -----------------------------------------------
       2. NAVBAR — shrink + scrolled class on scroll
    ----------------------------------------------- */
    const navbar = document.getElementById('navbar');
    const handleNavScroll = () => {
        if (window.scrollY > 60) {
            navbar.classList.add('scrolled');
        } else {
            navbar.classList.remove('scrolled');
        }
    };
    window.addEventListener('scroll', handleNavScroll);
    handleNavScroll();

    /* -----------------------------------------------
       3. SCROLL REVEAL ANIMATIONS
    ----------------------------------------------- */
    const reveals = document.querySelectorAll('.scroll-reveal');
    const checkReveal = () => {
        const windowHeight = window.innerHeight;
        const revealPoint  = 80;
        reveals.forEach(element => {
            const revealTop = element.getBoundingClientRect().top;
            if (revealTop < windowHeight - revealPoint) {
                element.classList.add('visible');
            }
        });
    };
    window.addEventListener('scroll', checkReveal);
    checkReveal();

    /* -----------------------------------------------
       4. DYNAMIC SCHEDULE SPOTS & ADMIN CLASSES
    ----------------------------------------------- */
    const dateScrollContainer = document.getElementById('dateScrollContainer');
    const spotsGrid = document.getElementById('spotsGrid');
    const dailyClassesList = document.getElementById('dailyClassesList');
    const selectedDateDisplay = document.getElementById('selectedDateDisplay');
    const addAdminClassBtn = document.getElementById('addAdminClassBtn');
    
    // Admin Modal Elements
    const adminClassModal = document.getElementById('adminClassModal');
    const closeAdminClassModal = document.getElementById('closeAdminClassModal');
    const adminClassForm = document.getElementById('adminClassForm');
    
    // Coach profile elements (view only)
    const selectedClassProfile = document.getElementById('selectedClassProfile');
    const scCoachImg = document.getElementById('scCoachImg');
    const scCoachName = document.getElementById('scCoachName');
    const scCoachDiscipline = document.getElementById('scCoachDiscipline');
    const scCoachNote = document.getElementById('scCoachNote');

    // MOCK DATABASE IN MEMORY
    // Key: Date string (YYYY-MM-DD), Value: Array of class objects
    const classesDB = {
        [new Date().toISOString().split('T')[0]]: [
            {
                id: 'init-1',
                discipline: 'Pilates Reformer',
                coachName: 'Silvana',
                coachImg: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?auto=format&fit=crop&q=80&w=200',
                note: 'Eleva tu fuerza, alinea tu postura y conecta con tu interior. ⸻',
                capacity: 4,
                occupiedSpots: [1, 3] 
            }
        ]
    };
    let selectedDateISO = new Date().toISOString().split('T')[0];
    let selectedClassConfig = null;
    
    function getISOFromDate(dateObj) {
        return dateObj.getFullYear() + '-' + String(dateObj.getMonth() + 1).padStart(2, '0') + '-' + String(dateObj.getDate()).padStart(2, '0');
    }

    // DISCIPLINE CAPACITIES
    const DISCIPLINE_CAPACITY = {
        'Train': 8,
        'Indoor Cycling': 11,
        'Pilates': 4
    };

    if (dateScrollContainer) {
        const today = new Date();
        const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        
        for (let i = 0; i < 14; i++) {
            const nextDate = new Date(today);
            nextDate.setDate(today.getDate() + i);
            
            const dayName = i === 0 ? 'Hoy' : days[nextDate.getDay()];
            const dateNum = nextDate.getDate();
            const thisISO = getISOFromDate(nextDate);
            
            const pill = document.createElement('div');
            pill.className = `date-pill ${i === 0 ? 'active' : ''}`;
            pill.innerHTML = `
                <span class="day">${dayName}</span>
                <span class="date">${dateNum}</span>
            `;
            
            pill.addEventListener('click', () => {
                document.querySelectorAll('.date-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                
                selectedDateISO = thisISO;
                if (selectedDateDisplay) {
                    selectedDateDisplay.textContent = i === 0 ? 'Clases de Hoy' : `Clases del ${dateNum}`;
                }
                
                renderDailyClasses();
            });
            
            dateScrollContainer.appendChild(pill);
        }
    }

    // Modal behavior for Admin Add Class
    if (addAdminClassBtn) {
        addAdminClassBtn.addEventListener('click', () => {
            if(adminClassModal) adminClassModal.classList.add('active');
        });
    }
    
    if (closeAdminClassModal) {
        closeAdminClassModal.addEventListener('click', () => {
            adminClassModal.classList.remove('active');
            adminClassForm.reset();
        });
    }

    // Add new Class (Form Submission)
    if (adminClassForm) {
        adminClassForm.addEventListener('submit', (e) => {
            e.preventDefault();
            
            const discipline = document.getElementById('adminDiscipline').value;
            const coachName = document.getElementById('adminCoachName').value;
            const coachImg = document.getElementById('adminCoachImg').value;
            const note = document.getElementById('adminClassNote').value;
            
            if (!classesDB[selectedDateISO]) {
                classesDB[selectedDateISO] = [];
            }
            
            classesDB[selectedDateISO].push({
                id: Date.now().toString(),
                discipline: discipline,
                coachName: coachName,
                coachImg: coachImg,
                note: note,
                capacity: DISCIPLINE_CAPACITY[discipline],
                occupiedSpots: [] 
            });
            
            adminClassModal.classList.remove('active');
            adminClassForm.reset();
            
            renderDailyClasses();
            alert('¡Clase programada exitosamente!');
        });
    }

    function renderDailyClasses() {
        if (!dailyClassesList) return;
        
        dailyClassesList.innerHTML = '';
        if (selectedClassProfile) selectedClassProfile.style.display = 'none';
        if (spotsGrid) spotsGrid.innerHTML = '';
        
        const dayClasses = classesDB[selectedDateISO] || [];
        
        if (dayClasses.length === 0) {
            dailyClassesList.innerHTML = `<p style="text-align:center; color: var(--text-muted); font-style: italic;">No hay clases programadas para este día.</p>`;
            return;
        }

        dayClasses.forEach(cls => {
            const freeCount = cls.capacity - cls.occupiedSpots.length;
            const card = document.createElement('div');
            card.className = 'daily-class-card';
            card.innerHTML = `
                <div class="daily-class-info">
                    <h4>${cls.discipline}</h4>
                    <p><i class="fa-solid fa-user"></i> Coach ${cls.coachName}</p>
                </div>
                <div class="daily-class-meta">
                    <span class="spots-badge">${freeCount} lugares libres</span>
                    <i class="fa-solid fa-chevron-right" style="color: var(--text-muted); font-size: 0.8rem;"></i>
                </div>
            `;
            
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
        if(scCoachImg) scCoachImg.src = cls.coachImg;
        if(scCoachName) scCoachName.textContent = `Coach ${cls.coachName}`;
        if(scCoachDiscipline) scCoachDiscipline.textContent = `${cls.discipline} - ${cls.capacity} Lugares`;
        if(scCoachNote) scCoachNote.textContent = cls.note ? `"${cls.note}"` : '';
        if(selectedClassProfile) selectedClassProfile.style.display = 'block';
        
        renderSpotsGrid(cls);
    }

    const renderSpotsGrid = async (cls) => {
        if (!spotsGrid || !cls) return;
        spotsGrid.innerHTML = ''; 
        
        const totalCapacity = cls.capacity;
        
        for (let i = 1; i <= totalCapacity; i++) {
            const spotDiv = document.createElement('div');
            spotDiv.className = 'spot';

            if (cls.occupiedSpots.includes(i)) {
                spotDiv.classList.add('member');
                spotDiv.innerHTML = `
                    <div class="spot-num">${i}</div>
                    <i class="fa-solid fa-user icon"></i>
                    <div class="status">Ocupado</div>
                `;
            } else {
                spotDiv.classList.add('free');
                spotDiv.innerHTML = `
                    <div class="spot-num">${i}</div>
                    <div class="status">Reservar</div>
                `;
                spotDiv.addEventListener('click', () => {
                    if (currentUser) {
                        alert(`¡Reservaste el lugar ${i} exitosamente para la clase de ${cls.discipline}!`);
                        cls.occupiedSpots.push(i);
                        renderSpotsGrid(cls);
                        renderDailyClasses();
                        setTimeout(() => {
                           // Try to re-select visually finding the card by its name
                           const cards = document.querySelectorAll('.daily-class-card');
                           cards.forEach(c => {
                               if(c.innerHTML.includes(cls.coachName) && c.innerHTML.includes(cls.discipline)) {
                                   c.classList.add('active');
                               }
                           });
                        }, 50);
                    } else {
                        openModal();
                    }
                });
            }

            spotDiv.style.animationDelay = `${(i * 0.04)}s`;
            spotDiv.classList.add('fade-in-up');
            spotsGrid.appendChild(spotDiv);
        }
    }
    
    // Initial load
    renderDailyClasses();

    /* -----------------------------------------------
       5. SMOOTH SCROLL for anchor links
    ----------------------------------------------- */
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', (e) => {
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                e.preventDefault();
                target.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
        });
    });

    /* -----------------------------------------------
       6. DISCIPLINE CARD — subtle parallax on hover
    ----------------------------------------------- */
    const discCards = document.querySelectorAll('.disc-card');
    discCards.forEach(card => {
        const img = card.querySelector('.disc-card-img');
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const xPct = (e.clientX - rect.left) / rect.width - 0.5;
            const yPct = (e.clientY - rect.top) / rect.height - 0.5;
            if (img) {
                img.style.transform = `scale(1.04) translate(${xPct * -12}px, ${yPct * -8}px)`;
            }
        });
        card.addEventListener('mouseleave', () => {
            if (img) img.style.transform = 'scale(1.0)';
        });
    });

    /* -----------------------------------------------
       7. PRICING TABS SWITCHER
    ----------------------------------------------- */
    const pricingTabs = document.querySelectorAll('.btn-pricing-tab');
    const pricingPanels = document.querySelectorAll('.pricing-panel');

    pricingTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Remove active class from all tabs & panels
            pricingTabs.forEach(t => t.classList.remove('active'));
            pricingPanels.forEach(p => p.classList.remove('active'));

            // Add active class to clicked tab
            tab.classList.add('active');

            // Find matching panel and activate it
            const targetId = `panel-${tab.dataset.tab}`;
            const targetPanel = document.getElementById(targetId);
            if (targetPanel) {
                targetPanel.classList.add('active');
            }
        });
    });

});
