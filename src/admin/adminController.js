import { supabase } from '../shared/supabaseClient.js';
import { isAdmin } from '../auth/admin.js';
import { adminBookReservation } from '../reservations/reservationService.js';
import { showToast, getISOFromDate, getChetumalDate } from '../shared/uiHelpers.js';
import { DISCIPLINE_CAPACITY } from '../credits/creditRules.js';

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

/**
 * Initializes admin dashboard features: credit assignments, webhooks, check-ins, class programing, inactive days.
 */
export function initAdminController(state, controllers) {
    const adminAddCreditsBtn = document.getElementById('adminAddCreditsBtn');
    const adminSearchUserBtn = document.getElementById('adminSearchUserBtn');
    const adminCreditPreview = document.getElementById('adminCreditPreview');
    const addInactiveDayBtn = document.getElementById('addInactiveDayBtn');
    const inactiveDayModal = document.getElementById('inactiveDayModal');
    const closeInactiveModal = document.getElementById('closeInactiveDayModal');
    const inactiveDayForm = document.getElementById('inactiveDayForm');
    const addAdminClassBtn = document.getElementById('addAdminClassBtn');
    const adminClassModal = document.getElementById('adminClassModal');
    const closeAdminClassModal = document.getElementById('closeAdminClassModal');
    const adminClassForm = document.getElementById('adminClassForm');
    const recurrencePreview = document.getElementById('recurrencePreview');
    const recurrenceFreqEl = document.getElementById('adminRecurrenceFreq');
    const recurrenceCountEl = document.getElementById('adminRecurrenceCount');
    const coachFileInput = document.getElementById('adminCoachFile');
    const coachImgPreview = document.getElementById('coachImgPreview');

    let adminTargetUser = null;

    /* ----------------------- 1. Credit Assignment Flow ----------------------- */
    if (adminSearchUserBtn) {
        adminSearchUserBtn.addEventListener('click', async () => {
            const email = document.getElementById('adminTargetEmail').value.trim();
            if (!email) return showToast('Ingresa un email válido', 'error');

            adminSearchUserBtn.disabled = true;
            adminSearchUserBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            const { data: profile, error } = await supabase.rpc('admin_search_user', { p_email: email });

            adminSearchUserBtn.disabled = false;
            adminSearchUserBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Buscar';

            if (error || !profile) {
                adminTargetUser = null;
                if (adminCreditPreview) {
                    adminCreditPreview.innerHTML = `
                        <div style="color:#e63946; font-size:0.82rem; padding:10px 14px; border-radius:8px; background:rgba(230,57,70,0.08); border:1px solid rgba(230,57,70,0.2); display:flex; align-items:center; gap:8px;">
                            <i class="fa-solid fa-triangle-exclamation"></i>
                            Usuario no encontrado con ese email.
                        </div>`;
                }
                return;
            }

            adminTargetUser = profile;
            const displayName = profile.full_name || profile.nickname || profile.email_fallback;
            const lastUpdate = profile.updated_at
                ? new Date(profile.updated_at).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'N/A';

            const indoor = profile.credits_indoor ?? 0;
            const train = profile.credits_train ?? 0;
            const pilates = profile.credits_pilates ?? 0;
            const open = profile.credits_open ?? 0;
            const total = profile.credits ?? (indoor + train + pilates + open);

            if (adminCreditPreview) {
                adminCreditPreview.innerHTML = `
                    <div style="background:rgba(42,157,143,0.07); border:1px solid rgba(42,157,143,0.25); border-radius:10px; padding:14px; font-size:0.83rem;">
                        <div style="display:flex; justify-content:space-between; margin-bottom:7px;">
                            <span style="color:var(--text-muted);">Usuario:</span>
                            <span style="color:#fff; font-weight:600;">${displayName}</span>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                            <span style="color:var(--text-muted);">Email:</span>
                            <span style="color:#ccc; font-size:0.8rem;">${profile.email_fallback}</span>
                        </div>
                        <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:8px;">
                            <div style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);border-radius:7px;padding:7px;text-align:center;font-size:0.75rem;">
                                <i class="fa-solid fa-bicycle" style="color:var(--accent-gold);"></i>
                                <div style="font-weight:700;color:#fff;">${indoor}</div>
                                <div style="color:var(--text-muted);">Indoor</div>
                            </div>
                            <div style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);border-radius:7px;padding:7px;text-align:center;font-size:0.75rem;">
                                <i class="fa-solid fa-dumbbell" style="color:var(--accent-gold);"></i>
                                <div style="font-weight:700;color:#fff;">${train}</div>
                                <div style="color:var(--text-muted);">Train</div>
                            </div>
                            <div style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);border-radius:7px;padding:7px;text-align:center;font-size:0.75rem;">
                                <i class="fa-solid fa-child-reaching" style="color:var(--accent-gold);"></i>
                                <div style="font-weight:700;color:#fff;">${pilates}</div>
                                <div style="color:var(--text-muted);">Pilates</div>
                            </div>
                            <div style="background:rgba(42,157,143,0.08);border:1px solid rgba(42,157,143,0.2);border-radius:7px;padding:7px;text-align:center;font-size:0.75rem;">
                                <i class="fa-solid fa-crown" style="color:#2a9d8f;"></i>
                                <div style="font-weight:700;color:#2a9d8f;">${open}</div>
                                <div style="color:var(--text-muted);">VIP</div>
                            </div>
                        </div>
                        <div style="display:flex;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.07);padding-top:7px;">
                            <span style="color:var(--text-muted);">Total:</span>
                            <span style="color:#2a9d8f; font-weight:800; font-size:1.1rem;">${total} clases</span>
                        </div>
                        <div style="color:var(--text-muted); font-size:0.75rem; margin-top:4px;">
                            <i class="fa-regular fa-clock" style="margin-right:4px;"></i>Última actualización: ${lastUpdate}
                        </div>
                    </div>`;
            }
        });
    }

    if (adminAddCreditsBtn) {
        adminAddCreditsBtn.addEventListener('click', async () => {
            if (!adminTargetUser) {
                return showToast('Primero busca al usuario con el botón Buscar', 'error');
            }

            const amount = parseInt(document.getElementById('adminCreditAmount').value);
            const notes = document.getElementById('adminCreditNotes')?.value?.trim() || '';
            const creditType = document.getElementById('adminCreditType')?.value || 'open';

            if (isNaN(amount) || amount <= 0) {
                return showToast('Ingresa una cantidad válida (mayor a 0)', 'error');
            }

            const typeLabels = { indoor: 'Indoor Cycling', train: 'Train', pilates: 'Pilates', open: 'VIP (Comodín)' };
            const displayName = adminTargetUser.full_name || adminTargetUser.nickname || adminTargetUser.email_fallback;
            const confirmed = confirm(
                `¿Confirmas asignar ${amount} crédito(s) de ${typeLabels[creditType] || creditType}?\n\n` +
                `Cliente: ${displayName}`
            );
            if (!confirmed) return;

            adminAddCreditsBtn.disabled = true;
            adminAddCreditsBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

            const { data, error } = await supabase.rpc('add_credits_by_email', {
                target_email: adminTargetUser.email_fallback,
                amount: amount,
                p_admin_id: state.currentUser.id,
                p_notes: notes || `Asignación manual — ${new Date().toLocaleDateString('es-MX')}`,
                p_credit_type: creditType
            });

            if (error) {
                showToast(`Error: ${error.message}`, 'error');
            } else {
                showToast(`✓ ${amount} clase(s) de ${typeLabels[creditType]} asignadas. Nuevo saldo tipo: ${data.new_balance}`, 'success');
                document.getElementById('adminTargetEmail').value = '';
                document.getElementById('adminCreditAmount').value = '';
                if (document.getElementById('adminCreditNotes')) document.getElementById('adminCreditNotes').value = '';
                adminTargetUser = null;
                if (adminCreditPreview) adminCreditPreview.innerHTML = '';
            }

            adminAddCreditsBtn.disabled = false;
            adminAddCreditsBtn.innerHTML = '<i class="fa-solid fa-plus"></i> Asignar Créditos';
        });
    }

    /* ----------------------- 2. Failed Payments Monitor ----------------------- */
    async function loadFailedPayments() {
        const container = document.getElementById('failedPaymentsList');
        const badge = document.getElementById('failedPaymentsBadge');
        if (!container) return;

        container.innerHTML = '<p style="color:var(--text-muted);font-size:0.82rem;text-align:center;padding:10px;"><i class="fa-solid fa-spinner fa-spin"></i> Cargando...</p>';

        const { data: events, error } = await supabase
            .from('stripe_webhook_events')
            .select('id, stripe_event_id, email, amount_credits, credit_type, mae_id, payment_intent, error_message, created_at')
            .eq('status', 'failed')
            .order('created_at', { ascending: false })
            .limit(50);

        if (error) {
            container.innerHTML = `<p style="color:#e63946;font-size:0.8rem;text-align:center;">Error al cargar: ${error.message}</p>`;
            return;
        }

        if (!events || events.length === 0) {
            container.innerHTML = '<p style="color:#2a9d8f;font-size:0.85rem;text-align:center;padding:12px;"><i class="fa-solid fa-check-circle"></i> ¡Sin pagos fallidos! Todo en orden.</p>';
            if (badge) badge.style.display = 'none';
            return;
        }

        if (badge) {
            badge.textContent = events.length;
            badge.style.display = 'inline-block';
        }

        const CREDIT_LABELS = { indoor: '🚴 Indoor Cycling', train: '🏋️ Train', pilates: '🧘 Pilates', open: '👑 VIP' };
        const CREDIT_COLORS = { indoor: '#c9a96e', train: '#c9a96e', pilates: '#c9a96e', open: '#2a9d8f' };

        container.innerHTML = '';
        events.forEach(ev => {
            const dateStr = new Date(ev.created_at).toLocaleDateString('es-MX', {
                day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
            });
            const creditLabel = CREDIT_LABELS[ev.credit_type] || ev.credit_type;
            const creditColor = CREDIT_COLORS[ev.credit_type] || '#ccc';

            const card = document.createElement('div');
            card.style.cssText = `
                background: rgba(230,57,70,0.05);
                border: 1px solid rgba(230,57,70,0.2);
                border-radius: 10px;
                padding: 12px 14px;
                font-size: 0.8rem;
            `;
            card.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px; flex-wrap:wrap;">
                    <div style="flex:1; min-width:0;">
                        <div style="color:#fff; font-weight:700; margin-bottom:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                            ${ev.email || 'Sin email'}
                        </div>
                        <div style="display:flex; gap:8px; flex-wrap:wrap; margin-bottom:4px;">
                            <span style="color:${creditColor}; font-weight:700;">${ev.amount_credits ?? '?'} clase(s) ${creditLabel}</span>
                        </div>
                        <div style="color:var(--text-muted); font-size:0.72rem;">${dateStr}</div>
                        ${ev.error_message ? `<div style="color:rgba(230,57,70,0.8);font-size:0.7rem;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${ev.error_message}">⚠ ${ev.error_message.substring(0, 60)}${ev.error_message.length > 60 ? '...' : ''}</div>` : ''}
                    </div>
                    <button
                        class="retry-webhook-btn"
                        data-event-id="${ev.id}"
                        style="
                            background: linear-gradient(135deg, #2a9d8f, #1a7a6e);
                            color: #fff; border: none; border-radius: 8px;
                            padding: 8px 12px; cursor: pointer; font-size: 0.75rem;
                            font-family: inherit; font-weight: 700; white-space: nowrap;
                            display: flex; align-items: center; gap: 5px; flex-shrink: 0;
                        ">
                        <i class="fa-solid fa-rotate-right"></i> Reintentar
                    </button>
                </div>
            `;

            card.querySelector('.retry-webhook-btn').addEventListener('click', async (e) => {
                const btn = e.currentTarget;
                const eventId = parseInt(btn.dataset.eventId);
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                const { data, error: rpcError } = await supabase.rpc('retry_failed_webhook', {
                    p_event_id: eventId
                });

                if (rpcError || !data?.ok) {
                    const msg = rpcError?.message || data?.error || 'Error desconocido';
                    showToast(`❌ Retry falló: ${msg}`, 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i class="fa-solid fa-rotate-right"></i> Reintentar';
                } else {
                    showToast(`✅ ${data.credits_added} crédito(s) asignado(s) correctamente`, 'success');
                    card.style.transition = 'opacity 0.4s, max-height 0.4s';
                    card.style.opacity = '0';
                    card.style.maxHeight = '0';
                    card.style.overflow = 'hidden';
                    setTimeout(() => {
                        card.remove();
                        const remaining = container.querySelectorAll('.retry-webhook-btn').length;
                        if (badge) {
                            if (remaining === 0) {
                                badge.style.display = 'none';
                                container.innerHTML = '<p style="color:#2a9d8f;font-size:0.85rem;text-align:center;padding:12px;"><i class="fa-solid fa-check-circle"></i> ¡Sin pagos fallidos! Todo en orden.</p>';
                            } else {
                                badge.textContent = remaining;
                            }
                        }
                    }, 400);
                }
            });

            container.appendChild(card);
        });
    }

    /* ----------------------- 3. Roster Check-In Modal ----------------------- */
    async function showRosterModal(cls) {
        if (!isAdmin(state.currentUser)) return;

        let rosterModal = document.getElementById('rosterModal');
        if (!rosterModal) {
            rosterModal = document.createElement('div');
            rosterModal.id = 'rosterModal';
            rosterModal.className = 'modal-overlay';
            rosterModal.innerHTML = `
                <div class="modal-content" style="max-width:520px; max-height:85vh; overflow-y:auto;">
                    <button class="close-btn" id="closeRosterModal" aria-label="Cerrar roster">&times;</button>
                    <div class="modal-header" style="padding-bottom:12px;">
                        <i class="fa-solid fa-clipboard-list" style="font-size:2rem; color:var(--accent-gold); margin-bottom:8px;"></i>
                        <h2 id="rosterTitle">Pase de Lista</h2>
                        <p id="rosterSubtitle" style="color:var(--text-muted);"></p>
                    </div>
                    <div id="rosterContent"></div>
                </div>`;
            document.body.appendChild(rosterModal);

            document.getElementById('closeRosterModal').addEventListener('click', () => {
                rosterModal.classList.remove('active');
                document.body.style.overflow = 'auto';
            });
            rosterModal.addEventListener('click', (e) => {
                if (e.target === rosterModal) {
                    rosterModal.classList.remove('active');
                    document.body.style.overflow = 'auto';
                }
            });
        }

        const titleEl = document.getElementById('rosterTitle');
        const subtitleEl = document.getElementById('rosterSubtitle');
        if (titleEl) titleEl.textContent = `${cls.discipline} — Pase de Lista`;
        if (subtitleEl) subtitleEl.textContent = `${cls.time12} · ${cls.date}`;

        const content = document.getElementById('rosterContent');
        content.innerHTML = '<p style="text-align:center; padding:30px;"><i class="fa-solid fa-spinner fa-spin" style="color:var(--accent-gold);"></i> Cargando asistentes...</p>';

        rosterModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        const [{ data: classData }, { data: attendance }] = await Promise.all([
            supabase.from('classes').select('occupied_spots, capacity').eq('id', cls.id).single(),
            supabase.from('class_attendance').select('*').eq('class_id', cls.id)
        ]);

        const spots = classData?.occupied_spots || [];
        const attendanceMap = {};
        (attendance || []).forEach(a => { attendanceMap[a.user_id] = a.status; });

        if (spots.length === 0) {
            content.innerHTML = '<p style="text-align:center; color:var(--text-muted); padding:30px; font-style:italic;">Sin reservas para esta clase.</p>';
            return;
        }

        const userIds = spots.map(s => s.userId).filter(Boolean);
        const { data: profiles } = await supabase.from('profiles').select('id, full_name, nickname, email_fallback').in('id', userIds);

        const profileMap = {};
        (profiles || []).forEach(p => { profileMap[p.id] = p; });

        const statusColors = { reserved: '#c8a96e', attended: '#2a9d8f', no_show: '#e63946' };
        const statusIcons = { reserved: 'fa-clock', attended: 'fa-circle-check', no_show: 'fa-circle-xmark' };
        const statusLabels = { reserved: 'Pendiente', attended: 'Asistió ✓', no_show: 'Falta' };

        const attendedCount = Object.values(attendanceMap).filter(s => s === 'attended').length;
        const noShowCount = Object.values(attendanceMap).filter(s => s === 'no_show').length;
        const pendingCount = spots.length - attendedCount - noShowCount;

        let html = `
            <div style="display:flex; gap:8px; margin:0 16px 16px; flex-wrap:wrap;">
                <span style="flex:1; text-align:center; padding:8px; border-radius:8px; background:rgba(42,157,143,0.1); font-size:0.8rem; color:#2a9d8f; font-weight:600;">
                    <i class="fa-solid fa-circle-check"></i> ${attendedCount} Asistieron
                </span>
                <span style="flex:1; text-align:center; padding:8px; border-radius:8px; background:rgba(230,57,70,0.08); font-size:0.8rem; color:#e63946; font-weight:600;">
                    <i class="fa-solid fa-circle-xmark"></i> ${noShowCount} Falta(s)
                </span>
                <span style="flex:1; text-align:center; padding:8px; border-radius:8px; background:rgba(201,169,110,0.08); font-size:0.8rem; color:var(--accent-gold); font-weight:600;">
                    <i class="fa-regular fa-clock"></i> ${pendingCount} Pendiente(s)
                </span>
            </div>`;

        spots.forEach(spot => {
            const profile = profileMap[spot.userId] || {};
            const displayName = profile.full_name || profile.nickname || spot.displayName || 'Miembro';
            const email = profile.email_fallback || '';
            const status = attendanceMap[spot.userId] || 'reserved';

            html += `
                <div class="roster-item" style="display:flex; align-items:center; justify-content:space-between;
                    padding:12px 16px; margin:0 8px 8px; background:rgba(255,255,255,0.04);
                    border-radius:10px; border:1px solid rgba(255,255,255,0.07);">
                    <div style="min-width:0;">
                        <div style="font-weight:600; font-size:0.9rem; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                            #${spot.spot} — ${displayName}
                        </div>
                        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">${email}</div>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center; flex-shrink:0; margin-left:10px;">
                        <span style="color:${statusColors[status]}; font-size:0.72rem; font-weight:600;
                            background:${statusColors[status]}18; padding:3px 9px; border-radius:20px; white-space:nowrap;">
                            <i class="fa-solid ${statusIcons[status]}"></i> ${statusLabels[status]}
                        </span>
                        ${status !== 'attended' ? `
                            <button class="roster-mark-btn" data-uid="${spot.userId}" data-status="attended"
                                title="Marcar como Asistió"
                                style="background:rgba(42,157,143,0.15); border:1px solid rgba(42,157,143,0.3);
                                    color:#2a9d8f; padding:6px 10px; border-radius:7px; cursor:pointer; font-size:0.8rem;">
                                <i class="fa-solid fa-check"></i>
                            </button>` : ''}
                        ${status !== 'no_show' ? `
                            <button class="roster-mark-btn" data-uid="${spot.userId}" data-status="no_show"
                                title="Marcar como Falta"
                                style="background:rgba(230,57,70,0.1); border:1px solid rgba(230,57,70,0.25);
                                    color:#e63946; padding:6px 10px; border-radius:7px; cursor:pointer; font-size:0.8rem;">
                                <i class="fa-solid fa-xmark"></i>
                            </button>` : ''}
                    </div>
                </div>`;
        });

        content.innerHTML = html;

        content.querySelectorAll('.roster-mark-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const uid = btn.dataset.uid;
                const status = btn.dataset.status;
                btn.disabled = true;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

                const { error } = await supabase.rpc('mark_attendance', {
                    p_class_id: cls.id,
                    p_user_id: uid,
                    p_status: status,
                    p_admin_id: state.currentUser.id
                });

                if (error) {
                    showToast(`Error: ${error.message}`, 'error');
                    btn.disabled = false;
                    btn.innerHTML = status === 'attended' ? '<i class="fa-solid fa-check"></i>' : '<i class="fa-solid fa-xmark"></i>';
                } else {
                    showToast(`✓ Asistencia actualizada`);
                    showRosterModal(cls);
                }
            });
        });
    }

    /* ----------------------- 4. Admin Spot Choice Modal ----------------------- */
    function showAdminSpotChoiceModal(cls, spotNum) {
        let choiceModal = document.getElementById('adminSpotChoiceModal');
        if (!choiceModal) {
            choiceModal = document.createElement('div');
            choiceModal.id = 'adminSpotChoiceModal';
            choiceModal.className = 'modal-overlay';
            document.body.appendChild(choiceModal);
        }

        choiceModal.innerHTML = `
            <div class="modal-content" style="max-width:420px; text-align:center;">
                <button class="close-btn" id="closeAdminChoiceModal" aria-label="Cerrar">&times;</button>
                <div class="modal-header" style="padding-bottom:12px;">
                    <i class="fa-solid fa-shield-halved" style="font-size:2rem; color:var(--accent-gold); margin-bottom:8px;"></i>
                    <h2 style="font-size:1.4rem;">Reservar Lugar <span style="color:var(--accent-gold);">#${spotNum}</span></h2>
                    <p style="color:var(--text-muted); font-size:0.88rem;">${cls.discipline} &middot; ${cls.time12 || ''}</p>
                </div>
                <div style="display:flex; flex-direction:column; gap:14px; padding:0 8px 8px;">
                    <button id="adminChoiceSelf" style="
                        background:linear-gradient(135deg,rgba(42,157,143,0.15),rgba(42,157,143,0.05));
                        border:1px solid rgba(42,157,143,0.4); color:#2a9d8f;
                        padding:16px 20px; border-radius:14px; cursor:pointer;
                        font-family:inherit; font-size:0.95rem; font-weight:600;
                        display:flex; align-items:center; gap:12px; text-align:left; transition:all 0.2s;
                    ">
                        <i class="fa-solid fa-user-shield" style="font-size:1.3rem; flex-shrink:0;"></i>
                        <div>
                            <div>Para m&#237; mismo</div>
                            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:400; margin-top:2px;">Reserva est&#225;ndar a tu nombre</div>
                        </div>
                    </button>
                    <button id="adminChoiceClient" style="
                        background:linear-gradient(135deg,rgba(201,169,110,0.15),rgba(201,169,110,0.05));
                        border:1px solid rgba(201,169,110,0.4); color:var(--accent-gold);
                        padding:16px 20px; border-radius:14px; cursor:pointer;
                        font-family:inherit; font-size:0.95rem; font-weight:600;
                        display:flex; align-items:center; gap:12px; text-align:left; transition:all 0.2s;
                    ">
                        <i class="fa-solid fa-user-plus" style="font-size:1.3rem; flex-shrink:0;"></i>
                        <div>
                            <div>Para un cliente</div>
                            <div style="font-size:0.75rem; color:var(--text-muted); font-weight:400; margin-top:2px;">Reserva asistida &middot; elige si descontamos cr&#233;dito</div>
                        </div>
                    </button>
                </div>
            </div>`;

        choiceModal.classList.add('active');
        document.body.style.overflow = 'hidden';

        const closeChoice = () => { choiceModal.classList.remove('active'); document.body.style.overflow = 'auto'; };
        document.getElementById('closeAdminChoiceModal').onclick = closeChoice;
        choiceModal.onclick = (e) => { if (e.target === choiceModal) closeChoice(); };

        document.getElementById('adminChoiceSelf').onclick = () => {
            closeChoice();
            if (controllers.bookingController) {
                // Emulate client click variables locally
                const reserveModal = document.getElementById('reserveModal');
                const meta = state.currentUser.user_metadata || {};
                const sel = document.getElementById('reserveDisplayName');
                if (sel) sel.innerHTML = `<option value="name">Nombre: ${meta.full_name || state.currentUser.email.split('@')[0]}</option>`;
                const spotLabel = document.getElementById('reserveSpotLabel');
                if (spotLabel) spotLabel.textContent = `Lugar #${spotNum}`;
                const classLabel = document.getElementById('reserveClassLabel');
                if (classLabel) classLabel.textContent = `${cls.discipline}`;

                // Set pending spot in booking controller via scope mapping or direct click emulation
                const spotDivs = document.getElementById('spotsGrid')?.children;
                if (spotDivs && spotDivs[spotNum - 1]) {
                    // Temporarily bypass admin condition to trigger normal client flow inside bookingController
                    const originalRole = state.currentUser.role;
                    state.currentUser.role = 'client';
                    spotDivs[spotNum - 1].click();
                    state.currentUser.role = originalRole;
                }
            }
        };

        document.getElementById('adminChoiceClient').onclick = () => {
            closeChoice();
            showAdminBookModal(cls, spotNum);
        };
    }

    /* ----------------------- 5. Client Assisted Booking Modal ----------------------- */
    function showAdminBookModal(cls, spotNum) {
        let modal = document.getElementById('adminBookModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'adminBookModal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-content" style="max-width:460px; max-height:88vh; overflow-y:auto;">
                <button class="close-btn" id="closeAdminBookModal" aria-label="Cerrar">&times;</button>
                <div class="modal-header" style="padding-bottom:12px;">
                    <i class="fa-solid fa-user-plus" style="font-size:2rem; color:var(--accent-gold); margin-bottom:8px;"></i>
                    <h2 style="font-size:1.35rem;">Reserva Asistida</h2>
                    <div style="display:inline-flex; align-items:center; gap:8px;
                        background:rgba(201,169,110,0.1); border:1px solid rgba(201,169,110,0.25);
                        border-radius:20px; padding:5px 14px; margin-top:6px;
                        font-size:0.8rem; color:var(--accent-gold); font-weight:600;">
                        <i class="fa-solid fa-location-dot"></i> Lugar #${spotNum} &middot; ${cls.discipline} &middot; ${cls.time12 || ''}
                    </div>
                </div>

                <div id="adminBookStep1" style="padding:0 4px;">
                    <p style="font-size:0.82rem; color:var(--text-muted); margin-bottom:12px;">
                        <i class="fa-solid fa-magnifying-glass" style="color:var(--accent-gold); margin-right:6px;"></i>
                        Busca al cliente por su correo electr&#243;nico
                    </p>
                    <div style="display:flex; gap:8px;">
                        <input id="adminBookEmail" type="email" placeholder="correo@cliente.com" autocomplete="off"
                            style="flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.15);
                                border-radius:10px; padding:11px 14px; color:#fff; font-family:inherit;
                                font-size:0.88rem; outline:none;"/>
                        <button id="adminBookSearchBtn" style="
                            background:linear-gradient(135deg,var(--accent-gold),#b8902e);
                            border:none; border-radius:10px; padding:11px 16px;
                            color:#1a1a2e; font-family:inherit; font-weight:700;
                            cursor:pointer; font-size:0.85rem; white-space:nowrap;
                            display:flex; align-items:center; gap:6px;">
                            <i class="fa-solid fa-magnifying-glass"></i> Buscar
                        </button>
                    </div>
                    <div id="adminBookSearchResult" style="margin-top:12px;"></div>
                </div>

                <div id="adminBookStep2" style="display:none; padding:0 4px;">
                    <div id="adminBookClientCard" style="
                        background:rgba(42,157,143,0.06); border:1px solid rgba(42,157,143,0.2);
                        border-radius:12px; padding:14px; margin-bottom:16px; font-size:0.82rem;
                    "></div>

                    <div style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.1);
                        border-radius:12px; padding:14px; margin-bottom:16px;">
                        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
                            <div>
                                <div style="font-size:0.88rem; font-weight:600; color:#fff; margin-bottom:3px;">
                                    <i class="fa-solid fa-coins" style="color:var(--accent-gold); margin-right:6px;"></i>
                                    Descontar cr&#233;dito al cliente
                                </div>
                                <div id="adminBookDeductHint" style="font-size:0.73rem; color:var(--text-muted); line-height:1.4;"></div>
                            </div>
                            <label style="flex-shrink:0; position:relative; display:inline-block; width:48px; height:26px; cursor:pointer;">
                                <input type="checkbox" id="adminBookDeductToggle" checked
                                    style="opacity:0; width:0; height:0; position:absolute;">
                                <span id="adminBookToggleTrack" style="position:absolute; inset:0; border-radius:26px;
                                    background:linear-gradient(135deg,#2a9d8f,#1a7a6e); transition:background 0.3s;"></span>
                                <span id="adminBookToggleThumb" style="position:absolute; left:4px; top:4px;
                                    width:18px; height:18px; border-radius:50%; background:#fff;
                                    transition:transform 0.3s; transform:translateX(22px);"></span>
                            </label>
                        </div>
                    </div>

                    <div style="display:flex; gap:10px;">
                        <button id="adminBookBackBtn" style="
                            flex:1; background:rgba(255,255,255,0.06); border:1px solid rgba(255,255,255,0.12);
                            color:var(--text-muted); padding:12px; border-radius:12px;
                            font-family:inherit; font-size:0.88rem; cursor:pointer;
                            display:flex; align-items:center; justify-content:center; gap:7px;">
                            <i class="fa-solid fa-arrow-left"></i> Atr&#225;s
                        </button>
                        <button id="adminBookConfirmBtn" style="
                            flex:2; background:linear-gradient(135deg,var(--accent-gold),#b8902e);
                            border:none; color:#1a1a2e; padding:12px 20px; border-radius:12px;
                            font-family:inherit; font-size:0.92rem; font-weight:700; cursor:pointer;
                            display:flex; align-items:center; justify-content:center; gap:8px;">
                            <i class="fa-solid fa-check"></i> Confirmar Reserva
                        </button>
                    </div>
                </div>
            </div>`;

        modal.classList.add('active');
        document.body.style.overflow = 'hidden';

        let foundClient = null;

        const closeModal = () => { modal.classList.remove('active'); document.body.style.overflow = 'auto'; foundClient = null; };
        document.getElementById('closeAdminBookModal').onclick = closeModal;
        modal.onclick = (e) => { if (e.target === modal) closeModal(); };

        const deductToggle = document.getElementById('adminBookDeductToggle');
        const toggleTrack = document.getElementById('adminBookToggleTrack');
        const toggleThumb = document.getElementById('adminBookToggleThumb');
        const deductHint = document.getElementById('adminBookDeductHint');

        function syncToggleUI() {
            const on = deductToggle.checked;
            toggleTrack.style.background = on ? 'linear-gradient(135deg,#2a9d8f,#1a7a6e)' : 'rgba(255,255,255,0.12)';
            toggleThumb.style.transform = on ? 'translateX(22px)' : 'translateX(0px)';
            deductHint.textContent = on
                ? 'Se descontará 1 crédito de la cuenta del cliente al confirmar.'
                : 'El lugar queda reservado sin afectar los créditos del cliente (pago externo).';
        }
        syncToggleUI();
        deductToggle.onchange = syncToggleUI;

        const step1 = document.getElementById('adminBookStep1');
        const step2 = document.getElementById('adminBookStep2');

        async function doSearch() {
            const email = document.getElementById('adminBookEmail').value.trim();
            if (!email) return showToast('Ingresa un email para buscar', 'error');
            const searchBtn = document.getElementById('adminBookSearchBtn');
            searchBtn.disabled = true;
            searchBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

            const { data: profile, error } = await supabase.rpc('admin_search_user', { p_email: email });

            searchBtn.disabled = false;
            searchBtn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Buscar';

            const searchResult = document.getElementById('adminBookSearchResult');
            if (error || !profile) {
                searchResult.innerHTML = `<div style="color:#e63946; font-size:0.82rem; padding:10px 14px; border-radius:8px;
                    background:rgba(230,57,70,0.08); border:1px solid rgba(230,57,70,0.2);
                    display:flex; align-items:center; gap:8px;">
                    <i class="fa-solid fa-triangle-exclamation"></i> No se encontró ningún usuario con ese email.
                </div>`;
                return;
            }

            foundClient = profile;
            const displayName = profile.full_name || profile.nickname || profile.email_fallback;
            const indoor = profile.credits_indoor ?? 0;
            const train = profile.credits_train ?? 0;
            const pilates = profile.credits_pilates ?? 0;
            const open = profile.credits_open ?? 0;
            const total = indoor + train + pilates + open;

            searchResult.innerHTML = `
                <div style="background:rgba(42,157,143,0.08); border:1px solid rgba(42,157,143,0.25);
                    border-radius:10px; padding:12px; font-size:0.81rem;
                    display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap;">
                    <div>
                        <div style="color:#fff; font-weight:700; font-size:0.9rem;">${displayName}</div>
                        <div style="color:var(--text-muted); font-size:0.75rem;">${profile.email_fallback}</div>
                        <div style="color:#2a9d8f; font-weight:600; margin-top:4px;">${total} crédito(s) disponible(s)</div>
                    </div>
                    <button id="adminBookNextBtn" style="
                        background:linear-gradient(135deg,var(--accent-gold),#b8902e);
                        border:none; color:#1a1a2e; padding:9px 16px; border-radius:9px;
                        font-family:inherit; font-weight:700; font-size:0.82rem; cursor:pointer;
                        display:flex; align-items:center; gap:6px; flex-shrink:0;">
                        Continuar <i class="fa-solid fa-arrow-right"></i>
                    </button>
                </div>`;

            document.getElementById('adminBookClientCard').innerHTML = `
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:10px;">
                    <div style="width:38px; height:38px; border-radius:50%;
                        background:linear-gradient(135deg,var(--accent-gold),#b8902e);
                        display:flex; align-items:center; justify-content:center;
                        color:#1a1a2e; font-size:1rem; font-weight:700; flex-shrink:0;">
                        ${displayName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div style="color:#fff; font-weight:700; font-size:0.9rem;">${displayName}</div>
                        <div style="color:var(--text-muted); font-size:0.73rem;">${profile.email_fallback}</div>
                    </div>
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; font-size:0.74rem;">
                    <div style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);border-radius:7px;padding:6px;text-align:center;">
                        <i class="fa-solid fa-bicycle" style="color:var(--accent-gold);"></i>
                        <div style="font-weight:700;color:#fff;">${indoor}</div><div style="color:var(--text-muted);">Indoor</div>
                    </div>
                    <div style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);border-radius:7px;padding:6px;text-align:center;">
                        <i class="fa-solid fa-dumbbell" style="color:var(--accent-gold);"></i>
                        <div style="font-weight:700;color:#fff;">${train}</div><div style="color:var(--text-muted);">Train</div>
                    </div>
                    <div style="background:rgba(201,169,110,0.06);border:1px solid rgba(201,169,110,0.15);border-radius:7px;padding:6px;text-align:center;">
                        <i class="fa-solid fa-child-reaching" style="color:var(--accent-gold);"></i>
                        <div style="font-weight:700;color:#fff;">${pilates}</div><div style="color:var(--text-muted);">Pilates</div>
                    </div>
                    <div style="background:rgba(42,157,143,0.08);border:1px solid rgba(42,157,143,0.2);border-radius:7px;padding:6px;text-align:center;">
                        <i class="fa-solid fa-crown" style="color:#2a9d8f;"></i>
                        <div style="font-weight:700;color:#2a9d8f;">${open}</div><div style="color:var(--text-muted);">VIP</div>
                    </div>
                </div>`;

            document.getElementById('adminBookNextBtn').onclick = () => { step1.style.display = 'none'; step2.style.display = 'block'; };
        }

        document.getElementById('adminBookSearchBtn').onclick = doSearch;
        document.getElementById('adminBookEmail').onkeydown = (e) => { if (e.key === 'Enter') doSearch(); };
        document.getElementById('adminBookBackBtn').onclick = () => { step2.style.display = 'none'; step1.style.display = 'block'; };

        document.getElementById('adminBookConfirmBtn').onclick = async () => {
            if (!foundClient) return;
            const deductCredits = deductToggle.checked;
            const displayName = foundClient.full_name || foundClient.nickname || foundClient.email_fallback;
            const confirmBtn = document.getElementById('adminBookConfirmBtn');
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Procesando...';

            try {
                const spotData = { spot: spotNum, userId: foundClient.id, displayName, bookedBy: state.currentUser.email };
                const { error } = await adminBookReservation(
                    cls.id,
                    foundClient.id,
                    state.currentUser.id,
                    spotData,
                    deductCredits
                );

                if (error) {
                    if (error.message.includes('cr\u00e9ditos')) {
                        throw new Error('El cliente no tiene cr\u00e9ditos suficientes. Desactiva el descuento o asigna cr\u00e9ditos primero.');
                    }
                    throw error;
                }

                const creditMsg = deductCredits ? ' \u00b7 1 cr\u00e9dito descontado' : ' \u00b7 sin descuento de cr\u00e9dito';
                showToast(`\u2713 Lugar #${spotNum} reservado para ${displayName}${creditMsg}`, 'success');
                closeModal();
                if (controllers.classController) {
                    controllers.classController.renderDailyClasses();
                }
            } catch (err) {
                showToast(err.message, 'error');
                confirmBtn.disabled = false;
                confirmBtn.innerHTML = '<i class="fa-solid fa-check"></i> Confirmar Reserva';
            }
        };
    }

    /* ----------------------- 6. Auto-Cleanup Function ----------------------- */
    async function performAutoCleanup() {
        if (!isAdmin(state.currentUser)) return;
        const yesterday = new Date(getChetumalDate());
        yesterday.setDate(yesterday.getDate() - 1);
        const isoLimit = getISOFromDate(yesterday);

        console.log("Running Cleanup for dates <", isoLimit);

        const { count, error } = await supabase
            .from('classes')
            .delete({ count: 'exact' })
            .lt('date', isoLimit);

        if (error) {
            console.warn("Cleanup error:", error);
        } else if (count > 0) {
            console.log(`✓ Cleanup: Removed ${count} old classes.`);
        }
    }

    /* ----------------------- 7. Inactive Days Manager ----------------------- */
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
        inactiveDayModal.addEventListener('click', (e) => {
            if (e.target === inactiveDayModal) {
                inactiveDayModal.classList.remove('active');
                inactiveDayForm?.reset();
            }
        });
    }

    if (inactiveDayForm) {
        inactiveDayForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const type = document.getElementById('inactiveType').value;
            const weekday = parseInt(document.getElementById('inactiveWeekday').value);
            const date = document.getElementById('inactiveDate').value;

            const record = type === 'weekday' ? { type, weekday } : { type: 'specific', date };

            const { error } = await supabase.from('inactive_days').insert([record]);
            if (error) {
                showToast(`Error: ${error.message}. Asegúrate de crear la tabla en Supabase.`, 'error');
            } else {
                if (controllers.classController) {
                    await controllers.classController.loadInactiveDays();
                    controllers.classController.buildDatePills();
                }
                inactiveDayModal.classList.remove('active');
                inactiveDayForm.reset();
                showToast('✓ Día marcado como inactivo');
            }
        });
    }

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

    /* ----------------------- 8. Add Class Flow & Uploads ----------------------- */
    if (coachFileInput) {
        coachFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            coachImgPreview.style.display = 'block';
            const previewImg = coachImgPreview.querySelector('img');
            previewImg.src = URL.createObjectURL(file);
            previewImg.style.opacity = '0.5';

            try {
                // Compressing file locally via controllers helper callback or directly
                const reader = new FileReader();
                reader.readAsDataURL(file);
                reader.onload = async (event) => {
                    const img = new Image();
                    img.src = event.target.result;
                    img.onload = async () => {
                        const canvas = document.createElement('canvas');
                        const scale = 200 / img.width;
                        if (scale < 1) {
                            canvas.width = 200;
                            canvas.height = img.height * scale;
                        } else {
                            canvas.width = img.width;
                            canvas.height = img.height;
                        }
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                        canvas.toBlob(async (blob) => {
                            const compressed = new File([blob], file.name, { type: 'image/jpeg' });
                            const fileName = `coach_${Date.now()}.jpg`;
                            const { data, error } = await supabase.storage.from('coaches').upload(fileName, compressed);

                            if (error) {
                                showToast(`Error al subir imagen: ${error.message}`, 'error');
                                previewImg.style.opacity = '1';
                                return;
                            }

                            const { data: { publicUrl } } = supabase.storage.from('coaches').getPublicUrl(fileName);
                            document.getElementById('adminCoachImg').value = publicUrl;
                            previewImg.src = publicUrl;
                            previewImg.style.opacity = '1';
                            showToast('✓ Imagen optimizada y lista');
                        }, 'image/jpeg', 0.85);
                    };
                };
            } catch (err) {
                showToast(`Error al procesar: ${err.message}`, 'error');
                previewImg.style.opacity = '1';
            }
        });
    }

    function updateRecurrencePreview() {
        if (!recurrencePreview) return;
        const freq = recurrenceFreqEl?.value || 'none';
        const count = parseInt(recurrenceCountEl?.value) || 1;
        if (freq === 'none' || count < 2) {
            recurrencePreview.innerHTML = '';
            return;
        }
        const baseDate = new Date(state.selectedDateISO + 'T12:00:00');
        const dates = [state.selectedDateISO];
        for (let i = 1; i < count; i++) {
            const d = new Date(baseDate);
            if (freq === 'daily') d.setDate(baseDate.getDate() + i);
            if (freq === 'weekly') d.setDate(baseDate.getDate() + i * 7);
            dates.push(getISOFromDate(d));
        }
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
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

    if (recurrenceFreqEl) recurrenceFreqEl.addEventListener('change', updateRecurrencePreview);
    if (recurrenceCountEl) recurrenceCountEl.addEventListener('input', updateRecurrencePreview);

    if (addAdminClassBtn) {
        addAdminClassBtn.addEventListener('click', () => {
            if (adminClassModal) {
                const d = new Date(state.selectedDateISO + 'T12:00:00');
                const timeInput = document.getElementById('adminClassTime');
                if (d.getDay() === 6) {
                    if (timeInput) timeInput.value = "08:00";
                    showToast('Nota: Los sábados únicamente operamos a las 8:00 AM', 'info');
                }

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
            const discipline = document.getElementById('adminDiscipline').value;
            const time = document.getElementById('adminClassTime').value;
            const coachName = document.getElementById('adminCoachName').value;
            const coachImg = document.getElementById('adminCoachImg').value;
            const rawNote = document.getElementById('adminClassNote').value;

            const dCheck = new Date(state.selectedDateISO + 'T12:00:00');
            if (dCheck.getDay() === 6 && time !== "08:00") {
                return showToast('Error: Los sábados únicamente se permiten clases a las 08:00 AM', 'error');
            }

            const note = `[T:${time}]${rawNote}`;
            const recurrenceFreq = recurrenceFreqEl?.value || 'none';
            const recurrenceCount = parseInt(recurrenceCountEl?.value) || 1;

            if (!coachImg) return showToast('Espera a que suba la imagen...', 'error');

            const saveBtn = document.getElementById('saveClassBtn');
            const originalBtnText = saveBtn.innerHTML;
            saveBtn.disabled = true;
            saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creando...';

            const baseDate = new Date(state.selectedDateISO + 'T12:00:00');
            const baseClass = {
                date: state.selectedDateISO, discipline, coach_name: coachName,
                coach_img: coachImg, note, capacity: DISCIPLINE_CAPACITY[discipline],
                occupied_spots: [], class_time: time
            };
            const classesToInsert = [baseClass];

            if (recurrenceFreq !== 'none' && recurrenceCount > 1) {
                for (let i = 1; i < recurrenceCount; i++) {
                    const d = new Date(baseDate);
                    if (recurrenceFreq === 'daily') d.setDate(baseDate.getDate() + i);
                    if (recurrenceFreq === 'weekly') d.setDate(baseDate.getDate() + i * 7);

                    const iso = getISOFromDate(d);
                    const dayNum = d.getDay();

                    if (dayNum === 0) continue;

                    let finalNote = note;
                    if (dayNum === 6) {
                        finalNote = `[T:08:00]${rawNote}`;
                    }

                    classesToInsert.push({ ...baseClass, date: iso, note: finalNote, class_time: dayNum === 6 ? '08:00' : time });
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
                if (controllers.classController) {
                    controllers.classController.renderDailyClasses();
                }
                showToast(`✓ ${classesToInsert.length} clase${classesToInsert.length > 1 ? 's' : ''} programada${classesToInsert.length > 1 ? 's' : ''}`);
            }
            saveBtn.disabled = false;
            saveBtn.innerHTML = originalBtnText;
        });
    }

    return {
        loadFailedPayments,
        showRosterModal,
        showAdminSpotChoiceModal,
        showAdminBookModal,
        performAutoCleanup
    };
}
