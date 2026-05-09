// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — TEAM MEETING (multi-agent meeting MVP + threading v63.1.0)
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5.
// v63.0.0 — Idée 7 STRATEGIE / audit 4.3 = killer feature ProductHunt.
// v63.1.0 — Threading multi-tour : 1 meeting = 1 thread, 5 tours max par thread.
//
// Flow :
//   1. User clique le FAB 🤝 ou le nav-item sidebar "Réunion d'équipe"
//   2. Modal s'ouvre : textarea question + 3 chips agents (sélection multi 2-3)
//   3. Submit 1er tour → POST /.netlify/functions/meeting (history=[]) → 3 cards
//   4. Le thread s'active : agents lockés, textarea vide pour follow-up, compteur "Tour 2/5"
//   5. Submit follow-up → POST avec history → append au thread
//   6. Jusqu'à 5 tours, puis "Démarre une nouvelle réunion" (consomme nouveau quota)
//   7. Bouton "Nouvelle réunion" : reset complet du state
//
// Quotas : Plus = 2 meetings/mois × 5 tours, Pro = illimité × 5 tours.
// 1 meeting = 1 thread complet, peu importe le nombre de tours dedans.
//
// Dépend des globals : currentUser, currentLang, AGENTS, T, sb (Supabase),
//                      getDailyLogContext() (helpers), dateToStr() (helpers),
//                      escapeHtml (dashboard.html), userProfile, userPlan.
// ═══════════════════════════════════════════════════════════════════

// State partagé pour la modal et le thread en cours
let _teamMeetingSelectedAgents = [];
let _teamMeetingHistory = [];           // v63.1.0 — array of {question, responses}
let _teamMeetingActive = false;         // v63.1.0 — true après 1er tour réussi
const _TEAM_MEETING_MAX_TURNS = 5;      // doit matcher MAX_TURNS_PER_MEETING backend

// Pré-sélection par défaut : 3 agents les plus polyvalents pour une question
// type "fatigue avant match" → David (physique), Julie (récup), Nora (sommeil).
const _TEAM_MEETING_DEFAULT_AGENTS = ['physique', 'recuperation', 'sommeil'];

// 8 agents proposables dans la sélection meeting (les plus contextualisables).
const _TEAM_MEETING_PICKABLE_AGENTS = [
  'physique', 'recuperation', 'sommeil',
  'mental', 'nutrition', 'equipe',
  'finance', 'contrats'
];

function openTeamMeeting() {
  const modal = document.getElementById('teamMeetingModal');
  if (!modal) {
    console.warn('[TEAM_MEETING] modal not found');
    return;
  }
  // Reset state complet au open (chaque ouverture = nouveau meeting potentiel)
  _teamMeetingSelectedAgents = [..._TEAM_MEETING_DEFAULT_AGENTS];
  _teamMeetingHistory = [];
  _teamMeetingActive = false;

  const ta = document.getElementById('teamMeetingQuestion');
  if (ta) {
    ta.value = '';
    ta.disabled = false;
  }
  const resultsEl = document.getElementById('teamMeetingResults');
  if (resultsEl) resultsEl.innerHTML = '';

  const submitBtn = document.getElementById('teamMeetingSubmit');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
  }
  _renderTeamMeetingAgentChips();
  modal.style.display = 'flex';
}

function closeTeamMeeting() {
  const modal = document.getElementById('teamMeetingModal');
  if (modal) modal.style.display = 'none';
}

// v63.1.0 — Reset le thread mais garde la modal ouverte.
// Si user a déjà épuisé son quota mensuel, l'erreur reviendra au prochain submit.
function newTeamMeetingThread() {
  _teamMeetingHistory = [];
  _teamMeetingActive = false;
  _teamMeetingSelectedAgents = [..._TEAM_MEETING_DEFAULT_AGENTS];
  const ta = document.getElementById('teamMeetingQuestion');
  if (ta) {
    ta.value = '';
    ta.disabled = false;
    ta.placeholder = (T?.[currentLang]?.teamMeetingPlaceholder) ||
      'Ex: Je me sens fatigué avant un match dans 3 jours, que faire ?';
  }
  const resultsEl = document.getElementById('teamMeetingResults');
  if (resultsEl) resultsEl.innerHTML = '';
  const submitBtn = document.getElementById('teamMeetingSubmit');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
  }
  _renderTeamMeetingAgentChips();
}

