// ============================================================
// public.js — Public page logic for M.A. Fitness (Supabase)
// Handles DNI lookup, registration, profile editing, and panel
// ============================================================

let registrationDni = '';
let selectedPlan = '';
let selectedDays = '';
let currentMemberDni = ''; // Track logged-in member

function initPublicApp() {
    console.log('[public.js] Initializing app...');
    try {
        bindPublicEvents();

        // Smooth scroll (skip links that have specific IDs we handle ourselves)
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            if (anchor.id === 'link-register') return;
            anchor.addEventListener('click', e => {
                e.preventDefault();
                const target = document.querySelector(anchor.getAttribute('href'));
                if (target) target.scrollIntoView({ behavior: 'smooth' });
            });
        });

        // Navbar scroll effect
        window.addEventListener('scroll', () => {
            document.querySelector('.public-nav').classList.toggle('scrolled', window.scrollY > 60);
        });
        // Load reviews on startup
        loadPublicReviews();

        console.log('[public.js] App initialized correctly.');
    } catch (err) {
        console.error('[public.js] Error during initialization:', err);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initPublicApp);
} else {
    initPublicApp();
}

function bindPublicEvents() {
    console.log('[public.js] binding events...');
    // Login
    document.getElementById('btn-login').addEventListener('click', handleLogin);
    const loginEmail = document.getElementById('login-email');
    if(loginEmail) loginEmail.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });

    const loginPass = document.getElementById('login-password');
    if(loginPass) loginPass.addEventListener('keypress', e => { if (e.key === 'Enter') handleLogin(); });
    document.getElementById('btn-logout').addEventListener('click', handleLogout);


    // "Registrate acá" link
    document.getElementById('link-register').addEventListener('click', e => {
        e.preventDefault();
        showRegistrationForm();
    });

    // Registration: plan selector — show days for ALL plans
    document.querySelectorAll('.plan-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.plan-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedPlan = btn.dataset.plan;
            selectedDays = '';

            // Show days selector for every plan
            document.getElementById('days-group').style.display = 'block';
            document.querySelectorAll('.day-option').forEach(d => d.classList.remove('active'));
        });
    });

    // Registration: days selector (no prices shown)
    document.querySelectorAll('.day-option').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.day-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            selectedDays = btn.dataset.days;
        });
    });

    // Registration buttons
    document.getElementById('btn-back-login').addEventListener('click', showLoginBox);
    document.getElementById('btn-register').addEventListener('click', handleRegister);
    document.getElementById('btn-go-panel').addEventListener('click', async () => {
        try {
            const member = await getMemberByDni(registrationDni);
            if (member) {
                showMemberPanel(member);
            } else {
                alert('No pudimos cargar tu panel. Por favor recargá la página e ingresá con tu correo.');
            }
        } catch(err) {
            console.error(err);
        }
    });

    // Profile editing
    document.getElementById('btn-edit-profile').addEventListener('click', showEditProfile);
    document.getElementById('btn-cancel-edit').addEventListener('click', hideEditProfile);
    document.getElementById('btn-save-profile').addEventListener('click', saveProfile);

    // Reviews Section
    const stars = document.querySelectorAll('#review-rating-stars i');
    const ratingInput = document.getElementById('review-rating');
    
    stars.forEach(star => {
        star.addEventListener('click', (e) => {
            const val = parseInt(e.target.dataset.val);
            ratingInput.value = val;
            stars.forEach(s => {
                if (parseInt(s.dataset.val) <= val) {
                    s.classList.add('active');
                    s.classList.remove('far');
                    s.classList.add('fas');
                } else {
                    s.classList.remove('active');
                    s.classList.remove('fas');
                    s.classList.add('far');
                }
            });
        });
    });

    document.getElementById('review-form').addEventListener('submit', handleReviewSubmit);
}

