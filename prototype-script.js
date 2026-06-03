/* ============================================================
   HIGH-FIDELITY LUXURY UI/UX SANDBOX ENGINE
   Mae Wellness Club Prototype Logic
   ============================================================ */

// Mock Databases for high-fidelity offline demonstration
const MOCK_COACHES = {
  'Pilates': [
    { name: 'Coach Valeria T.', img: 'pilates_deseada.jpg', note: 'Enfoque en alineación y core. Traer calcetines antideslizantes.' },
    { name: 'Coach Jessica H.', img: 'pilates_deseada.jpg', note: 'Flexibilidad profunda y resistencia. Nivel multinivel.' }
  ],
  'Train': [
    { name: 'Coach Eduardo R.', img: 'train_deseada.jpg', note: 'Full-body HIIT & Fuerza. Hidratación constante indispensable.' },
    { name: 'Coach Ana G.', img: 'train_deseada.jpg', note: 'Power Strength & Power Core. Traer toalla de entrenamiento.' }
  ],
  'Indoor Cycling': [
    { name: 'Coach Carlos M.', img: 'indoor_deseada.jpg', note: 'Beat & Power Ride. Intensidad cardiaca alta, lleva tu ritmo.' },
    { name: 'Coach Sofia L.', img: 'indoor_deseada.jpg', note: 'Sunset Rhythm ride. Música inmersiva electrónica y pop.' }
  ]
};

// Internal sandbox state machine
let sandboxState = {
  currentUser: null, // Holds profile when mock-logged in
  credits: {
    pilates: 8,
    cycling: 6,
    train: 5,
    vip: 0
  },
  reservations: [], // Current user bookings
  selectedDateISO: '',
  selectedClass: null,
  selectedSpot: null,
  activeFilter: 'all'
};

// Restore active filter preference from cache in sandbox
try {
  const cachedFilter = localStorage.getItem('mae_discipline_filter');
  if (cachedFilter) sandboxState.activeFilter = cachedFilter;
} catch (e) {
  console.warn("Error restoring sandbox active filter preference", e);
}

// Independent Toast Utility (respects safe spaces above bottom navigation tabs)
function showToast(message, type = 'success') {
  const existing = document.getElementById('siteToast');
  if (existing) existing.remove();
  
  const toast = document.createElement('div');
  toast.id = 'siteToast';
  toast.innerHTML = message;
  
  const colors = { success: '#2a9d8f', error: '#e63946', info: 'var(--text-gold)' };
  
  // Set premium styles positioned above the mobile sticky bottom tab bar
  Object.assign(toast.style, {
    position: 'fixed',
    bottom: window.innerWidth < 768 ? '85px' : '30px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: colors[type] || colors.success,
    color: '#fff',
    padding: '12px 28px',
    borderRadius: '30px',
    fontFamily: 'inherit',
    fontSize: '0.85rem',
    fontWeight: '600',
    zIndex: '99999',
    boxShadow: '0 8px 30px rgba(0,0,0,0.35)',
    transition: 'opacity 0.4s',
    opacity: '0',
    whiteSpace: 'nowrap'
  });
  
  document.body.appendChild(toast);
  
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });
  
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// Initialize dates starting today in Chetumal zone (UTC-5)
const getChetumalDate = () => {
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  return new Date(utc + (3600000 * -5));
};

