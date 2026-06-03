import { supabase } from './src/shared/supabaseClient.js';
import { isAdmin } from './src/auth/admin.js';
import { getChetumalDate, getISOFromDate } from './src/shared/uiHelpers.js';

// Import UI Controllers
import { initAuthController } from './src/auth/authController.js';
import { initClassController } from './src/classes/classController.js';
import { initBookingController } from './src/reservations/bookingController.js';
import { initAdminController } from './src/admin/adminController.js';

/* ============================================================
   GLOBAL SHARED STATE
   ============================================================ */
const state = {
    currentUser: null,
    selectedAvatar: 'bolt',
    selectedDateISO: getISOFromDate(getChetumalDate()),
    activeDisciplineFilter: 'all',
    selectedClassConfig: null,
    inactiveDays: { weekdays: new Set(), specific: new Set() },
    isSignupMode: false
};

// Restore active filter preference from cache
try {
    const cachedFilter = localStorage.getItem('mae_discipline_filter');
    if (cachedFilter) state.activeDisciplineFilter = cachedFilter;
} catch (e) {
    console.warn("Error restoring active filter preference", e);
}

// Restore last viewed date preference from cache (must not be in the past)
try {
    const cachedDate = localStorage.getItem('mae_last_date');
    if (cachedDate && cachedDate >= state.selectedDateISO) {
        state.selectedDateISO = cachedDate;
    }
} catch (e) {
    console.warn("Error restoring last viewed date preference", e);
}

/* ============================================================
   MAIN INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', async () => {

    /* ------- DOM References ------- */
    const navbar = document.getElementById('navbar');
    const mobileMenu = document.getElementById('mobileMenu');
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const mobileClose = document.getElementById('mobileMenuClose');

    // Instantiate controllers collection object to resolve cross-controller references
    const controllers = {
        authController: null,
        classController: null,
        bookingController: null,
        adminController: null
    };

    // Initialize all controllers with shared state and references
    controllers.authController = initAuthController(state, controllers);
    controllers.classController = initClassController(state, controllers);
    controllers.bookingController = initBookingController(state, controllers);
    controllers.adminController = initAdminController(state, controllers);

    /* -----------------------------------------------
       1. SCROLL REVEAL (IntersectionObserver)
       ----------------------------------------------- */
    const revealObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('visible');
                revealObserver.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1 });

    document.querySelectorAll('.scroll-reveal').forEach(el => revealObserver.observe(el));

    /* -----------------------------------------------
       2. NAVBAR SCROLL
       ----------------------------------------------- */
    if (navbar) {
        const handleNavScroll = () => navbar.classList.toggle('scrolled', window.scrollY > 60);
        window.addEventListener('scroll', handleNavScroll, { passive: true });
        handleNavScroll();
    }

    /* -----------------------------------------------
       3. MOBILE MENU
       ----------------------------------------------- */
    function openMobileMenu() {
        if (!mobileMenu) return;
        mobileMenu.classList.add('open');
        mobileMenu.setAttribute('aria-hidden', 'false');
        hamburgerBtn?.classList.add('open');
        hamburgerBtn?.setAttribute('aria-expanded', 'true');
        document.body.style.overflow = 'hidden';
    }

    function closeMobileMenu() {
        if (!mobileMenu) return;
        mobileMenu.classList.remove('open');
        mobileMenu.setAttribute('aria-hidden', 'true');
        hamburgerBtn?.classList.remove('open');
        hamburgerBtn?.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = 'auto';
    }

    if (hamburgerBtn) hamburgerBtn.addEventListener('click', openMobileMenu);
    if (mobileClose) mobileClose.addEventListener('click', closeMobileMenu);

    if (mobileMenu) {
        mobileMenu.addEventListener('click', (e) => {
            const panel = mobileMenu.querySelector('.mobile-menu-panel');
            if (panel && !panel.contains(e.target)) closeMobileMenu();
        });
    }

    const mobileLinks = document.querySelectorAll('.mobile-nav-link');
    mobileLinks.forEach(link => link.addEventListener('click', closeMobileMenu));

    /* -----------------------------------------------
       4. REALTIME SUBSCRIPTION EVENT HUB
       ----------------------------------------------- */
    function setupRealtimeSubscriptions() {
        supabase
            .channel('schema-db-changes')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'classes' }, (payload) => {
                console.log('Realtime change in classes:', payload);
                if (controllers.classController) {
                    controllers.classController.renderDailyClasses();
                }

                if (payload.new && state.selectedClassConfig && payload.new.id === state.selectedClassConfig.id) {
                    state.selectedClassConfig = payload.new;
                    if (controllers.bookingController) {
                        controllers.bookingController.showClassDetails(payload.new);
                    }
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, (payload) => {
                if (state.currentUser && payload.new && payload.new.id === state.currentUser.id) {
                    console.log('Realtime profile update:', payload.new);
                    const creditDisp = document.getElementById('profileCreditsCount');
                    if (creditDisp) creditDisp.textContent = payload.new.credits || '0';
                    if (controllers.bookingController) {
                        controllers.bookingController.renderMyReservations();
                    }
                }
            })
            .subscribe();
    }

    setupRealtimeSubscriptions();

    /* -----------------------------------------------
       5. SMOOTH SCROLL
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
       6. DISCIPLINE CARD PARALLAX
       ----------------------------------------------- */
    document.querySelectorAll('.disc-card').forEach(card => {
        const img = card.querySelector('.disc-card-img');
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const xPct = (e.clientX - rect.left) / rect.width - 0.5;
            const yPct = (e.clientY - rect.top) / rect.height - 0.5;
            if (img) img.style.transform = `scale(1.04) translate(${xPct * -12}px, ${yPct * -8}px)`;
        });
        card.addEventListener('mouseleave', () => {
            if (img) img.style.transform = 'scale(1.0)';
        });
    });

    /* -----------------------------------------------
       7. PRICING TABS
       ----------------------------------------------- */
    const pricingTabs = document.querySelectorAll('.btn-pricing-tab');
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
       8. INITIALIZATION FETCH
       ----------------------------------------------- */
    if (controllers.classController) {
        controllers.classController.buildDatePills();
        controllers.classController.renderDailyClasses();
    }

    (async () => {
        try {
            const results = await Promise.allSettled([
                supabase.auth.getSession(),
                controllers.classController ? controllers.classController.loadInactiveDays() : Promise.resolve()
            ]);

            const sessionResult = results[0];
            if (sessionResult.status === 'fulfilled') {
                const { data: { session }, error } = sessionResult.value;
                if (!error && controllers.authController) {
                    await controllers.authController.updateAuthUI(session?.user || null);
                }
            }

            if (controllers.classController) {
                controllers.classController.buildDatePills();
                controllers.classController.renderDailyClasses();
            }
        } catch (err) {
            console.error("Initialization error:", err);
        }
    })();
});
