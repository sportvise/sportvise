// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — TEAM MEETING (multi-agent meeting MVP)
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5.
// v63.0.0 — Idée 7 STRATEGIE / audit 4.3 = killer feature ProductHunt.
//
// Flow :
//   1. User clique le FAB "🤝 Réunion équipe" en bas-droit du dashboard
//   2. Modal s'ouvre : textarea question + 3 chips agents (sélection multi)
//   3. Submit → POST /.netlify/functions/meeting avec JWT + contexte
//   4. Affichage des 2-3 réponses agents en cards
//   5. Si paywall (Free) ou quota dépassé (Plus) → CTA upgrade
//
// Dépend des globals : currentUser, currentLang, AGENTS, T, sb (Supabase),
//                      getDailyLogContext(), getGoalsContext() (depuis helpers).
// ═══════════════════════════════════════════════════════════════════

// State partagé pour la modal
let _teamMeetingSelectedAgents = [];

// Pré-sélection par défaut : 3 agents les plus polyvalents pour une question
// type "fatigue avant match" → David (physique), Julie (récup), Nora (sommeil).
const _TEAM_MEETING_DEFAULT_AGENTS = ['physique', 'recuperation', 'sommeil'];

// 8 agents proposables dans la sélection meeting (les plus contextualisables).
// On exclut volontairement : marketing, sponsors, comptabilite (moins pertinents
// pour la majorité des questions athlétiques).
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
  // Reset state
  _teamMeetingSelectedAgents = [..._TEAM_MEETING_DEFAULT_AGENTS];
  const ta = document.getElementById('teamMeetingQuestion');
  if (ta) ta.value = '';
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

function _renderTeamMeetingAgentChips() {
  const container = document.getElementById('teamMeetingAgents');
  if (!container) return;
  const lang = currentLang || 'fr';
  container.innerHTML = '';
  _TEAM_MEETING_PICKABLE_AGENTS.forEach(aid => {
    const agent = (typeof AGENTS !== 'undefined' && AGENTS[aid]) ? AGENTS[aid] : null;
    if (!agent) return;
    const isSelected = _teamMeetingSelectedAgents.includes(aid);
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tm-chip' + (isSelected ? ' tm-chip-selected' : '');
    chip.style.cssText = `padding:8px 12px;border-radius:20px;border:1px solid ${isSelected ? '#f59e0b' : '#1e2d47'};background:${isSelected ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'transparent'};color:${isSelected ? '#07091a' : '#f1f5f9'};font-size:12px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:6px;margin:4px`;
    chip.textContent = (agent.emoji ? agent.emoji + ' ' : '') + agent.name;
    chip.onclick = () => _toggleTeamMeetingAgent(aid);
    container.appendChild(chip);
  });
  // Counter "X/3 sélectionné(s)"
  const counter = document.getElementById('teamMeetingCounter');
  if (counter) {
    const count = _teamMeetingSelectedAgents.length;
    const limit = 3;
    const tpl = (T?.[currentLang]?.teamMeetingCounter) || '{n}/{max} agents sélectionnés';
    counter.textContent = tpl.replace('{n}', count).replace('{max}', limit);
  }
}