function _renderTeamMeetingAgentChips() {
  const container = document.getElementById('teamMeetingAgents');
  if (!container) return;
  container.innerHTML = '';
  _TEAM_MEETING_PICKABLE_AGENTS.forEach(aid => {
    const agent = (typeof AGENTS !== 'undefined' && AGENTS[aid]) ? AGENTS[aid] : null;
    if (!agent) return;
    const isSelected = _teamMeetingSelectedAgents.includes(aid);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tm-chip' + (isSelected ? ' tm-chip-selected' : '');
    // v63.1.0 — Lock visuel quand thread actif (l'user ne peut pas changer
    // d'agents en cours de réunion, sinon l'historique n'a plus de sens).
    const locked = _teamMeetingActive;
    const opacity = locked ? '0.6' : '1';
    const cursor = locked ? 'not-allowed' : 'pointer';
    chip.style.cssText = `padding:8px 12px;border-radius:20px;border:1px solid ${isSelected ? '#f59e0b' : '#1e2d47'};background:${isSelected ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'transparent'};color:${isSelected ? '#07091a' : '#f1f5f9'};font-size:12px;font-weight:600;cursor:${cursor};font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:6px;margin:4px;opacity:${opacity}`;
    chip.disabled = locked;
    chip.textContent = (agent.emoji ? agent.emoji + ' ' : '') + agent.name;
    chip.onclick = () => {
      if (locked) return;
      _toggleTeamMeetingAgent(aid);
    };
    container.appendChild(chip);
  });
  // Counter "X/3 sélectionné(s)" + "Tour N/max" si thread actif
  const counter = document.getElementById('teamMeetingCounter');
  if (counter) {
    if (_teamMeetingActive) {
      const turn = _teamMeetingHistory.length + 1;
      const tpl = (T?.[currentLang]?.teamMeetingTurnCounter) || 'Tour {n}/{max}';
      counter.textContent = tpl.replace('{n}', turn).replace('{max}', _TEAM_MEETING_MAX_TURNS);
      counter.style.color = (turn > _TEAM_MEETING_MAX_TURNS) ? '#ef4444' : '#f59e0b';
    } else {
      const count = _teamMeetingSelectedAgents.length;
      const tpl = (T?.[currentLang]?.teamMeetingCounter) || '{n}/{max} agents sélectionnés';
      counter.textContent = tpl.replace('{n}', count).replace('{max}', 3);
      counter.style.color = '';
    }
  }
}

function _toggleTeamMeetingAgent(agentId) {
  if (_teamMeetingActive) return; // lock après 1er tour
  const idx = _teamMeetingSelectedAgents.indexOf(agentId);
  if (idx >= 0) {
    if (_teamMeetingSelectedAgents.length <= 2) return; // min 2
    _teamMeetingSelectedAgents.splice(idx, 1);
  } else {
    if (_teamMeetingSelectedAgents.length >= 3) return; // max 3
    _teamMeetingSelectedAgents.push(agentId);
  }
  _renderTeamMeetingAgentChips();
}

