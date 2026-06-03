import { supabase } from '../shared/supabaseClient.js';
import { isAdmin } from '../auth/admin.js';
import * as reservationService from './reservationService.js';
import { showToast, getISOFromDate, getChetumalDate } from '../shared/uiHelpers.js';

import pilatesImgUrl from '../../pilates_deseada.jpg';
import trainImgUrl from '../../train_deseada.jpg';
import indoorImgUrl from '../../indoor_deseada.jpg';
import logoImgUrl from '../../mae_logo.png';

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DISCIPLINE_IMAGES = {
    'pilates': pilatesImgUrl,
    'train': trainImgUrl,
    'indoor cycling': indoorImgUrl
};

let _refreshPromise = null;
async function safeGetSession() {
    if (_refreshPromise) return _refreshPromise;
    _refreshPromise = supabase.auth.getSession().finally(() => {
        _refreshPromise = null;
    });
    return _refreshPromise;
}

/**
 * Initializes reservation and spots grid UI controller.
 */
export function initBookingController(state, controllers) {
    const spotsGrid = document.getElementById('spotsGrid');
    const reserveModal = document.getElementById('reserveModal');
    const closeReserveModal = document.getElementById('closeReserveModal');
    const confirmReserveBtn = document.getElementById('confirmReserveBtn');
    const scCoachImg = document.getElementById('scCoachImg');
    const scCoachName = document.getElementById('scCoachName');
    const scCoachDiscipline = document.getElementById('scCoachDiscipline');
    const scCoachNote = document.getElementById('scCoachNote');
    const selectedClassProfile = document.getElementById('selectedClassProfile');
    const myReservationsList = document.getElementById('myReservationsList');

    let pendingSpot = null;
    let pendingCls = null;

    /* ----------------------- Render My Reservations ----------------------- */
    async function renderMyReservations() {
        if (!state.currentUser) return;
        if (!myReservationsList) return;

        myReservationsList.innerHTML = '<p style="text-align:center;color:var(--accent-gold);padding:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando tus clases...</p>';

        try {
            const { data, error } = await supabase
                .from('classes')
                .select('*')
                .filter('occupied_spots', 'cs', JSON.stringify([{ userId: state.currentUser.id }]));

            if (error) throw error;

            const now = getChetumalDate();
            const todayISO = getISOFromDate(now);
            const currentMin = now.getHours() * 60 + now.getMinutes();

            const active = (data || []).filter(cls => {
                let time = cls.class_time || "00:00";
                if (cls.note && cls.note.includes("[T:")) {
                    const m = cls.note.match(/\[T:(\d{2}:\d{2})\]/);
                    if (m) time = m[1];
                }
                const [hh, mm] = time.split(':').map(Number);
                const sortVal = hh * 60 + mm;
                if (cls.date < todayISO) return false;
                if (cls.date === todayISO && sortVal < currentMin - 10) return false;
                return true;
            });

            if (active.length === 0) {
                myReservationsList.innerHTML = '<p style="text-align: center; color: var(--text-muted); font-size: 0.85rem; font-style: italic; padding: 10px;">No tienes clases próximas.</p>';
                return;
            }

            myReservationsList.innerHTML = '';
            active.sort((a, b) => a.date.localeCompare(b.date)).forEach(cls => {
                let time = cls.class_time || "00:00";
                if (cls.note && cls.note.includes("[T:")) {
                    const m = cls.note.match(/\[T:(\d{2}:\d{2})\]/);
                    if (m) time = m[1];
                }
                const [hh, mm] = time.split(':').map(Number);
                const time12 = `${hh % 12 || 12}:${String(mm).padStart(2, '0')} ${hh >= 12 ? 'PM' : 'AM'}`;
                const dateObj = new Date(cls.date + 'T12:00:00');
                const dateStr = `${DAYS_ES[dateObj.getDay()]} ${dateObj.getDate()}`;

                const item = document.createElement('div');
                item.className = 'reservation-item';
                const mySpot = cls.occupied_spots.find(s => s.userId === state.currentUser.id)?.spot || '?';

                item.innerHTML = `
                    <div class="res-info">
                        <div class="res-discipline">${cls.discipline}</div>
                        <div class="res-time-date">
                            <i class="fa-regular fa-calendar"></i> ${dateStr} 
                            <i class="fa-regular fa-clock" style="margin-left:5px;"></i> ${time12}
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:12px;">
                        <span class="res-spot-badge">Lugar #${mySpot}</span>
                        <button class="reservation-cancel-btn" title="Cancelar Reserva">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>`;

                item.querySelector('.reservation-cancel-btn').onclick = () => cancelReservation(cls);
                myReservationsList.appendChild(item);
            });
        } catch (err) {
            myReservationsList.innerHTML = '<p style="text-align:center;color:#e63946;font-size:0.8rem;">Error al cargar reservas.</p>';
        }
    }

    /* ----------------------- Cancel Reservation ----------------------- */
    async function cancelReservation(cls) {
        if (!confirm(`¿Estás seguro de cancelar tu lugar en la clase de ${cls.discipline}? Se te devolverá 1 crédito.`)) return;

        try {
            const { error } = await reservationService.cancelReservation(cls.id, state.currentUser.id);
            if (error) throw error;

            showToast('✓ Reserva cancelada. Crédito devuelto.');
            renderMyReservations();
            if (controllers.classController) {
                controllers.classController.renderDailyClasses();
            }

            const { data: prof } = await supabase.from('profiles').select('credits').eq('id', state.currentUser.id).single();
            if (prof && document.getElementById('profileCreditsCount')) {
                document.getElementById('profileCreditsCount').textContent = prof.credits;
            }
        } catch (err) {
            console.error("Error canceling reservation:", err);
            showToast(`Error: ${err.message}`, 'error');
        }
    }

    /* ----------------------- Show Class Details & Coach Info ----------------------- */
    async function showClassDetails(cls) {
        state.selectedClassConfig = cls;

        const spots = cls.occupied_spots || [];
        const anonUserIds = spots
            .filter(s => s.displayName === 'Anónimo' || s.displayName === 'anon')
            .map(s => s.userId)
            .filter(Boolean);

        if (anonUserIds.length > 0) {
            const { data: profiles } = await supabase.from('profiles').select('id, full_name, nickname').in('id', anonUserIds);
            if (profiles) {
                profiles.forEach(p => {
                    const revealedName = p.full_name || p.nickname || 'Usuario Registrado';
                    spots.forEach(s => {
                        if (s.userId === p.id && (s.displayName === 'Anónimo' || s.displayName === 'anon')) {
                            s.displayName = revealedName;
                        }
                    });
                });
            }
            spots.forEach(s => {
                if ((s.displayName === 'Anónimo' || s.displayName === 'anon') && s.userId) {
                    const found = profiles?.find(p => p.id === s.userId);
                    if (!found) s.displayName = 'Usuario Inactivo';
                }
            });
        }

        const discImg = DISCIPLINE_IMAGES[cls.discipline.toLowerCase()];
        const fallback = logoImgUrl;
        const finalSrc = discImg || cls.coach_img || fallback;

        if (scCoachImg) {
            scCoachImg.style.opacity = '0';
            scCoachImg.onerror = () => {
                console.warn("Image Load Error, falling back to logo.");
                scCoachImg.src = fallback;
                scCoachImg.style.opacity = '1';
                scCoachImg.onerror = null;
            };
            scCoachImg.onload = () => {
                scCoachImg.style.opacity = '1';
            };
            scCoachImg.src = finalSrc;
        }

        if (scCoachName) scCoachName.textContent = "";
        if (scCoachDiscipline) scCoachDiscipline.textContent = `${cls.discipline} · ${cls.capacity} Lugares`;
        if (scCoachNote) scCoachNote.textContent = cls.displayNote ? `"${cls.displayNote}"` : '';

        if (selectedClassProfile) {
            selectedClassProfile.style.display = 'block';
            setTimeout(() => {
                selectedClassProfile.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
        renderSpotsGrid(cls);
    }

    /* ----------------------- Render Spots Grid ----------------------- */
    function renderSpotsGrid(cls) {
        if (!spotsGrid || !cls) return;
        spotsGrid.innerHTML = '';
        const totalCapacity = cls.capacity;
        const occupied = cls.occupied_spots || [];
        const normalized = occupied.map(s => typeof s === 'number' ? { spot: s, userId: null, displayName: 'Miembro' } : s);
        const occupiedSpotNums = new Set(normalized.map(s => s.spot));

        for (let i = 1; i <= totalCapacity; i++) {
            const spotDiv = document.createElement('div');
            spotDiv.className = 'spot';
            const entry = normalized.find(s => s.spot === i);

            if (occupiedSpotNums.has(i)) {
                const isMine = entry?.userId === state.currentUser?.id;
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
                    if (!state.currentUser) {
                        const loginModal = document.getElementById('loginModal');
                        if (loginModal) {
                            loginModal.classList.add('active');
                            document.body.style.overflow = 'hidden';
                        }
                        return;
                    }

                    if (isAdmin(state.currentUser) && controllers.adminController) {
                        controllers.adminController.showAdminSpotChoiceModal(cls, i);
                        return;
                    }

                    pendingSpot = i;
                    pendingCls = cls;
                    const meta = state.currentUser.user_metadata || {};
                    const sel = document.getElementById('reserveDisplayName');
                    if (sel) {
                        sel.innerHTML = `<option value="name">Nombre: ${meta.full_name || state.currentUser.email.split('@')[0]}</option>`;
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
    }

    /* ----------------------- Event Binding ----------------------- */
    if (closeReserveModal) {
        closeReserveModal.addEventListener('click', () => { reserveModal?.classList.remove('active'); });
    }
    if (reserveModal) {
        reserveModal.addEventListener('click', (e) => { if (e.target === reserveModal) reserveModal.classList.remove('active'); });
    }

    if (confirmReserveBtn) {
        confirmReserveBtn.addEventListener('click', async () => {
            if (!pendingCls || !pendingSpot || !state.currentUser) return;

            const { data: { session }, error: sessionError } = await safeGetSession();
            if (!session || sessionError) {
                showToast('Tu sesión expiró. Por favor inicia sesión nuevamente.', 'error');
                reserveModal.classList.remove('active');
                const loginModal = document.getElementById('loginModal');
                if (loginModal) {
                    loginModal.classList.add('active');
                    document.body.style.overflow = 'hidden';
                }
                return;
            }

            const meta = state.currentUser.user_metadata || {};
            let displayName = meta.full_name || state.currentUser.email.split('@')[0];

            confirmReserveBtn.disabled = true;
            confirmReserveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            try {
                const spotData = { spot: pendingSpot, userId: state.currentUser.id, displayName };
                const { error } = await reservationService.bookReservation(
                    pendingCls.id,
                    state.currentUser.id,
                    spotData
                );

                if (error) {
                    if (error.message.includes('ocupado')) throw new Error('Este lugar ya fue tomado por otra persona.');
                    if (error.message.includes('créditos')) throw new Error('No tienes clases disponibles. Por favor adquiere un plan.');
                    throw error;
                }

                showToast(`✓ ¡Reserva lista! Lugar #${pendingSpot}`);

                const { data: prof } = await supabase.from('profiles').select('credits').eq('id', state.currentUser.id).single();
                if (prof && document.getElementById('profileCreditsCount')) {
                    document.getElementById('profileCreditsCount').textContent = prof.credits;
                }

                if (controllers.classController) {
                    controllers.classController.renderDailyClasses();
                }
                reserveModal.classList.remove('active');
            } catch (err) {
                showToast(err.message, 'error');
            } finally {
                confirmReserveBtn.disabled = false;
                confirmReserveBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Reserva';
                pendingSpot = null;
                pendingCls = null;
            }
        });
    }

    return {
        renderMyReservations,
        cancelReservation,
        showClassDetails,
        renderSpotsGrid
    };
}