function _toggleTeamMeetingAgent(agentId) {
  const idx = _teamMeetingSelectedAgents.indexOf(agentId);
  if (idx >= 0) {
    // Désélection (autorisée si on reste >= 2 après)
    if (_teamMeetingSelectedAgents.length <= 2) {
      // Tu dois avoir au moins 2 agents
      return;
    }
    _teamMeetingSelectedAgents.splice(idx, 1);
  } else {
    // Sélection (autorisée si on est < 3 avant)
    if (_teamMeetingSelectedAgents.length >= 3) return;
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
    resultsEl.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:13px">' +
      ((T?.[currentLang]?.teamMeetingErrShort) || 'Question trop courte (min 10 caractères)') + '</div>';
    return;
  }
  if (_teamMeetingSelectedAgents.length < 2) {
    resultsEl.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:13px">' +
      ((T?.[currentLang]?.teamMeetingErrAgents) || 'Sélectionne au moins 2 agents') + '</div>';
    return;
  }

  // Loading state
  submitBtn.disabled = true;
  submitBtn.textContent = (T?.[currentLang]?.teamMeetingLoading) || 'Réunion en cours…';
  resultsEl.innerHTML = '<div style="text-align:center;padding:32px;color:var(--muted);font-size:13px">' +
    '<div style="display:inline-block;width:32px;height:32px;border:3px solid #1e2d47;border-top-color:#f59e0b;border-radius:50%;animation:tm-spin 0.8s linear infinite;margin-bottom:12px"></div>' +
    '<div>' + ((T?.[currentLang]?.teamMeetingThinking) || 'Tes agents réfléchissent ensemble…') + '</div>' +
    '</div>' +
    '<style>@keyframes tm-spin{to{transform:rotate(360deg)}}</style>';

  // Récupère le JWT depuis Supabase
  let accessToken = null;
  try {
    const { data: { session } } = await sb.auth.getSession();
    accessToken = session?.access_token;
  } catch (e) {
    console.warn('[TEAM_MEETING] getSession error:', e);
  }
  if (!accessToken) {
    resultsEl.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:13px">Session expirée. Reconnecte-toi.</div>';
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
    return;
  }

  // Récupère le contexte enrichi (profile, calendar, dailyLog) — best effort
  let dailyLog = '';
  let calendar = '';
  let profile = '';
  try { if (typeof getDailyLogContext === 'function') dailyLog = await getDailyLogContext(); } catch (_) {}
  try {
    if (typeof userProfile !== 'undefined' && userProfile) {
      profile = `Sport : ${userProfile.sport || '?'}, Niveau : ${userProfile.level || '?'}, Canton : ${userProfile.canton || '?'}`;
    }
  } catch (_) {}
  // Calendar : limite aux 5 prochains événements
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

  // POST /meeting
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
        lang: currentLang || 'fr',
        profile, calendar, dailyLog
      })
    });
  } catch (netErr) {
    console.error('[TEAM_MEETING] network error:', netErr);
    resultsEl.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:13px">' +
      ((T?.[currentLang]?.teamMeetingErrNetwork) || 'Erreur réseau. Réessaie.') + '</div>';
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (_) {
    resultsEl.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:13px">Réponse invalide du serveur.</div>';
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
    return;
  }

  if (resp.status === 403 && data?.error === 'plan_required') {
    // Paywall Free → upgrade Plus
    resultsEl.innerHTML = `
      <div style="text-align:center;padding:24px 16px;border:1px solid #f59e0b;border-radius:12px;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(217,119,6,0.04))">
        <div style="font-size:32px;margin-bottom:8px">🔒</div>
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${(T?.[currentLang]?.teamMeetingLockedTitle) || 'Réunion d\'équipe — Plus & Pro'}</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:16px">${(T?.[currentLang]?.teamMeetingLockedBody) || 'Demande à 2-3 agents experts de répondre ensemble à ta question. Disponible avec le plan Plus (2/mois) et Pro (illimité).'}</div>
        <button onclick="showPage('abonnement');closeTeamMeeting();" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${(T?.[currentLang]?.teamMeetingUpgrade) || 'Voir les plans'}</button>
      </div>
    `;
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
    return;
  }

  if (resp.status === 429 && data?.error === 'quota_exceeded') {
    // Quota Plus dépassé → upgrade Pro
    resultsEl.innerHTML = `
      <div style="text-align:center;padding:24px 16px;border:1px solid #f59e0b;border-radius:12px;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(217,119,6,0.04))">
        <div style="font-size:32px;margin-bottom:8px">⏳</div>
        <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${(T?.[currentLang]?.teamMeetingQuotaTitle) || 'Quota mensuel atteint'}</div>
        <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:16px">${data.message || ''}</div>
        ${data.upgrade_to === 'pro' ? `<button onclick="showPage('abonnement');closeTeamMeeting();" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${(T?.[currentLang]?.teamMeetingUpgradePro) || 'Passer en Pro'}</button>` : ''}
      </div>
    `;
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
    return;
  }

  if (!resp.ok) {
    resultsEl.innerHTML = '<div style="color:#ef4444;padding:12px;font-size:13px">' +
      ((T?.[currentLang]?.teamMeetingErrServer) || 'Erreur serveur. Réessaie dans un instant.') + '</div>';
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
    return;
  }

  // Succès — afficher les responses
  _renderTeamMeetingResponses(data);
  submitBtn.disabled = false;
  submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
}

function _renderTeamMeetingResponses(data) {
  const resultsEl = document.getElementById('teamMeetingResults');
  if (!resultsEl || !data) return;
  const responses = data.responses || [];
  const meta = data.meta || {};

  let html = '<div style="margin-top:8px">';
  // Header "Voilà ce que ton équipe te dit"
  html += `<div style="font-size:12px;color:var(--muted);margin-bottom:12px;text-align:center">${(T?.[currentLang]?.teamMeetingHeader) || 'Voilà ce que ton équipe te dit'}</div>`;

  responses.forEach(r => {
    if (r.error) {
      html += `<div style="border:1px solid #1e2d47;border-radius:12px;padding:12px;margin-bottom:12px;background:rgba(239,68,68,0.04)">
        <div style="font-size:13px;font-weight:700;color:var(--text);margin-bottom:4px">${escapeHtml(r.agent_name || r.agentId)}</div>
        <div style="font-size:11px;color:#ef4444">${(T?.[currentLang]?.teamMeetingErrAgent) || 'Cet agent n\'a pas pu répondre cette fois.'}</div>
      </div>`;
      return;
    }
    const agentObj = (typeof AGENTS !== 'undefined' && AGENTS[r.agentId]) ? AGENTS[r.agentId] : null;
    const emoji = agentObj?.emoji || '🧑‍💼';
    const color = agentObj?.color || '#f59e0b';
    // Replies markdown light : on respecte les line breaks et on laisse le reste
    const replyHtml = (r.reply || '').split('\n').map(line => escapeHtml(line)).join('<br>');
    html += `<div style="border:1px solid ${color};border-radius:12px;padding:14px;margin-bottom:12px;background:rgba(7,9,26,0.4)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="font-size:18px">${emoji}</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text)">${escapeHtml(r.agent_name)}</div>
          <div style="font-size:10px;color:var(--muted)">${escapeHtml(r.agent_title || '')}</div>
        </div>
      </div>
      <div style="font-size:13px;color:var(--text);line-height:1.5">${replyHtml}</div>
    </div>`;
  });

  // Footer : usage info pour Plus, ou rien pour Pro
  if (meta.plan === 'plus') {
    const tpl = (T?.[currentLang]?.teamMeetingUsage) || 'Réunion {n}/{max} ce mois (plan Plus)';
    html += `<div style="font-size:11px;color:var(--muted);text-align:center;margin-top:8px">${tpl.replace('{n}', meta.monthUsed).replace('{max}', meta.monthLimit)}</div>`;
  }

  html += '</div>';
  resultsEl.innerHTML = html;
}