async function submitTeamMeeting() {
  const ta = document.getElementById('teamMeetingQuestion');
  const submitBtn = document.getElementById('teamMeetingSubmit');
  const resultsEl = document.getElementById('teamMeetingResults');
  if (!ta || !submitBtn || !resultsEl) return;

  const question = (ta.value || '').trim();
  if (question.length < 10) {
    _flashError(resultsEl, (T?.[currentLang]?.teamMeetingErrShort) || 'Question trop courte (min 10 caractères)');
    return;
  }
  if (_teamMeetingSelectedAgents.length < 2) {
    _flashError(resultsEl, (T?.[currentLang]?.teamMeetingErrAgents) || 'Sélectionne au moins 2 agents');
    return;
  }

  // v63.1.0 — Vérif limite per-thread côté frontend (le backend la rejettera aussi)
  if (_teamMeetingHistory.length >= _TEAM_MEETING_MAX_TURNS) {
    _flashError(resultsEl, (T?.[currentLang]?.teamMeetingMaxTurnsReached) ||
      'Tu as atteint la limite de tours pour cette réunion. Démarre-en une nouvelle.');
    return;
  }

  // Loading state
  submitBtn.disabled = true;
  submitBtn.textContent = (T?.[currentLang]?.teamMeetingLoading) || 'Réunion en cours…';
  ta.disabled = true;

  // Si thread actif, on append un loader au bas du thread, sinon on affiche le loader plein
  const isFollowup = _teamMeetingActive && _teamMeetingHistory.length > 0;
  const loaderHtml = '<div id="tm-loader" style="text-align:center;padding:24px;color:var(--muted);font-size:13px">' +
    '<div style="display:inline-block;width:28px;height:28px;border:3px solid #1e2d47;border-top-color:#f59e0b;border-radius:50%;animation:tm-spin 0.8s linear infinite;margin-bottom:8px"></div>' +
    '<div>' + ((T?.[currentLang]?.teamMeetingThinking) || 'Tes agents réfléchissent ensemble…') + '</div>' +
    '</div><style>@keyframes tm-spin{to{transform:rotate(360deg)}}</style>';

  if (isFollowup) {
    // On affiche déjà le thread actuel + le loader en bas
    resultsEl.innerHTML = _renderThreadHtml(_teamMeetingHistory) + loaderHtml;
    // Auto-scroll en bas
    resultsEl.scrollTop = resultsEl.scrollHeight;
  } else {
    resultsEl.innerHTML = loaderHtml;
  }

  // Récupère le JWT depuis Supabase
  let accessToken = null;
  try {
    const { data: { session } } = await sb.auth.getSession();
    accessToken = session?.access_token;
  } catch (e) {
    console.warn('[TEAM_MEETING] getSession error:', e);
  }
  if (!accessToken) {
    _flashError(resultsEl, 'Session expirée. Reconnecte-toi.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  // Récupère le contexte enrichi (best effort, seulement au 1er tour pour économiser
  // les input tokens — les follow-ups réutilisent le même contexte via system prompt)
  let dailyLog = '';
  let calendar = '';
  let profile = '';
  if (!isFollowup) {
    try { if (typeof getDailyLogContext === 'function') dailyLog = await getDailyLogContext(); } catch (_) {}
    try {
      if (typeof userProfile !== 'undefined' && userProfile) {
        profile = `Sport : ${userProfile.sport || '?'}, Niveau : ${userProfile.level || '?'}, Canton : ${userProfile.canton || '?'}`;
      }
    } catch (_) {}
    try {
      if (typeof currentUser !== 'undefined' && currentUser?.id) {
        const todayStr = (typeof dateToStr === 'function') ? dateToStr() : new Date().toISOString().slice(0, 10);
        const { data: evts } = await sb.from('calendar_events')
          .select('title, event_type, event_date, event_time')
          .eq('user_id', currentUser.id)
          .gte('event_date', todayStr)
          .order('event_date', { ascending: true })
          .limit(5);
        if (evts && evts.length) {
          calendar = evts.map(e => `- ${e.event_date}${e.event_time ? ' ' + e.event_time : ''} : ${e.title} (${e.event_type})`).join('\n');
        }
      }
    } catch (_) {}
  }

  // POST /meeting avec history
  let resp;
  try {
    resp = await fetch('/.netlify/functions/meeting', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken
      },
      body: JSON.stringify({
        question,
        agentIds: _teamMeetingSelectedAgents,
        history: _teamMeetingHistory,        // v63.1.0
        lang: currentLang || 'fr',
        profile, calendar, dailyLog
      })
    });
  } catch (netErr) {
    console.error('[TEAM_MEETING] network error:', netErr);
    _flashError(resultsEl, (T?.[currentLang]?.teamMeetingErrNetwork) || 'Erreur réseau. Réessaie.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (_) {
    _flashError(resultsEl, 'Réponse invalide du serveur.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  if (resp.status === 403 && data?.error === 'plan_required') {
    _renderPaywall(resultsEl);
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  if (resp.status === 429 && (data?.error === 'quota_exceeded' || data?.error === 'max_turns_reached')) {
    _renderQuotaExceeded(resultsEl, data);
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  if (!resp.ok) {
    _flashError(resultsEl, (T?.[currentLang]?.teamMeetingErrServer) || 'Erreur serveur. Réessaie dans un instant.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  // Succès — append au thread et re-render
  const responses = data.responses || [];
  _teamMeetingHistory.push({ question, responses });
  _teamMeetingActive = true;

  // Render thread + footer (placeholder follow-up)
  resultsEl.innerHTML = _renderThreadHtml(_teamMeetingHistory) + _renderThreadFooter(data?.meta);
  resultsEl.scrollTop = resultsEl.scrollHeight;

  // Reset textarea + change le bouton si follow-up dispo
  ta.value = '';
  ta.disabled = false;
  ta.placeholder = (T?.[currentLang]?.teamMeetingFollowupPlaceholder) ||
    'Pose une question de suivi…';

  if (_teamMeetingHistory.length >= _TEAM_MEETING_MAX_TURNS) {
    submitBtn.disabled = true;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingMaxTurnsReached) ||
      'Limite de tours atteinte';
    ta.disabled = true;
  } else {
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingFollowupSubmit) || 'Envoyer';
  }
  _renderTeamMeetingAgentChips(); // re-render avec lock visuel
}

function _restoreSubmitButton(btn, ta) {
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = _teamMeetingActive
    ? ((T?.[currentLang]?.teamMeetingFollowupSubmit) || 'Envoyer')
    : ((T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion');
  if (ta) ta.disabled = false;
}

function _flashError(container, msg) {
  // Affiche l'erreur en haut du container sans détruire le thread (si il y en a un)
  const existing = (_teamMeetingActive && _teamMeetingHistory.length > 0)
    ? _renderThreadHtml(_teamMeetingHistory)
    : '';
  container.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:13px;border:1px solid #ef4444;border-radius:8px;background:rgba(239,68,68,0.06);margin-bottom:12px">' +
    escapeHtml(msg) + '</div>' + existing;
}

function _renderThreadHtml(history) {
  let html = '<div style="margin-top:8px">';
  history.forEach((turn, idx) => {
    // Question header
    html += `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;margin-top:${idx === 0 ? '0' : '20px'}">`;
    html += `<div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">${idx + 1}</div>`;
    html += `<div style="flex:1"><div style="font-size:11px;color:var(--muted);margin-bottom:2px">${(T?.[currentLang]?.teamMeetingQuestionLabel) || 'Question'}</div>`;
    html += `<div style="font-size:13px;color:var(--text);font-weight:600;line-height:1.4">${escapeHtml(turn.question)}</div></div></div>`;

    // Réponses agents pour ce tour
    (turn.responses || []).forEach(r => {
      if (r.error) {
        html += `<div style="border:1px solid #1e2d47;border-radius:10px;padding:10px;margin-bottom:8px;background:rgba(239,68,68,0.04);margin-left:36px">
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px">${escapeHtml(r.agent_name || r.agentId)}</div>
          <div style="font-size:11px;color:#ef4444">${(T?.[currentLang]?.teamMeetingErrAgent) || 'Cet agent n\'a pas pu répondre cette fois.'}</div>
        </div>`;
        return;
      }
      const agentObj = (typeof AGENTS !== 'undefined' && AGENTS[r.agentId]) ? AGENTS[r.agentId] : null;
      const emoji = agentObj?.emoji || '🧑‍💼';
      const color = agentObj?.color || '#f59e0b';
      const replyHtml = (r.reply || '').split('\n').map(line => escapeHtml(line)).join('<br>');
      html += `<div style="border-left:3px solid ${color};border-radius:0 10px 10px 0;padding:10px 12px;margin-bottom:8px;margin-left:36px;background:rgba(7,9,26,0.4)">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <div style="font-size:14px">${emoji}</div>
          <div>
            <span style="font-size:12px;font-weight:700;color:var(--text)">${escapeHtml(r.agent_name)}</span>
            <span style="font-size:10px;color:var(--muted);margin-left:4px">${escapeHtml(r.agent_title || '')}</span>
          </div>
        </div>
        <div style="font-size:12px;color:var(--text);line-height:1.5">${replyHtml}</div>
      </div>`;
    });
  });
  html += '</div>';
  return html;
}

function _renderThreadFooter(meta) {
  let html = '<div style="margin-top:16px;padding-top:12px;border-top:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">';

  // Compteur Tour + plan info
  const turnsDone = _teamMeetingHistory.length;
  const turnsLeft = _TEAM_MEETING_MAX_TURNS - turnsDone;
  const tplTurns = (T?.[currentLang]?.teamMeetingTurnsLeft) || '{n} tour(s) restant(s)';
  html += `<div style="font-size:11px;color:var(--muted)">${tplTurns.replace('{n}', turnsLeft)}`;
  if (meta && meta.plan === 'plus' && !meta.isFollowup) {
    const tplUsage = (T?.[currentLang]?.teamMeetingUsage) || 'Réunion {n}/{max} ce mois (plan Plus)';
    html += ` · ${tplUsage.replace('{n}', meta.monthUsed).replace('{max}', meta.monthLimit)}`;
  }
  html += '</div>';

  // Bouton Nouvelle réunion
  const newLabel = (T?.[currentLang]?.teamMeetingNewMeeting) || 'Nouvelle réunion';
  html += `<button type="button" onclick="newTeamMeetingThread()" style="padding:6px 12px;border-radius:6px;border:1px solid var(--border);background:transparent;color:var(--muted);font-size:11px;cursor:pointer;font-family:Inter,sans-serif">↻ ${escapeHtml(newLabel)}</button>`;

  html += '</div>';
  return html;
}

function _renderPaywall(resultsEl) {
  resultsEl.innerHTML = `
    <div style="text-align:center;padding:24px 16px;border:1px solid #f59e0b;border-radius:12px;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(217,119,6,0.04))">
      <div style="font-size:32px;margin-bottom:8px">🔒</div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${(T?.[currentLang]?.teamMeetingLockedTitle) || 'Réunion d\'équipe — Plus & Pro'}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:16px">${(T?.[currentLang]?.teamMeetingLockedBody) || 'Demande à 2-3 agents experts de répondre ensemble à ta question. Disponible avec le plan Plus (2/mois) et Pro (illimité).'}</div>
      <button onclick="showPage('abonnement');closeTeamMeeting();" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${(T?.[currentLang]?.teamMeetingUpgrade) || 'Voir les plans'}</button>
    </div>
  `;
}

function _renderQuotaExceeded(resultsEl, data) {
  const isMaxTurns = data?.error === 'max_turns_reached';
  resultsEl.innerHTML = `
    <div style="text-align:center;padding:24px 16px;border:1px solid #f59e0b;border-radius:12px;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(217,119,6,0.04))">
      <div style="font-size:32px;margin-bottom:8px">${isMaxTurns ? '🔄' : '⏳'}</div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${escapeHtml(isMaxTurns ? ((T?.[currentLang]?.teamMeetingMaxTurnsTitle) || 'Limite de tours atteinte') : ((T?.[currentLang]?.teamMeetingQuotaTitle) || 'Quota mensuel atteint'))}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:16px">${escapeHtml(data?.message || '')}</div>
      ${isMaxTurns
        ? `<button onclick="newTeamMeetingThread()" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${(T?.[currentLang]?.teamMeetingNewMeeting) || 'Nouvelle réunion'}</button>`
        : (data?.upgrade_to === 'pro'
            ? `<button onclick="showPage('abonnement');closeTeamMeeting();" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${(T?.[currentLang]?.teamMeetingUpgradePro) || 'Passer en Pro'}</button>`
            : '')
      }
    </div>
  `;
}