const getISOFromDate = (d) => {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

const DAYS_ES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTHS_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

document.addEventListener('DOMContentLoaded', () => {
  const now = getChetumalDate();
  const todayISO = getISOFromDate(now);
  sandboxState.selectedDateISO = todayISO;
  try {
    const cachedDate = localStorage.getItem('mae_last_date');
    if (cachedDate && cachedDate >= todayISO) {
      sandboxState.selectedDateISO = cachedDate;
    }
  } catch (e) {
    console.warn("Error restoring sandbox selected date preference", e);
  }

  // 1. GENERATE DATE RIBBON
  initDateRibbon();

  // 2. INITIALIZE LISTENERS
  initInteractiveListeners();

  // 3. RENDER CORE DEMO CLASSES
  renderMockClasses();

  // 4. PRICE CARD GLOW POSITIONING
  initPriceCardGlow();
});

/* ============================================================
   DATE RIBBON GENERATION
   ============================================================ */
function initDateRibbon() {
  const dateStrip = document.getElementById('luxDateStrip');
  if (!dateStrip) return;
  dateStrip.innerHTML = '';

  const start = getChetumalDate();
  for (let i = 0; i < 7; i++) {
    const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
    const dayName = DAYS_ES[d.getDay()];
    const dayNum = d.getDate();
    const iso = getISOFromDate(d);

    const card = document.createElement('div');
    card.className = `date-luxury-card ${iso === sandboxState.selectedDateISO ? 'active' : ''}`;
    card.dataset.iso = iso;
    card.innerHTML = `
      <span class="date-day-name">${dayName}</span>
      <span class="date-day-num">${dayNum}</span>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.date-luxury-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      sandboxState.selectedDateISO = iso;
      try {
        localStorage.setItem('mae_last_date', iso);
      } catch (e) {
        console.warn("Error saving sandbox selected date", e);
      }
      document.getElementById('bookingDayDisplay').textContent = `Clases del ${dayNum} de ${MONTHS_ES[d.getMonth()]}`;
      renderMockClasses();
    });

    dateStrip.appendChild(card);
  }

  // Set initial header label based on selectedDateISO
  const activeDate = new Date(sandboxState.selectedDateISO + 'T12:00:00');
  document.getElementById('bookingDayDisplay').textContent = `Clases del ${activeDate.getDate()} de ${MONTHS_ES[activeDate.getMonth()]}`;

  // Auto-scroll the active pill into view so it's visible on load
  setTimeout(() => {
    const activeCard = dateStrip.querySelector('.date-luxury-card.active');
    if (activeCard) {
      activeCard.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, 100);
}

/* ============================================================
   MOCK GENERATOR FOR SESSIONS
   ============================================================ */
function getSessionsForDate(iso) {
  // Generate stable mock schedules based on day of week
  const dateObj = new Date(iso + 'T12:00:00');
  const day = dateObj.getDay();

  const sessions = [];
  
  if (day === 0) { // Sunday (Closed/Ludoteca only, generate 1 special train class)
    sessions.push({
      id: `${iso}-1`,
      discipline: 'Train',
      time: '09:00',
      coach: MOCK_COACHES['Train'][0].name,
      img: MOCK_COACHES['Train'][0].img,
      note: 'Entrenamiento Especial Familiar. Ludoteca abierta gratis.',
      occupied: [2, 5, 8],
      capacity: 8
    });
  } else { // Weekdays & Saturdays
    sessions.push({
      id: `${iso}-1`,
      discipline: 'Pilates',
      time: '07:00',
      coach: MOCK_COACHES['Pilates'][0].name,
      img: MOCK_COACHES['Pilates'][0].img,
      note: MOCK_COACHES['Pilates'][0].note,
      occupied: [1, 3],
      capacity: 4
    });
    
    sessions.push({
      id: `${iso}-2`,
      discipline: 'Indoor Cycling',
      time: '08:00',
      coach: MOCK_COACHES['Indoor Cycling'][0].name,
      img: MOCK_COACHES['Indoor Cycling'][0].img,
      note: MOCK_COACHES['Indoor Cycling'][0].note,
      occupied: [2, 4, 7, 9],
      capacity: 11
    });

    sessions.push({
      id: `${iso}-3`,
      discipline: 'Train',
      time: '09:00',
      coach: MOCK_COACHES['Train'][0].name,
      img: MOCK_COACHES['Train'][0].img,
      note: MOCK_COACHES['Train'][0].note,
      occupied: [1, 4, 6],
      capacity: 8
    });

    sessions.push({
      id: `${iso}-4`,
      discipline: 'Pilates',
      time: '18:00',
      coach: MOCK_COACHES['Pilates'][1].name,
      img: MOCK_COACHES['Pilates'][1].img,
      note: MOCK_COACHES['Pilates'][1].note,
      occupied: [1, 2, 4],
      capacity: 4
    });

    sessions.push({
      id: `${iso}-5`,
      discipline: 'Indoor Cycling',
      time: '19:00',
      coach: MOCK_COACHES['Indoor Cycling'][1].name,
      img: MOCK_COACHES['Indoor Cycling'][1].img,
      note: MOCK_COACHES['Indoor Cycling'][1].note,
      occupied: [1, 3, 5, 6, 8, 10, 11],
      capacity: 11
    });
  }

  // Inject any live active user reservations from sandboxState
  sandboxState.reservations.forEach(res => {
    if (res.date === iso) {
      const match = sessions.find(s => s.id === res.classId);
      if (match && !match.occupied.includes(res.spot)) {
        match.occupied.push(res.spot);
      }
    }
  });

  return sessions;
}

/* ============================================================
   RENDER CLASSES IN LIST
   ============================================================ */
function renderMockClasses() {
  const container = document.getElementById('luxClassList');
  if (!container) return;
  container.innerHTML = '';

  const sessions = getSessionsForDate(sandboxState.selectedDateISO);
  const filtered = sessions.filter(s => sandboxState.activeFilter === 'all' || s.discipline === sandboxState.activeFilter);

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center; padding: 40px; color:var(--text-muted);">
        <i class="fa-solid fa-cloud-sun" style="font-size:2rem; margin-bottom:10px;"></i>
        <p>No hay clases disponibles para esta disciplina hoy.</p>
      </div>
    `;
    return;
  }

  filtered.forEach(s => {
    const [hh, mm] = s.time.split(':').map(Number);
    const time12 = `${hh % 12 || 12}:${String(mm).padStart(2, '0')}`;
    const period = hh >= 12 ? 'PM' : 'AM';
    const freeSpotsCount = s.capacity - s.occupied.length;
    
    let badgeClass = 'green';
    let badgeLabel = `${freeSpotsCount} Libres`;
    if (freeSpotsCount === 0) {
      badgeClass = 'red';
      badgeLabel = 'Agotado';
    } else if (freeSpotsCount <= 2) {
      badgeClass = 'yellow';
      badgeLabel = 'Últimos lugares';
    }

    const card = document.createElement('div');
    card.className = `class-luxury-card ${sandboxState.selectedClass && sandboxState.selectedClass.id === s.id ? 'active' : ''}`;
    card.innerHTML = `
      <div class="class-card-left">
        <div class="class-time-box">
          <div class="class-time-main">${time12}</div>
          <div class="class-time-period">${period}</div>
        </div>
        <div class="class-meta-box">
          <div class="class-discipline-title">
            <i class="fa-solid ${s.discipline === 'Pilates' ? 'fa-child-reaching' : s.discipline === 'Train' ? 'fa-dumbbell' : 'fa-bicycle'}"></i>
            ${s.discipline}
          </div>
          <div class="class-coach-row">
            <img src="${s.img}" alt="" onerror="this.src='mae_logo.png';" />
            <span class="class-coach-name">${s.coach}</span>
          </div>
        </div>
      </div>
      <div class="class-card-right">
        <span class="class-availability-badge ${badgeClass}">${badgeLabel}</span>
        <i class="fa-solid fa-chevron-right arrow-indicator"></i>
      </div>
    `;

    card.addEventListener('click', () => {
      document.querySelectorAll('.class-luxury-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      selectClass(s);
    });

    container.appendChild(card);
  });

  // Re-sync selected class highlighted layout map if active
  if (sandboxState.selectedClass) {
    const refreshed = sessions.find(s => s.id === sandboxState.selectedClass.id);
    if (refreshed) {
      selectClass(refreshed);
    }
  }
}

/* ============================================================
   CLASS SELECT & LAYOUT RENDERING ENGINE
   ============================================================ */
function selectClass(session) {
  sandboxState.selectedClass = session;
  
  // Title mapping
  document.getElementById('studioMapTitle').textContent = `Distribución: ${session.discipline}`;
  
  // Render spotlight details
  const spotlight = document.getElementById('mapCoachSpotlight');
  if (spotlight) {
    spotlight.style.display = 'flex';
    document.getElementById('mapCoachImg').src = session.img;
    document.getElementById('mapCoachName').textContent = session.coach;
    document.getElementById('mapCoachInfo').textContent = `${session.discipline} Coach`;
    document.getElementById('mapClassNote').textContent = session.note || 'Traer toalla de microfibra y buena actitud.';
  }

  // Draw customized room
  const roomArea = document.getElementById('studioMapArea');
  if (!roomArea) return;
  roomArea.innerHTML = '';

  // Add the front instructor stage representation
  const stage = document.createElement('div');
  stage.className = 'studio-stage';
  stage.innerHTML = `<span class="stage-label">COACH / ESCENARIO</span>`;
  roomArea.appendChild(stage);

  // Check if current user already reserved a spot in this class
  const existingBooking = sandboxState.reservations.find(r => r.classId === session.id);

  if (session.discipline === 'Pilates') {
    // 4 Beds arranged symmetrically
    const grid = document.createElement('div');
    grid.className = 'pilates-room';
    
    for (let i = 1; i <= 4; i++) {
      const isOccupied = session.occupied.includes(i);
      const isMySpot = existingBooking && existingBooking.spot === i;
      
      const bed = document.createElement('div');
      bed.className = `reformer-bed ${isMySpot ? 'selected' : isOccupied ? 'occupied' : 'free'}`;
      bed.innerHTML = `
        <div class="reformer-carriage">
          <div class="reformer-shoulders">
            <span class="shoulder-pad"></span>
            <span class="shoulder-pad"></span>
          </div>
          <div class="reformer-headrest"></div>
        </div>
        <span class="bed-label">${i}</span>
      `;

      if (!isOccupied || isMySpot) {
        bed.addEventListener('click', () => triggerSpotSelect(i, bed));
      }
      grid.appendChild(bed);
    }
    roomArea.appendChild(grid);

  } else if (session.discipline === 'Indoor Cycling') {
    // 11 Spinning Bikes in stadium theater curved arcs
    const room = document.createElement('div');
    room.className = 'cycling-room';

    const layout = [
      { row: 'row-1', bikes: [1, 2, 3] },
      { row: 'row-2', bikes: [4, 5, 6, 7] },
      { row: 'row-3', bikes: [8, 9, 10, 11] }
    ];

    layout.forEach(rowData => {
      const rowDiv = document.createElement('div');
      rowDiv.className = `cycling-row ${rowData.row}`;
      
      rowData.bikes.forEach(bikeNum => {
        const isOccupied = session.occupied.includes(bikeNum);
        const isMySpot = existingBooking && existingBooking.spot === bikeNum;

        const bike = document.createElement('div');
        bike.className = `spinning-bike ${isMySpot ? 'selected' : isOccupied ? 'occupied' : 'free'}`;
        bike.innerHTML = `<span class="bike-number">${bikeNum}</span>`;

        if (!isOccupied || isMySpot) {
          bike.addEventListener('click', () => triggerSpotSelect(bikeNum, bike));
        }
        rowDiv.appendChild(bike);
      });
      room.appendChild(rowDiv);
    });
    roomArea.appendChild(room);

  } else {
    // Train: 8 Functional Zones
    const grid = document.createElement('div');
    grid.className = 'train-room';

    for (let i = 1; i <= 8; i++) {
      const isOccupied = session.occupied.includes(i);
      const isMySpot = existingBooking && existingBooking.spot === i;

      const zone = document.createElement('div');
      zone.className = `train-zone ${isMySpot ? 'selected' : isOccupied ? 'occupied' : 'free'}`;
      zone.innerHTML = `<span class="zone-number">${i}</span>`;

      if (!isOccupied || isMySpot) {
        zone.addEventListener('click', () => triggerSpotSelect(i, zone));
      }
      grid.appendChild(zone);
    }
    roomArea.appendChild(grid);
  }
}

/* ============================================================
   SPOT SELECTION & SLIDE-OUT CHECKOUT DRAWER
   ============================================================ */
function triggerSpotSelect(spotNum, element) {
  // 1. Guard check: Require Sandbox log-in to proceed to booking
  if (!sandboxState.currentUser) {
    showSandboxLoginOverlay();
    return;
  }

  // If user already booked this class, allow cancel info or show details
  const existingBooking = sandboxState.reservations.find(r => r.classId === sandboxState.selectedClass.id);
  if (existingBooking) {
    if (existingBooking.spot === spotNum) {
      showToast('Ya reservaste este spot. Ábrelo en tu menú de perfil para cancelar si lo deseas.', 'info');
      return;
    } else {
      showToast('Ya cuentas con una reserva en esta clase.', 'error');
      return;
    }
  }

  // Toggle active selections visually
  element.parentElement.querySelectorAll('.selected').forEach(el => {
    if (el !== element) el.classList.remove('selected');
  });

  element.classList.toggle('selected');
  
  if (element.classList.contains('selected')) {
    sandboxState.selectedSpot = spotNum;
    openCheckoutDrawer();
  } else {
    sandboxState.selectedSpot = null;
    closeCheckoutDrawer();
  }
}

function openCheckoutDrawer() {
  const drawer = document.getElementById('checkoutDrawer');
  if (!drawer) return;

  const session = sandboxState.selectedClass;
  const dateObj = new Date(sandboxState.selectedDateISO + 'T12:00:00');
  const dateFormatted = `${DAYS_ES[dateObj.getDay()]} ${dateObj.getDate()} de ${MONTHS_ES[dateObj.getMonth()]}`;

  document.getElementById('drawerDiscipline').textContent = session.discipline;
  document.getElementById('drawerCoach').textContent = session.coach;
  document.getElementById('drawerDateTime').textContent = `${dateFormatted} a las ${session.time} ${parseInt(session.time) >= 12 ? 'PM' : 'AM'}`;
  document.getElementById('drawerSpot').textContent = `Spot #${sandboxState.selectedSpot}`;

  // Balance Check
  const key = session.discipline.toLowerCase().includes('cycling') ? 'cycling' : session.discipline.toLowerCase();
  const availableCredits = sandboxState.credits[key] || 0;
  
  const balanceCount = document.getElementById('drawerCreditsCount');
  balanceCount.textContent = `${availableCredits} Clases`;
  
  if (availableCredits <= 0) {
    balanceCount.style.color = '#e63946';
    balanceCount.textContent = '0 Clases - Compra más abajo';
  } else {
    balanceCount.style.color = '#2a9d8f';
  }

  // Reset drawer interactive confirmation state
  document.getElementById('successScreen').classList.remove('active');
  resetSlideConfirm();

  drawer.classList.add('active');
}

function closeCheckoutDrawer() {
  document.getElementById('checkoutDrawer').classList.remove('active');
  sandboxState.selectedSpot = null;
  // Reload visual map
  if (sandboxState.selectedClass) {
    selectClass(sandboxState.selectedClass);
  }
}

/* ============================================================
   SLIDE/HOLD TO CONFIRM UX ENGINE
   ============================================================ */
let isDragging = false;
let startX = 0;
let dragLimit = 0;

function resetSlideConfirm() {
  const slider = document.getElementById('slideSlider');
  const btn = document.getElementById('slideConfirmBtn');
  const text = document.getElementById('slideText');

  if (!slider || !btn) return;
  
  slider.style.transform = 'translateX(0px)';
  slider.style.left = '5px';
  text.textContent = 'Desliza para Confirmar';
  text.style.opacity = '1';
}

function initSlideConfirm() {
  const btn = document.getElementById('slideConfirmBtn');
  const slider = document.getElementById('slideSlider');

  if (!btn || !slider) return;

  const startDrag = (e) => {
    isDragging = true;
    startX = e.type === 'touchstart' ? e.touches[0].clientX : e.clientX;
    dragLimit = btn.clientWidth - slider.clientWidth - 10;
    slider.style.cursor = 'grabbing';
  };

  const moveDrag = (e) => {
    if (!isDragging) return;
    const currentX = e.type === 'touchmove' ? e.touches[0].clientX : e.clientX;
    let delta = currentX - startX;

    if (delta < 0) delta = 0;
    if (delta > dragLimit) delta = dragLimit;

    slider.style.transform = `translateX(${delta}px)`;
    
    // Fade out text as slide progresses
    const progress = delta / dragLimit;
    document.getElementById('slideText').style.opacity = 1 - progress * 1.5;

    if (delta >= dragLimit - 5) {
      isDragging = false;
      commitBookingSandbox();
    }
  };

  const stopDrag = () => {
    if (!isDragging) return;
    isDragging = false;
    slider.style.cursor = 'grab';
    
    // Snap back animation
    slider.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
    slider.style.transform = 'translateX(0px)';
    
    const txt = document.getElementById('slideText');
    txt.style.transition = 'opacity 0.3s';
    txt.style.opacity = '1';
    
    setTimeout(() => {
      slider.style.transition = 'none';
      txt.style.transition = 'none';
    }, 300);
  };

  // Touch Events for mobile, Mouse Events for desktop
  slider.addEventListener('mousedown', startDrag);
  window.addEventListener('mousemove', moveDrag);
  window.addEventListener('mouseup', stopDrag);

  slider.addEventListener('touchstart', startDrag);
  window.addEventListener('touchmove', moveDrag);
  window.addEventListener('touchend', stopDrag);

  // Click Fallback for desktop accessibility
  btn.addEventListener('click', (e) => {
    if (e.target !== slider && !isDragging) {
      commitBookingSandbox();
    }
  });
}

function commitBookingSandbox() {
  const session = sandboxState.selectedClass;
  const key = session.discipline.toLowerCase().includes('cycling') ? 'cycling' : session.discipline.toLowerCase();
  
  if (sandboxState.credits[key] <= 0) {
    showToast('Saldo insuficiente. Compra un paquete de clases abajo.', 'error');
    resetSlideConfirm();
    return;
  }

  // Deduct credit
  sandboxState.credits[key]--;
  
  // Register reservation
  const newBooking = {
    id: `book-${Date.now()}`,
    classId: session.id,
    discipline: session.discipline,
    coach: session.coach,
    time: session.time,
    date: sandboxState.selectedDateISO,
    spot: sandboxState.selectedSpot
  };

  sandboxState.reservations.push(newBooking);

  // Set occupied locally in mock session array
  session.occupied.push(sandboxState.selectedSpot);

  // Update profile dashboards
  updateProfileDashboard();

  // Show visual Success panel
  const success = document.getElementById('successScreen');
  document.getElementById('successMsg').innerHTML = `Tu reserva para <strong>${session.discipline}</strong> con <strong>${session.coach}</strong> el <strong>Lugar #${sandboxState.selectedSpot}</strong> ha sido agendada con éxito.`;
  success.classList.add('active');
  
  showToast('✓ Reserva confirmada', 'success');
}

/* ============================================================
   SANDBOX LOGIN OVERRIDES
   ============================================================ */
function showSandboxLoginOverlay() {
  document.getElementById('sandboxLoginModal').classList.add('active');
}

function closeSandboxLoginOverlay() {
  document.getElementById('sandboxLoginModal').classList.remove('active');
}

function performMockLogin(email) {
  const username = email.split('@')[0];
  sandboxState.currentUser = {
    email: email,
    name: username.charAt(0).toUpperCase() + username.slice(1)
  };

  // Update navbar pill
  document.getElementById('profileTriggerText').textContent = sandboxState.currentUser.name;
  
  closeSandboxLoginOverlay();
  showToast(`Bienvenido, ${sandboxState.currentUser.name} a Team Mae!`, 'success');
  updateProfileDashboard();
}

/* ============================================================
   PROFILE DRAWER & RESERVATION LISTINGS
   ============================================================ */
function openProfileDrawer() {
  updateProfileDashboard();
  document.getElementById('profileDrawer').classList.add('active');
}

function closeProfileDrawer() {
  document.getElementById('profileDrawer').classList.remove('active');
}

function updateProfileDashboard() {
  if (!sandboxState.currentUser) return;

  // Greetings
  document.getElementById('profileDrawerGreeting').textContent = `Hola, ${sandboxState.currentUser.name}`;
  
  // Total Credit breakdown
  const pilates = sandboxState.credits.pilates;
  const cycling = sandboxState.credits.cycling;
  const train = sandboxState.credits.train;
  const vip = sandboxState.credits.vip;
  const total = pilates + cycling + train + vip;

  document.getElementById('profileCreditsCountTotal').textContent = total;
  document.getElementById('profileCreditsPilates').textContent = pilates;
  document.getElementById('profileCreditsCycling').textContent = cycling;
  document.getElementById('profileCreditsTrain').textContent = train;
  document.getElementById('profileCreditsVip').textContent = vip;

  // Reservations List
  const list = document.getElementById('profileReservationsList');
  if (!list) return;
  list.innerHTML = '';

  if (sandboxState.reservations.length === 0) {
    list.innerHTML = `
      <p style="text-align:center; color:var(--text-muted); font-size:0.85rem; font-style:italic; padding:20px;">
        No tienes clases reservadas aún.
      </p>
    `;
    return;
  }

  sandboxState.reservations.forEach(res => {
    const dateObj = new Date(res.date + 'T12:00:00');
    const dateStr = `${DAYS_ES[dateObj.getDay()]} ${dateObj.getDate()} de ${MONTHS_ES[dateObj.getMonth()]}`;

    const card = document.createElement('div');
    card.style.cssText = `
      background: rgba(255,255,255,0.03);
      border: var(--border-muted);
      border-radius: 8px;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    `;
    card.innerHTML = `
      <div>
        <div style="font-weight:700; font-size:0.9rem; color:#fff;">${res.discipline}</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
          ${dateStr} - ${res.time} hs
        </div>
        <span style="display:inline-block; font-size:0.7rem; background:rgba(201,169,110,0.1); border:1px solid rgba(201,169,110,0.3); color:var(--text-gold); border-radius:4px; padding:2px 6px; margin-top:4px;">Spot #${res.spot}</span>
      </div>
      <button class="btn-cancel-reservation" data-id="${res.id}" style="background:transparent; border:none; color:#e63946; cursor:pointer; font-size:0.85rem; font-weight:700;">
        Cancelar
      </button>
    `;

    card.querySelector('.btn-cancel-reservation').addEventListener('click', () => {
      cancelReservationSandbox(res.id);
    });

    list.appendChild(card);
  });
}

function cancelReservationSandbox(resId) {
  const index = sandboxState.reservations.findIndex(r => r.id === resId);
  if (index === -1) return;

  const res = sandboxState.reservations[index];
  
  // Refund credit
  const key = res.discipline.toLowerCase().includes('cycling') ? 'cycling' : res.discipline.toLowerCase();
  sandboxState.credits[key]++;

  // Remove from session occupied spot list
  const sessions = getSessionsForDate(res.date);
  const match = sessions.find(s => s.id === res.classId);
  if (match) {
    const idx = match.occupied.indexOf(res.spot);
    if (idx !== -1) match.occupied.splice(idx, 1);
  }

  // Remove booking item
  sandboxState.reservations.splice(index, 1);

  // Update UI
  updateProfileDashboard();
  renderMockClasses();
  showToast('✓ Reserva cancelada y crédito devuelto.', 'success');
}

/* ============================================================
   INTERACTIVE GENERAL LISTENERS & TRIGGERS
   ============================================================ */
function initInteractiveListeners() {
  
  // Profile Trigger (Login / Dashboard)
  const profileBtn = document.getElementById('profileTriggerBtn');
  if (profileBtn) {
    profileBtn.addEventListener('click', () => {
      if (sandboxState.currentUser) {
        openProfileDrawer();
      } else {
        showSandboxLoginOverlay();
      }
    });
  }

  // Closing buttons
  document.getElementById('drawerCloseBtn').addEventListener('click', closeCheckoutDrawer);
  document.getElementById('loginCloseBtn').addEventListener('click', closeSandboxLoginOverlay);
  document.getElementById('profileDrawerCloseBtn').addEventListener('click', closeProfileDrawer);

  // Done button in success booking screen
  document.getElementById('successDoneBtn').addEventListener('click', () => {
    closeCheckoutDrawer();
    resetSlideConfirm();
  });

  // Login handlers
  document.getElementById('btnGoogleSandbox').addEventListener('click', () => {
    performMockLogin('google.demo@maewellness.com');
  });

  document.getElementById('sandboxLoginForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('sandboxEmail').value;
    performMockLogin(email);
  });

  document.getElementById('profileLogoutBtn').addEventListener('click', () => {
    sandboxState.currentUser = null;
    sandboxState.reservations = [];
    document.getElementById('profileTriggerText').textContent = 'Iniciar Sesión';
    closeProfileDrawer();
    renderMockClasses();
    showToast('Sesión cerrada correctamente', 'info');
  });

  // Discipline Filter Bar buttons
  const filters = document.querySelectorAll('.discipline-filter-bar .filter-btn');
  
  // Highlight active filter on load
  filters.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.discipline === sandboxState.activeFilter);
  });

  filters.forEach(f => {
    f.addEventListener('click', () => {
      filters.forEach(btn => btn.classList.remove('active'));
      f.classList.add('active');
      sandboxState.activeFilter = f.dataset.discipline;
      try {
        localStorage.setItem('mae_discipline_filter', sandboxState.activeFilter);
      } catch (e) {
        console.warn("Error saving sandbox filter preference", e);
      }
      renderMockClasses();
    });
  });

  // Fast-Reserve search widget
  const fastBtn = document.getElementById('fastReserveSubmitBtn');
  if (fastBtn) {
    fastBtn.addEventListener('click', () => {
      const disc = document.getElementById('fastDisciplineSelect').value;
      const dateVal = document.getElementById('fastDateInput').value;
      const timeVal = document.getElementById('fastTimeSelect').value;

      if (dateVal) {
        sandboxState.selectedDateISO = dateVal;
        try {
          localStorage.setItem('mae_last_date', dateVal);
        } catch (e) {
          console.warn("Error saving fast reserve date", e);
        }
        initDateRibbon(); // Re-center date ribon around selected date
      }

      sandboxState.activeFilter = disc;
      try {
        localStorage.setItem('mae_discipline_filter', disc);
      } catch (e) {
        console.warn("Error saving fast reserve discipline", e);
      }
      document.querySelectorAll('.discipline-filter-bar .filter-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.discipline === disc);
      });

      renderMockClasses();

      // Auto scroll to booking area smoothly
      const bookingSec = document.getElementById('luxBooking');
      if (bookingSec) {
        bookingSec.scrollIntoView({ behavior: 'smooth' });
      }

      showToast(`Buscando clases de ${disc}...`, 'info');
    });
  }

  // Slide to confirm initialization
  initSlideConfirm();

  // Handle transparent shrinking navbar on scroll
  const nav = document.getElementById('luxNavbar');
  window.addEventListener('scroll', () => {
    if (window.scrollY > 50) {
      nav.classList.add('scrolled');
    } else {
      nav.classList.remove('scrolled');
    }
  });

  // Mobile Bottom Navigation Tab bar listeners & click scrolling
  const mTabs = {
    'mTabHero': 'luxHero',
    'mTabClasses': 'disciplineSplit',
    'mTabBooking': 'luxBooking',
    'mTabPricing': 'luxPricing'
  };

  Object.keys(mTabs).forEach(tabId => {
    const tabEl = document.getElementById(tabId);
    if (tabEl) {
      tabEl.addEventListener('click', (e) => {
        e.preventDefault();
        setActiveMobileTab(tabId);
        
        const targetSec = document.getElementById(mTabs[tabId]);
        if (targetSec) {
          targetSec.scrollIntoView({ behavior: 'smooth' });
        }
      });
    }
  });

  // Mobile Profile Tab Trigger
  const mTabProfile = document.getElementById('mTabProfile');
  if (mTabProfile) {
    mTabProfile.addEventListener('click', (e) => {
      e.preventDefault();
      setActiveMobileTab('mTabProfile');
      if (sandboxState.currentUser) {
        openProfileDrawer();
      } else {
        showSandboxLoginOverlay();
      }
    });
  }

  function setActiveMobileTab(tabId) {
    document.querySelectorAll('.mobile-nav-item').forEach(el => el.classList.remove('active'));
    const activeEl = document.getElementById(tabId);
    if (activeEl) activeEl.classList.add('active');
  }

  // Auto-active bottom tabs on viewport scroll using lightweight IntersectionObserver
  if ('IntersectionObserver' in window) {
    const observerOptions = {
      root: null,
      rootMargin: '-40% 0px -40% 0px', // Center-focused triggers
      threshold: 0
    };

    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const id = entry.target.id;
          let matchedTab = '';
          if (id === 'luxHero') matchedTab = 'mTabHero';
          else if (id === 'disciplineSplit') matchedTab = 'mTabClasses';
          else if (id === 'luxBooking') matchedTab = 'mTabBooking';
          else if (id === 'luxPricing') matchedTab = 'mTabPricing';

          if (matchedTab) {
            setActiveMobileTab(matchedTab);
          }
        }
      });
    }, observerOptions);

    ['luxHero', 'disciplineSplit', 'luxBooking', 'luxPricing'].forEach(id => {
      const sec = document.getElementById(id);
      if (sec) observer.observe(sec);
    });
  }
}