// ── Login Flow ────────────────────────────────────────────────
async function handleLogin() {
    console.log('[public.js] handleLogin triggered');
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value.trim();
    const errorEl = document.getElementById('login-error');

    if (!email || !password) {
        showError(errorEl, 'Ingresá tu correo y contraseña.');
        return;
    }

    const btn = document.getElementById('btn-login');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ingresando...';
    btn.disabled = true;

    try {
        if (!window.supabaseApp) throw new Error('Base de datos no conectada.');

        const { data: authData, error: authError } = await window.supabaseApp.auth.signInWithPassword({
            email, password
        });

        if (authError) {
            showError(errorEl, 'Correo o contraseña incorrectos.');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        // Search member by auth_id instead of DNI
        const { data: memberData, error: memberError } = await window.supabaseApp
            .from('members')
            .select('*')
            .eq('auth_id', authData.user.id)
            .maybeSingle();

        if (memberError || !memberData) {
            showError(errorEl, 'Cuenta válida, pero no se encontró tu ficha de gimnasio. Contactá al administrador.');
            await window.supabaseApp.auth.signOut();
        } else {
            errorEl.textContent = '';
            showMemberPanel(dbToMember(memberData)); // dbToMember from data.js
        }
    } catch (err) {
        console.error('[public.js] Error in handleLogin:', err);
        showError(errorEl, 'Error del sistema: ' + err.message);
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
}

async function handleLogout() {
    currentMemberDni = '';
    if (window.supabaseApp) await window.supabaseApp.auth.signOut();
    hideAll();
    document.getElementById('login-box').style.display = 'block';
    document.getElementById('login-email').value = '';
    document.getElementById('login-password').value = '';
}

function showLoginBox() {
    hideAll();
    document.getElementById('login-box').style.display = 'block';
}

// ── Registration Flow ─────────────────────────────────────────
function showRegistrationForm() {
    hideAll();
    document.getElementById('register-box').style.display = 'block';
    registrationDni = '';
    document.getElementById('reg-dni-display').textContent = '';

    // Reset form
    document.getElementById('reg-dni').value = '';
    document.getElementById('reg-name').value = '';
    document.getElementById('reg-phone').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-password').value = '';
    document.getElementById('reg-pathology').value = '';
    document.getElementById('register-error').textContent = '';
    document.querySelectorAll('.plan-option').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.day-option').forEach(b => b.classList.remove('active'));
    document.getElementById('days-group').style.display = 'none';
    selectedPlan = '';
    selectedDays = '';
}

async function handleRegister() {
    const errorEl = document.getElementById('register-error');
    const dni = document.getElementById('reg-dni').value.trim();
    const name = document.getElementById('reg-name').value.trim();
    const phone = document.getElementById('reg-phone').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value.trim();

    // Validation
    if (!dni || dni.length < 7) { showError(errorEl, 'Ingresá un DNI válido (7-8 dígitos).'); return; }
    if (!name) { showError(errorEl, 'Ingresá tu nombre.'); return; }
    if (!phone) { showError(errorEl, 'Ingresá tu teléfono.'); return; }
    if (!email || !password || password.length < 6) { showError(errorEl, 'Ingresá un correo válido y una contraseña (min 6 caracteres).'); return; }
    if (!selectedPlan) { showError(errorEl, 'Seleccioná un plan.'); return; }
    if (!selectedDays) { showError(errorEl, 'Seleccioná la cantidad de días.'); return; }

    registrationDni = dni;
    
    const btn = document.getElementById('btn-register');
    const originalText = btn.innerHTML;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
    btn.disabled = true;

    try {
        // Check DNI not already registered (using unauthenticated call if allowed, or we just rely on unique constraint, but DNI check is fine)
        const existing = await getMemberByDni(registrationDni);
        if (existing && existing.auth_id) {
            showError(errorEl, 'Este DNI ya está registrado con una cuenta activa. Intentá iniciar sesión.');
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        // 1. Create Auth User in Supabase
        const { data: authData, error: authError } = await window.supabaseApp.auth.signUp({
            email, password
        });

        if (authError) {
            // Translate common error
            let msg = authError.message;
            if (msg.includes('already registered')) msg = 'Este correo ya está registrado en la base de datos.';
            showError(errorEl, 'Error al crear cuenta: ' + msg);
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        const auth_id = authData.user.id;

        // Resolve fee
        let fee = 0;
        if (selectedPlan === 'estandar') {
            const opt = PLANS.estandar.options.find(o => String(o.days) === String(selectedDays));
            fee = opt ? opt.fee : 0;
        }

        const today = new Date();
        const memberData = {
            name: name,
            dni: registrationDni,
            phone: phone,
            plan: selectedPlan,
            daysPerWeek: selectedDays,
            fee: fee,
            paidMonth: existing ? existing.paidMonth : null,
            routine: existing ? existing.routine : null,
            pathologies: document.getElementById('reg-pathology').value.trim() || (existing ? existing.pathologies : ''),
            registeredAt: existing ? existing.registeredAt : today.toISOString(),
            auth_id: auth_id
        };

        // 2. Insert or Update into database
        if (existing) {
            memberData.id = existing.id;
            await updateMember(memberData);
            console.log('[public.js] Profile linked to existing imported member.');
        } else {
            await addMember(memberData);
            console.log('[public.js] New member created.');
        }

        errorEl.textContent = '';
        hideAll();
        document.getElementById('register-success').style.display = 'block';

    } catch (err) {
        console.error('[public.js] Error en registro:', err);
        showError(errorEl, 'Error del sistema: ' + err.message);
    }
    
    btn.innerHTML = originalText;
    btn.disabled = false;
}

// ── Member Panel ──────────────────────────────────────────────
function showMemberPanel(member) {
    hideAll();
    const panel = document.getElementById('member-panel');
    panel.style.display = 'block';
    currentMemberDni = member.dni;

    // Hide edit form
    document.getElementById('profile-edit-section').style.display = 'none';

    document.getElementById('panel-avatar').textContent = getInitials(member.name);
    document.getElementById('panel-name').textContent = member.name;
    document.getElementById('panel-dni-display').textContent = `DNI: ${member.dni}`;
    document.getElementById('panel-plan').textContent = getPlanDisplayName(member);
    document.getElementById('panel-fee').textContent = getFeeDisplay(member);
    document.getElementById('panel-due').textContent = getDueDateDisplay();

    const paid = isPaidThisMonth(member);
    const badge = document.getElementById('panel-status-badge');
    badge.textContent = paid ? `Pagado (${getMonthName()})` : `No pagado (${getMonthName()})`;
    badge.className = `badge ${paid ? 'success' : 'danger'}`;

    const statusIcon = document.getElementById('panel-status-icon');
    statusIcon.className = `panel-card-icon ${paid ? 'success' : 'danger'}`;

    // Routine — display as responsive tables (one per day)
    const routineContainer = document.getElementById('panel-routine');
    const hasRoutine = member.routine && Array.isArray(member.routine) &&
        member.routine.some(row => row.some(day => day.ejercicio || day.series || day.rep || day.peso));

    if (hasRoutine) {
        // Find which days actually have content
        const activeDays = [];
        for (let d = 0; d < 6; d++) {
            const hasData = member.routine.some(row => row[d] && (row[d].ejercicio || row[d].series || row[d].rep || row[d].peso));
            if (hasData) activeDays.push(d);
        }

        let tablesHtml = '';
        activeDays.forEach(d => {
            let tbodyHtml = '';
            member.routine.forEach((row, rIdx) => {
                const day = row[d] || {};
                const hasDayContent = day.ejercicio || day.series || day.rep || day.peso;
                if (!hasDayContent) return;

                tbodyHtml += `<tr>
                    <td>${day.ejercicio || '—'}</td>
                    <td class="rt-center">${day.series || '—'}</td>
                    <td class="rt-center">${day.rep || '—'}</td>
                    <td class="rt-center">
                        <input type="text" class="rt-weight-input" 
                            value="${day.peso || ''}" 
                            placeholder="—"
                            data-row="${rIdx}" 
                            data-day="${d}">
                    </td>
                </tr>`;
            });

            tablesHtml += `
                <div class="routine-day-box">
                    <div class="routine-day-title">Día ${d + 1}</div>
                    <div class="routine-table-scroll">
                        <table class="routine-display-table">
                            <thead>
                                <tr class="routine-sub-header">
                                    <th>Ejercicio</th>
                                    <th style="width:70px;">Series</th>
                                    <th style="width:70px;">Rep</th>
                                    <th style="width:90px;">Peso</th>
                                </tr>
                            </thead>
                            <tbody>${tbodyHtml}</tbody>
                        </table>
                    </div>
                </div>`;
        });

        routineContainer.innerHTML = `
            <div class="routine-detail-card">
                <div class="routine-detail-header">
                    <h3><i class="fas fa-dumbbell"></i> Tu Rutina</h3>
                    <span class="text-muted" style="font-size:0.8rem;">(Podés editar tu peso directamente en la tabla)</span>
                </div>
                <div class="routine-grid-container">
                    ${tablesHtml}
                </div>
            </div>`;

        // Add event listeners for weight inputs
        routineContainer.querySelectorAll('.rt-weight-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const rowIdx = parseInt(e.target.dataset.row);
                const dayIdx = parseInt(e.target.dataset.day);
                const newWeight = e.target.value.trim();
                
                // Update member data locally
                member.routine[rowIdx][dayIdx].peso = newWeight;
                
                // Save to DB
                try {
                    await updateMember(member);
                    console.log('Peso actualizado en DB');
                } catch (err) {
                    console.error('Error actualizando peso:', err);
                    alert('Error al guardar el peso. Intentá de nuevo.');
                }
            });
        });
    } else {
        routineContainer.innerHTML = `
            <div class="no-routine-msg">
                <i class="fas fa-info-circle"></i>
                <p>Todavía no tenés una rutina asignada. Consultá en recepción para que te asignen una.</p>
            </div>`;
    }
}

// ── Profile Editing ───────────────────────────────────────────
async function showEditProfile() {
    const member = await getMemberByDni(currentMemberDni);
    if (!member) return;

    document.getElementById('profile-name').value = member.name;
    document.getElementById('profile-phone').value = member.phone || '';
    document.getElementById('profile-plan').value = member.plan;
    document.getElementById('profile-days').value = member.daysPerWeek || '2';
    document.getElementById('profile-pathology').value = member.pathologies || '';
    document.getElementById('profile-edit-msg').textContent = '';
    document.getElementById('profile-edit-section').style.display = 'block';
}

function hideEditProfile() {
    document.getElementById('profile-edit-section').style.display = 'none';
}

async function saveProfile() {
    const member = await getMemberByDni(currentMemberDni);
    if (!member) return;

    const name = document.getElementById('profile-name').value.trim();
    const phone = document.getElementById('profile-phone').value.trim();
    const plan = document.getElementById('profile-plan').value;
    const days = document.getElementById('profile-days').value;
    const pathologies = document.getElementById('profile-pathology').value.trim();

    if (!name) { showProfileMsg('Ingresá tu nombre.', 'error'); return; }
    if (!phone) { showProfileMsg('Ingresá tu teléfono.', 'error'); return; }

    member.name = name;
    member.phone = phone;
    member.plan = plan;
    member.daysPerWeek = days;
    member.pathologies = pathologies;

    // Auto-update fee for estándar
    if (plan === 'estandar') {
        const opt = PLANS.estandar.options.find(o => String(o.days) === String(days));
        member.fee = opt ? opt.fee : member.fee;
    }
    // For personalizado/online, keep existing fee

    await updateMember(member);
    showProfileMsg('¡Datos actualizados!', 'success');

    // Refresh panel display
    setTimeout(async () => {
        const updated = await getMemberByDni(currentMemberDni);
        if (updated) showMemberPanel(updated);
    }, 1200);
}

function showProfileMsg(msg, type) {
    const el = document.getElementById('profile-edit-msg');
    el.textContent = msg;
    el.className = `profile-edit-msg ${type}`;
}

// ── Helpers ───────────────────────────────────────────────────
function hideAll() {
    document.getElementById('login-box').style.display = 'none';
    document.getElementById('register-box').style.display = 'none';
    document.getElementById('member-panel').style.display = 'none';
    document.getElementById('register-success').style.display = 'none';
}


function showError(el, msg) {
    el.textContent = msg;
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 500);
}