/* ============================================================
   PACKAGE PRICE CARD GLOW SENSOR (DYNAMIC LUXURY EFFECT)
   ============================================================ */
function initPriceCardGlow() {
  const cards = document.querySelectorAll('.glow-card');
  
  cards.forEach(card => {
    const glow = card.querySelector('.card-glow-bg');
    
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left; // x position inside card
      const y = e.clientY - rect.top;  // y position inside card
      
      card.style.setProperty('--glow-top', `${y}px`);
      card.style.setProperty('--glow-left', `${x}px`);
    });
  });
}

// Global checkout purchase link mock trigger
window.mockPurchase = (packageName, price) => {
  if (!sandboxState.currentUser) {
    showSandboxLoginOverlay();
    showToast(`Para adquirir '${packageName}' por $${price} MXN, inicia sesión sandbox primero.`, 'info');
  } else {
    // Top-up credits based on package selected
    let count = 1;
    let key = 'pilates';

    if (packageName.includes('Ilimitado')) {
      count = 20;
      key = 'pilates';
      sandboxState.credits.train += 20;
    } else if (packageName.includes('VIP')) {
      count = 30;
      key = 'vip';
    }

    sandboxState.credits[key] += count;
    updateProfileDashboard();
    
    showToast(`✓ Compra simulada exitosa! Se añadieron las clases de '${packageName}' a tu saldo.`, 'success');
  }
};