// ── Reviews Flow ──────────────────────────────────────────────
async function loadPublicReviews() {
    const grid = document.getElementById('public-reviews-grid');
    if (!grid) return;
    try {
        const reviews = await loadReviews(); // from data.js
        if (!reviews || reviews.length === 0) {
            grid.innerHTML = '<p class="text-muted" style="text-align: center; width: 100%;">Aún no hay reseñas. ¡Sé el primero en dejar la tuya!</p>';
            return;
        }

        // Generate HTML for each review
        grid.innerHTML = reviews.map(r => {
            let starsHtml = '';
            for (let i = 1; i <= 5; i++) {
                starsHtml += `<i class="fa${i <= r.rating ? 's' : 'r'} fa-star"></i>`;
            }
            
            const dateStr = new Date(r.created_at).toLocaleDateString('es-AR', { month: 'short', year: 'numeric' });

            return `
            <div class="review-card">
                <div class="review-stars">${starsHtml}</div>
                <p class="review-text">"${r.text}"</p>
                <div style="display:flex; justify-content:space-between; align-items:flex-end;">
                    <span class="review-author">- ${r.author}</span>
                    <span class="review-date">${dateStr}</span>
                </div>
            </div>`;
        }).join('');
        
    } catch (err) {
        console.error('Error loading public reviews:', err);
        grid.innerHTML = '<p class="text-muted" style="text-align: center; width: 100%;">No se pudieron cargar las reseñas.</p>';
    }
}

async function handleReviewSubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-review');
    const msgEl = document.getElementById('review-msg');
    
    const author = document.getElementById('review-author').value.trim() || 'Anónimo';
    const rating = parseInt(document.getElementById('review-rating').value);
    const text = document.getElementById('review-text').value.trim();

    if (!text) {
        msgEl.textContent = 'Por favor, escribí tu experiencia.';
        msgEl.className = 'review-msg error';
        return;
    }

    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';

    const newReview = await addReview({ author, rating, text });

    if (newReview) {
        msgEl.textContent = '¡Gracias! Tu reseña fue enviada.';
        msgEl.className = 'review-msg success';
        document.getElementById('review-form').reset();
        
        // Reset stars
        document.querySelectorAll('#review-rating-stars i').forEach(s => {
            s.classList.add('active');
            s.classList.remove('far');
            s.classList.add('fas');
        });
        document.getElementById('review-rating').value = 5;

        await loadPublicReviews();
    } else {
        msgEl.textContent = 'Ocurrió un error. Intentá más tarde.';
        msgEl.className = 'review-msg error';
    }

    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-paper-plane"></i> Enviar Reseña';
    
    setTimeout(() => { msgEl.textContent = ''; }, 5000);
}
