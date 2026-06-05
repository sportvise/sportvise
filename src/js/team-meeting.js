// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — TEAM MEETING v63.31 (Phase 2 refacto)
// ═══════════════════════════════════════════════════════════════════
// Refacto majeur : modale → page dédiée (/reunion)
// Nouvelles features :
//   - Bloc synthèse "Décision de l'équipe" après chaque tour (4e call Sonnet)
//   - Max 4 agents (était 3)
//   - Déclencheur calendrier : openTeamMeetingWithEvent() pré-contextualise
//   - Persistance thread Supabase (threadId passé au backend)
//   - Onglet historique : liste des réunions passées depuis meeting_threads
//   - Badge sidebar si trigger actif (compétition dans 72h)
//   - checkMeetingTrigger() : détecte les events compétition dans 48-96h
//
// Dépend des globals : currentUser, currentLang, AGENTS, T, sb,
//                      getDailyLogContext, dateToStr, escapeHtml, userProfile,
//                      showPage (navigation principale)
// ═══════════════════════════════════════════════════════════════════

let _teamMeetingSelectedAgents = [];
let _teamMeetingHistory = [];
let _teamMeetingActive = false;
let _teamMeetingThreadId = null;       // v63.31 — persistance
let _teamMeetingCalendarEventId = null; // v63.31 — contexte event
let _teamMeetingTab = 'new';           // v63.31 — 'new' | 'history'

const _TEAM_MEETING_MAX_TURNS = 5;
const _TEAM_MEETING_MAX_AGENTS = 4;    // v63.31 — était 3

const _TEAM_MEETING_DEFAULT_AGENTS = ['physique', 'recuperation', 'sommeil'];

const _TEAM_MEETING_PICKABLE_AGENTS = [
  'physique', 'recuperation', 'sommeil',
  'mental', 'nutrition', 'equipe',
  'finance', 'contrats'
];

// ═══════════════════════════════════════════════════════════════════
// NAVIGATION — ouvrir la page /reunion
// ═══════════════════════════════════════════════════════════════════

// Ouvre la page réunion normalement (accès sidebar).
function openTeamMeeting() {
  if (typeof showPage === 'function') showPage('reunion');
  _initReunionPage();
}

// v63.31 — Ouvre la page avec un event calendrier pré-contextualisé (trigger card).
// suggestedAgents : tableau d'agentIds (ex. ['physique', 'mental', 'nutrition'])
function openTeamMeetingWithEvent(eventId, eventTitle, eventDate, suggestedAgents) {
  _teamMeetingCalendarEventId = eventId || null;
  if (typeof showPage === 'function') showPage('reunion');
  _initReunionPage({ eventId, eventTitle, eventDate, suggestedAgents });
}

// Appelée à chaque fois que la page reunion devient visible.
function _initReunionPage(context) {
  _setTab('new');
  _resetMeetingState();
  if (context?.suggestedAgents?.length) {
    _teamMeetingSelectedAgents = context.suggestedAgents.slice(0, _TEAM_MEETING_MAX_AGENTS);
  }
  if (context?.calendarEventId) {
    _teamMeetingCalendarEventId = context.calendarEventId;
  }
  _renderReunionContextHeader(context);
  _renderTeamMeetingResultsArea();
  _renderTeamMeetingAgentChips();
  _resetComposerState();
  // Focus textarea
  setTimeout(() => {
    const ta = document.getElementById('teamMeetingQuestion');
    if (ta) ta.focus();
  }, 80);
}

function _resetMeetingState() {
  _teamMeetingHistory = [];
  _teamMeetingActive = false;
  _teamMeetingThreadId = null;
  _teamMeetingCalendarEventId = null;
  _teamMeetingSelectedAgents = [..._TEAM_MEETING_DEFAULT_AGENTS];
}

// ═══════════════════════════════════════════════════════════════════
// TABS — Nouvelle réunion / Historique
// ═══════════════════════════════════════════════════════════════════

function _setTab(tab) {
  _teamMeetingTab = tab;
  const btnNew  = document.getElementById('tmTabNew');
  const btnHist = document.getElementById('tmTabHistory');
  const zoneNew = document.getElementById('tmZoneNew');
  const zoneHist = document.getElementById('tmZoneHistory');
  if (!btnNew || !btnHist || !zoneNew || !zoneHist) return;

  if (tab === 'new') {
    btnNew.style.color = '#f59e0b';
    btnNew.style.borderBottomColor = '#f59e0b';
    btnHist.style.color = 'var(--muted)';
    btnHist.style.borderBottomColor = 'transparent';
    zoneNew.style.display = '';
    zoneHist.style.display = 'none';
  } else {
    btnHist.style.color = '#f59e0b';
    btnHist.style.borderBottomColor = '#f59e0b';
    btnNew.style.color = 'var(--muted)';
    btnNew.style.borderBottomColor = 'transparent';
    zoneNew.style.display = 'none';
    zoneHist.style.display = '';
    _loadMeetingHistory();
  }
}

function tmSwitchTab(tab) {
  _setTab(tab);
}

// ═══════════════════════════════════════════════════════════════════
// CONTEXT HEADER — affiche l'event pré-contextualisé si fourni
// ═══════════════════════════════════════════════════════════════════

function _renderReunionContextHeader(context) {
  const el = document.getElementById('tmContextHeader');
  if (!el) return;
  if (context?.eventTitle && context?.eventDate) {
    const dateFormatted = (() => {
      try {
        const d = new Date(context.eventDate + 'T12:00:00');
        return d.toLocaleDateString(currentLang === 'fr' ? 'fr-CH' :
          currentLang === 'de' ? 'de-CH' : currentLang === 'it' ? 'it-CH' : 'en-CH',
          { weekday: 'short', day: 'numeric', month: 'long' });
      } catch (_) { return context.eventDate; }
    })();
    el.innerHTML = `
      <div style="display:flex;align-items:center;gap:8px;padding:10px 16px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);border-radius:10px;margin-bottom:12px">
        <span style="font-size:16px">🗓</span>
        <div style="flex:1">
          <div style="font-size:12px;font-weight:700;color:#f59e0b">${escapeHtml(context.eventTitle)}</div>
          <div style="font-size:11px;color:var(--muted)">${escapeHtml(dateFormatted)}${context.eventTime ? ' · ' + context.eventTime : ''}</div>
        </div>
        <button onclick="_clearReunionContext()" style="background:none;border:none;color:var(--muted);font-size:12px;cursor:pointer;padding:4px">✕</button>
      </div>
    `;
    el.style.display = '';
  } else {
    el.innerHTML = '';
    el.style.display = 'none';
  }
}

function _clearReunionContext() {
  _teamMeetingCalendarEventId = null;
  const el = document.getElementById('tmContextHeader');
  if (el) { el.innerHTML = ''; el.style.display = 'none'; }
}

// ═══════════════════════════════════════════════════════════════════
// NOUVEAU THREAD — reset dans la même page
// ═══════════════════════════════════════════════════════════════════

function newTeamMeetingThread() {
  _resetMeetingState();
  _renderReunionContextHeader(null);
  _renderTeamMeetingResultsArea();
  _renderTeamMeetingAgentChips();
  _resetComposerState();
  setTimeout(() => {
    const ta = document.getElementById('teamMeetingQuestion');
    if (ta) ta.focus();
  }, 50);
}

// ═══════════════════════════════════════════════════════════════════
// COMPOSER — état et rendu
// ═══════════════════════════════════════════════════════════════════

function _resetComposerState() {
  const ta = document.getElementById('teamMeetingQuestion');
  if (ta) {
    ta.value = '';
    ta.disabled = false;
    ta.placeholder = (T?.[currentLang]?.teamMeetingPlaceholder) ||
      'Ex: Je me sens fatigué avant un match dans 3 jours, que faire ?';
  }
  const submitBtn = document.getElementById('teamMeetingSubmit');
  if (submitBtn) {
    submitBtn.disabled = false;
    submitBtn.textContent = (T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion';
  }
  const newBtn = document.getElementById('teamMeetingNewBtn');
  if (newBtn) newBtn.style.display = 'none';
  const headerTurn = document.getElementById('teamMeetingHeaderTurn');
  if (headerTurn) { headerTurn.style.display = 'none'; headerTurn.textContent = ''; }
  const agentsBlock = document.getElementById('teamMeetingAgentsBlock');
  if (agentsBlock) agentsBlock.style.display = '';
}

function _updateComposerForActiveThread() {
  const ta = document.getElementById('teamMeetingQuestion');
  const submitBtn = document.getElementById('teamMeetingSubmit');
  const newBtn = document.getElementById('teamMeetingNewBtn');
  const headerTurn = document.getElementById('teamMeetingHeaderTurn');
  const agentsBlock = document.getElementById('teamMeetingAgentsBlock');

  if (newBtn) {
    newBtn.style.display = '';
    newBtn.title = (T?.[currentLang]?.teamMeetingNewMeeting) || 'Nouvelle réunion';
  }
  // v63.31 — Agents block reste visible (meilleur contexte pour les follow-ups)
  if (agentsBlock) agentsBlock.style.display = '';

  if (headerTurn) {
    const turn = _teamMeetingHistory.length;
    const tpl = (T?.[currentLang]?.teamMeetingTurnCounter) || 'Tour {n}/{max}';
    headerTurn.textContent = '· ' + tpl.replace('{n}', turn).replace('{max}', _TEAM_MEETING_MAX_TURNS);
    headerTurn.style.display = '';
    headerTurn.style.color = (turn >= _TEAM_MEETING_MAX_TURNS) ? '#ef4444' : 'var(--muted)';
  }

  if (_teamMeetingHistory.length >= _TEAM_MEETING_MAX_TURNS) {
    if (ta) { ta.disabled = true; ta.placeholder = (T?.[currentLang]?.teamMeetingMaxTurnsReached) || 'Limite de tours atteinte'; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = (T?.[currentLang]?.teamMeetingMaxTurnsTitle) || 'Limite atteinte'; }
  } else {
    if (ta) { ta.disabled = false; ta.value = ''; ta.placeholder = (T?.[currentLang]?.teamMeetingFollowupPlaceholder) || 'Pose une question de suivi…'; ta.focus(); }
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = (T?.[currentLang]?.teamMeetingFollowupSubmit) || 'Envoyer'; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// RESULTS AREA — thread + synthèse
// ═══════════════════════════════════════════════════════════════════

function _renderTeamMeetingResultsArea() {
  const resultsEl = document.getElementById('teamMeetingResults');
  if (!resultsEl) return;
  if (_teamMeetingHistory.length === 0) {
    resultsEl.innerHTML = `
      <div style="text-align:center;padding:40px 16px;color:var(--muted);font-size:12px;line-height:1.6">
        <div style="font-size:36px;margin-bottom:12px">💬</div>
        <div style="font-size:13px;color:var(--text);font-weight:700;margin-bottom:8px">${escapeHtml((T?.[currentLang]?.teamMeetingEmptyTitle) || 'Démarre la réunion')}</div>
        <div style="max-width:280px;margin:0 auto">${escapeHtml((T?.[currentLang]?.teamMeetingEmptyHint) || 'Sélectionne 2-4 agents et pose ta question. Ils répondent ensemble depuis leur domaine d\'expertise, puis l\'équipe te donne une décision commune.')}</div>
      </div>
    `;
  } else {
    resultsEl.innerHTML = _renderThreadHtml(_teamMeetingHistory);
    _scrollThreadToBottom();
  }
}

function _scrollThreadToBottom() {
  const resultsEl = document.getElementById('teamMeetingResults');
  if (resultsEl) requestAnimationFrame(() => { resultsEl.scrollTop = resultsEl.scrollHeight; });
}

// ═══════════════════════════════════════════════════════════════════
// AGENT CHIPS
// ═══════════════════════════════════════════════════════════════════

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
    chip.style.cssText = `padding:6px 10px;border-radius:16px;border:1px solid ${isSelected ? '#f59e0b' : 'var(--border)'};background:${isSelected ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'transparent'};color:${isSelected ? '#07091a' : 'var(--text)'};font-size:11px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;margin:2px`;
    chip.textContent = (agent.emoji ? agent.emoji + ' ' : '') + agent.name;
    chip.onclick = () => _toggleTeamMeetingAgent(aid);
    container.appendChild(chip);
  });

  const counter = document.getElementById('teamMeetingCounter');
  if (counter) {
    const count = _teamMeetingSelectedAgents.length;
    // v63.31 — max 4
    const tpl = (T?.[currentLang]?.teamMeetingCounter) || '{n}/{max} agents sélectionnés';
    counter.textContent = tpl.replace('{n}', count).replace('{max}', _TEAM_MEETING_MAX_AGENTS);
  }
}

function _toggleTeamMeetingAgent(agentId) {
  const idx = _teamMeetingSelectedAgents.indexOf(agentId);
  if (idx >= 0) {
    if (_teamMeetingSelectedAgents.length <= 2) return; // minimum 2
    _teamMeetingSelectedAgents.splice(idx, 1);
  } else {
    if (_teamMeetingSelectedAgents.length >= _TEAM_MEETING_MAX_AGENTS) return; // maximum 4
    _teamMeetingSelectedAgents.push(agentId);
  }
  _renderTeamMeetingAgentChips();
}

// ═══════════════════════════════════════════════════════════════════
// SUBMIT — appel backend + affichage synthèse
// ═══════════════════════════════════════════════════════════════════

async function submitTeamMeeting() {
  const ta = document.getElementById('teamMeetingQuestion');
  const submitBtn = document.getElementById('teamMeetingSubmit');
  const resultsEl = document.getElementById('teamMeetingResults');
  if (!ta || !submitBtn || !resultsEl) return;

  const question = (ta.value || '').trim();
  if (question.length < 10) {
    _flashErrorInline((T?.[currentLang]?.teamMeetingErrShort) || 'Question trop courte (min 10 caractères)');
    return;
  }
  if (_teamMeetingSelectedAgents.length < 2) {
    _flashErrorInline((T?.[currentLang]?.teamMeetingErrAgents) || 'Sélectionne au moins 2 agents');
    return;
  }
  if (_teamMeetingHistory.length >= _TEAM_MEETING_MAX_TURNS) {
    _flashErrorInline((T?.[currentLang]?.teamMeetingMaxTurnsReached) || 'Limite de tours atteinte. Démarre une nouvelle réunion.');
    return;
  }

  // Loading state
  submitBtn.disabled = true;
  submitBtn.textContent = (T?.[currentLang]?.teamMeetingLoading) || 'Réunion en cours…';
  ta.disabled = true;

  const isFollowup = _teamMeetingActive && _teamMeetingHistory.length > 0;

  // Optimistic UI : question pending + loader
  const optimisticHtml = _renderOptimisticQuestion(question, _teamMeetingHistory.length + 1);
  const loaderHtml = _renderLoader();
  if (isFollowup) {
    resultsEl.innerHTML = _renderThreadHtml(_teamMeetingHistory) + optimisticHtml + loaderHtml;
  } else {
    resultsEl.innerHTML = optimisticHtml + loaderHtml;
  }
  _scrollThreadToBottom();

  // JWT
  let accessToken = null;
  try {
    const { data: { session } } = await sb.auth.getSession();
    accessToken = session?.access_token;
  } catch (e) { console.warn('[TEAM_MEETING] getSession error:', e); }

  if (!accessToken) {
    _renderError(resultsEl, 'Session expirée. Reconnecte-toi.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  // Contexte enrichi (seulement au 1er tour)
  let dailyLog = '', calendar = '', profile = '';
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
          .limit(7);
        if (evts?.length) {
          calendar = evts.map(e => `- ${e.event_date}${e.event_time ? ' ' + e.event_time : ''} : ${e.title} (${e.event_type})`).join('\n');
        }
      }
    } catch (_) {}
  }

  let resp;
  try {
    resp = await fetch('/.netlify/functions/meeting', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + accessToken },
      body: JSON.stringify({
        question,
        agentIds: _teamMeetingSelectedAgents,
        history: _teamMeetingHistory,
        lang: currentLang || 'fr',
        profile, calendar, dailyLog,
        threadId: _teamMeetingThreadId || null,              // v63.31
        calendarEventId: _teamMeetingCalendarEventId || null  // v63.31
      })
    });
  } catch (netErr) {
    _renderError(resultsEl, (T?.[currentLang]?.teamMeetingErrNetwork) || 'Erreur réseau. Réessaie.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  let data;
  try { data = await resp.json(); } catch (_) {
    _renderError(resultsEl, 'Réponse invalide du serveur.');
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
    _renderError(resultsEl, (T?.[currentLang]?.teamMeetingErrServer) || 'Erreur serveur. Réessaie dans un instant.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  // Succès
  const responses = data.responses || [];
  const synthesis = data.synthesis || null;          // v63.31
  const returnedThreadId = data.threadId || null;    // v63.31

  // Persister le threadId pour les tours suivants
  if (returnedThreadId) _teamMeetingThreadId = returnedThreadId;

  _teamMeetingHistory.push({ question, responses, synthesis });
  _teamMeetingActive = true;

  // Re-render thread complet avec synthèse
  // Re-fetch resultsEl: renderReunion() peut avoir remplacé le DOM si l'utilisateur a navigué
  const liveResultsEl = document.getElementById('teamMeetingResults');
  if (liveResultsEl) {
    liveResultsEl.innerHTML = _renderThreadHtml(_teamMeetingHistory);
    _scrollThreadToBottom();
    _updateComposerForActiveThread();
    _renderTeamMeetingAgentChips();
  }
}

function _restoreSubmitButton(btn, ta) {
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = _teamMeetingActive
    ? ((T?.[currentLang]?.teamMeetingFollowupSubmit) || 'Envoyer')
    : ((T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion');
  if (ta) ta.disabled = false;
}

// ═══════════════════════════════════════════════════════════════════
// RENDER HELPERS
// ═══════════════════════════════════════════════════════════════════

function _renderLoader() {
  return '<div id="tm-loader" style="text-align:center;padding:24px;color:var(--muted);font-size:13px">' +
    '<div style="display:inline-block;width:28px;height:28px;border:3px solid #1e2d47;border-top-color:#f59e0b;border-radius:50%;animation:tm-spin 0.8s linear infinite;margin-bottom:8px"></div>' +
    '<div>' + escapeHtml((T?.[currentLang]?.teamMeetingThinking) || 'Tes agents réfléchissent ensemble…') + '</div>' +
    '</div><style>@keyframes tm-spin{to{transform:rotate(360deg)}}</style>';
}

function _renderOptimisticQuestion(question, turnNum) {
  return `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:18px">` +
    `<div style="flex-shrink:0;width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center">${turnNum}</div>` +
    `<div style="flex:1;padding-top:3px">` +
    `<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px">${escapeHtml((T?.[currentLang]?.teamMeetingQuestionLabel) || 'Question')}</div>` +
    `<div style="font-size:14px;color:var(--text);font-weight:600;line-height:1.45">${escapeHtml(question)}</div>` +
    `</div></div>`;
}

// v63.31.1 — Redesign layout : card avec header coloré par agent, gap 12px, padding généreux.
function _renderThreadHtml(history) {
  let html = '';
  history.forEach((turn, idx) => {
    // Séparateur entre tours
    if (idx > 0) {
      html += `<div style="border-top:1px solid var(--border);margin:28px 0 20px"></div>`;
    }

    // Question header
    html += `<div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:18px">`;
    html += `<div style="flex-shrink:0;width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center">${idx + 1}</div>`;
    html += `<div style="flex:1;padding-top:3px">`;
    html += `<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:0.5px;font-weight:600;margin-bottom:4px">${escapeHtml((T?.[currentLang]?.teamMeetingQuestionLabel) || 'Question')}</div>`;
    html += `<div style="font-size:14px;color:var(--text);font-weight:600;line-height:1.45">${escapeHtml(turn.question)}</div>`;
    html += `</div></div>`;

    // Cards agents — gap 12px, indentées sous la question
    html += `<div style="display:flex;flex-direction:column;gap:12px;margin-left:40px;margin-bottom:14px">`;

    (turn.responses || []).forEach(r => {
      if (r.error) {
        html += `<div style="border:1px solid rgba(239,68,68,0.3);border-radius:12px;overflow:hidden">
          <div style="padding:10px 14px;background:rgba(239,68,68,0.1);border-bottom:1px solid rgba(239,68,68,0.2)">
            <span style="font-size:12px;font-weight:700;color:#ef4444">${escapeHtml(r.agent_name || r.agentId)}</span>
          </div>
          <div style="padding:12px 14px;font-size:12px;color:#ef4444">${escapeHtml((T?.[currentLang]?.teamMeetingErrAgent) || 'Cet agent n\'a pas pu répondre cette fois.')}</div>
        </div>`;
        return;
      }
      const agentObj = (typeof AGENTS !== 'undefined' && AGENTS[r.agentId]) ? AGENTS[r.agentId] : null;
      const emoji = agentObj?.emoji || '🧑‍💼';
      const color = agentObj?.color || '#f59e0b';
      const replyHtml = (r.reply || '').split('\n').map(line => escapeHtml(line)).join('<br>');
      // Header band coloré (couleur agent en 8-digit hex : XX = opacité)
      html += `<div style="border:1px solid ${color}40;border-radius:12px;overflow:hidden">
        <div style="padding:10px 14px;background:${color}18;border-bottom:1px solid ${color}25;display:flex;align-items:center;gap:8px">
          <span style="font-size:18px;line-height:1">${emoji}</span>
          <div>
            <div style="font-size:12px;font-weight:700;color:var(--text)">${escapeHtml(r.agent_name)}</div>
            <div style="font-size:10px;color:var(--muted)">${escapeHtml(r.agent_title || '')}</div>
          </div>
        </div>
        <div style="padding:14px;font-size:13px;color:var(--text);line-height:1.6">${replyHtml}</div>
      </div>`;
    });

    html += `</div>`;

    // Bloc synthèse "Décision de l'équipe"
    if (turn.synthesis) {
      html += _renderSynthesisBlock(turn.synthesis);
    }
  });
  return html;
}

// v63.31.1 — Bloc synthèse : même card design, header doré, bullets →
function _renderSynthesisBlock(synthesisText) {
  if (!synthesisText) return '';
  const lines = synthesisText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
  const bullets = lines.map(l => l.replace(/^[•\-\*\d+\.\s]+/, '').trim()).filter(l => l.length > 3);

  let bulletsHtml = '';
  bullets.forEach(b => {
    bulletsHtml += `<div style="display:flex;gap:10px;margin-bottom:8px;align-items:flex-start">
      <span style="color:#f59e0b;font-weight:800;flex-shrink:0;font-size:14px;line-height:1.4">→</span>
      <span style="font-size:13px;line-height:1.5">${escapeHtml(b)}</span>
    </div>`;
  });

  if (!bulletsHtml) {
    bulletsHtml = `<div style="font-size:13px;color:var(--text);line-height:1.5">${escapeHtml(synthesisText)}</div>`;
  }

  return `<div style="margin-left:40px;border:1px solid rgba(245,158,11,0.45);border-radius:12px;overflow:hidden">
    <div style="padding:10px 14px;background:linear-gradient(135deg,rgba(245,158,11,0.18),rgba(217,119,6,0.1));border-bottom:1px solid rgba(245,158,11,0.25);display:flex;align-items:center;gap:8px">
      <span style="font-size:16px">✅</span>
      <span style="font-size:11px;font-weight:800;color:#f59e0b;text-transform:uppercase;letter-spacing:0.6px">${escapeHtml((T?.[currentLang]?.teamMeetingDecision) || 'Décision de l\'équipe')}</span>
    </div>
    <div style="padding:14px;color:var(--text)">${bulletsHtml}</div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════════════
// ERROR / PAYWALL / QUOTA HELPERS
// ═══════════════════════════════════════════════════════════════════

function _flashErrorInline(msg) {
  const resultsEl = document.getElementById('teamMeetingResults');
  if (!resultsEl) return;
  const errBlock = '<div style="color:#ef4444;padding:10px 12px;font-size:12px;border:1px solid #ef4444;border-radius:8px;background:rgba(239,68,68,0.08);margin-bottom:12px">⚠️ ' + escapeHtml(msg) + '</div>';
  if (_teamMeetingHistory.length > 0) {
    resultsEl.innerHTML = errBlock + _renderThreadHtml(_teamMeetingHistory);
  } else {
    resultsEl.innerHTML = errBlock;
  }
  _scrollThreadToBottom();
}

function _renderError(resultsEl, msg) {
  if (!resultsEl) return;
  resultsEl.innerHTML = '<div style="color:#ef4444;padding:16px;font-size:13px;border:1px solid #ef4444;border-radius:10px;background:rgba(239,68,68,0.06);text-align:center">⚠️ ' + escapeHtml(msg) + '</div>';
}

function _renderPaywall(resultsEl) {
  resultsEl.innerHTML = `
    <div style="text-align:center;padding:32px 16px;border:1px solid #f59e0b;border-radius:12px;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(217,119,6,0.04));margin:auto">
      <div style="font-size:32px;margin-bottom:8px">🔒</div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${escapeHtml((T?.[currentLang]?.teamMeetingLockedTitle) || 'Réunion d\'équipe — Plus & Pro')}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:16px">${escapeHtml((T?.[currentLang]?.teamMeetingLockedBody) || 'Demande à 2-4 agents experts de répondre ensemble. Disponible avec le plan Plus (2/mois) et Pro (illimité).')}</div>
      <button onclick="showPage('abonnement')" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${escapeHtml((T?.[currentLang]?.teamMeetingUpgrade) || 'Voir les plans')}</button>
    </div>
  `;
}

function _renderQuotaExceeded(resultsEl, data) {
  const isMaxTurns = data?.error === 'max_turns_reached';
  resultsEl.innerHTML = `
    <div style="text-align:center;padding:32px 16px;border:1px solid #f59e0b;border-radius:12px;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(217,119,6,0.04))">
      <div style="font-size:32px;margin-bottom:8px">${isMaxTurns ? '🔄' : '⏳'}</div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${escapeHtml(isMaxTurns ? ((T?.[currentLang]?.teamMeetingMaxTurnsTitle) || 'Limite de tours atteinte') : ((T?.[currentLang]?.teamMeetingQuotaTitle) || 'Quota mensuel atteint'))}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:16px">${escapeHtml(data?.message || '')}</div>
      ${isMaxTurns
        ? `<button onclick="newTeamMeetingThread()" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${escapeHtml((T?.[currentLang]?.teamMeetingNewMeeting) || 'Nouvelle réunion')}</button>`
        : (data?.upgrade_to === 'pro'
            ? `<button onclick="showPage('abonnement')" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${escapeHtml((T?.[currentLang]?.teamMeetingUpgradePro) || 'Passer en Pro')}</button>`
            : '')
      }
    </div>
  `;
}

// ═══════════════════════════════════════════════════════════════════
// HISTORIQUE — charge meeting_threads depuis Supabase
// ═══════════════════════════════════════════════════════════════════

async function _loadMeetingHistory() {
  const el = document.getElementById('tmZoneHistory');
  if (!el) return;
  if (!currentUser?.id) {
    el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Connecte-toi pour voir ton historique.</div>';
    return;
  }

  el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Chargement…</div>';

  try {
    const { data: threads, error } = await sb
      .from('meeting_threads')
      .select('id, created_at, agent_ids, turns, synthesis, calendar_event_id')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) throw error;
    if (!threads || threads.length === 0) {
      el.innerHTML = `<div style="padding:40px 16px;text-align:center;color:var(--muted);font-size:12px">
        <div style="font-size:28px;margin-bottom:8px">📋</div>
        <div>${escapeHtml((T?.[currentLang]?.teamMeetingHistoryEmpty) || 'Aucune réunion passée. Lance ta première réunion !')}</div>
      </div>`;
      return;
    }

    let html = '';
    threads.forEach(thread => {
      const date = (() => {
        try { return new Date(thread.created_at).toLocaleDateString('fr-CH', { day: 'numeric', month: 'short', year: 'numeric' }); }
        catch (_) { return thread.created_at?.slice(0, 10) || ''; }
      })();
      const turns = Array.isArray(thread.turns) ? thread.turns : [];
      const firstQ = turns[0]?.question || '';
      const agentNames = (thread.agent_ids || []).map(aid => {
        const a = typeof AGENTS !== 'undefined' ? AGENTS[aid] : null;
        return a ? (a.emoji || '') + ' ' + a.name : aid;
      }).join(', ');

      html += `<div onclick="_openHistoryThread(${JSON.stringify(thread.id)})" style="border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;cursor:pointer;transition:border-color 0.15s" onmouseover="this.style.borderColor='#f59e0b'" onmouseout="this.style.borderColor='var(--border)'">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <div style="font-size:10px;color:var(--muted)">${escapeHtml(date)} · ${turns.length} tour${turns.length > 1 ? 's' : ''}</div>
          <div style="font-size:10px;color:var(--muted)">${escapeHtml(agentNames)}</div>
        </div>
        <div style="font-size:12px;color:var(--text);font-weight:600;line-height:1.4;margin-bottom:${thread.synthesis ? '8px' : '0'}">${escapeHtml(firstQ.slice(0, 120))}${firstQ.length > 120 ? '…' : ''}</div>
        ${thread.synthesis ? `<div style="font-size:11px;color:var(--muted);font-style:italic;line-height:1.4">${escapeHtml(thread.synthesis.split('\n')[0]?.slice(0, 100) || '')}…</div>` : ''}
      </div>`;
    });

    el.innerHTML = html;
  } catch (e) {
    console.warn('[TEAM_MEETING] _loadMeetingHistory error:', e);
    el.innerHTML = '<div style="padding:24px;text-align:center;color:#ef4444;font-size:12px">Erreur de chargement de l\'historique.</div>';
  }
}

// Ouvre un thread historique (recharge dans la vue "Nouvelle réunion" en lecture seule)
async function _openHistoryThread(threadId) {
  if (!threadId) return;
  const el = document.getElementById('tmZoneHistory');
  if (el) el.innerHTML = '<div style="padding:24px;text-align:center;color:var(--muted);font-size:12px">Chargement…</div>';

  try {
    const { data: thread, error } = await sb
      .from('meeting_threads')
      .select('id, created_at, agent_ids, turns, synthesis')
      .eq('id', threadId)
      .single();

    if (error || !thread) throw error || new Error('not found');

    // Switcher vers l'onglet "nouvelle" pour afficher le thread en lecture
    _setTab('new');
    _teamMeetingHistory = thread.turns || [];
    _teamMeetingActive = false;
    _teamMeetingThreadId = thread.id;
    _teamMeetingSelectedAgents = thread.agent_ids || [..._TEAM_MEETING_DEFAULT_AGENTS];

    const resultsEl = document.getElementById('teamMeetingResults');
    if (resultsEl) {
      resultsEl.innerHTML = _renderThreadHtml(_teamMeetingHistory);
      _scrollThreadToBottom();
    }
    _renderTeamMeetingAgentChips();

    // Mode lecture : désactiver le composer
    const ta = document.getElementById('teamMeetingQuestion');
    const submitBtn = document.getElementById('teamMeetingSubmit');
    if (ta) { ta.disabled = true; ta.placeholder = 'Réunion archivée — lance une nouvelle réunion pour continuer.'; }
    if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Archivé'; }
    const newBtn = document.getElementById('teamMeetingNewBtn');
    if (newBtn) { newBtn.style.display = ''; }
    const headerTurn = document.getElementById('teamMeetingHeaderTurn');
    if (headerTurn) { headerTurn.style.display = 'none'; }
  } catch (e) {
    console.warn('[TEAM_MEETING] _openHistoryThread error:', e);
  }
}

// ═══════════════════════════════════════════════════════════════════
// TRIGGER CALENDRIER — badge sidebar + card dashboard
// Vérifie si une compétition/match est dans 48-96h.
// Appelé par checkMeetingTrigger() au chargement du dashboard.
// ═══════════════════════════════════════════════════════════════════

async function checkMeetingTrigger() {
  if (!currentUser?.id) return;
  try {
    const now = new Date();
    const minDate = new Date(now.getTime() + 48 * 3600 * 1000).toISOString().slice(0, 10);
    const maxDate = new Date(now.getTime() + 96 * 3600 * 1000).toISOString().slice(0, 10);

    const { data: events } = await sb
      .from('calendar_events')
      .select('id, title, event_type, event_date, event_time')
      .eq('user_id', currentUser.id)
      .in('event_type', ['competition', 'match'])
      .gte('event_date', minDate)
      .lte('event_date', maxDate)
      .order('event_date', { ascending: true })
      .limit(1);

    if (!events || events.length === 0) {
      _hideMeetingTriggerCard();
      _hideSidebarBadge();
      return;
    }

    const evt = events[0];

    // Vérifier si déjà dismissé (localStorage, 7j)
    const dismissKey = `sv_mtrigger_dismissed_${evt.id}`;
    const dismissedUntil = localStorage.getItem(dismissKey);
    if (dismissedUntil && Date.now() < parseInt(dismissedUntil, 10)) {
      _hideMeetingTriggerCard();
      _hideSidebarBadge();
      return;
    }

    // Agents suggérés selon type
    const suggested = evt.event_type === 'competition' || evt.event_type === 'match'
      ? ['physique', 'mental', 'nutrition']
      : ['physique', 'mental'];

    // Afficher badge sidebar
    _showSidebarBadge();

    // Afficher card dashboard
    _showMeetingTriggerCard(evt, suggested);
  } catch (e) {
    console.warn('[TEAM_MEETING] checkMeetingTrigger error (non-blocking):', e.message);
  }
}

function _showSidebarBadge() {
  const badge = document.getElementById('reunionSidebarBadge');
  if (badge) badge.style.display = '';
}

function _hideSidebarBadge() {
  const badge = document.getElementById('reunionSidebarBadge');
  if (badge) badge.style.display = 'none';
}

function _showMeetingTriggerCard(evt, suggestedAgents) {
  const card = document.getElementById('meetingTriggerCard');
  if (!card) return;

  const dateFormatted = (() => {
    try {
      const d = new Date(evt.event_date + 'T12:00:00');
      return d.toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });
    } catch (_) { return evt.event_date; }
  })();

  // Calculer "dans X jours"
  const daysUntil = Math.round((new Date(evt.event_date + 'T12:00:00') - new Date()) / (24 * 3600 * 1000));
  const daysLabel = daysUntil <= 1 ? 'demain' : `dans ${daysUntil} jours`;

  card.innerHTML = `
    <div style="display:flex;align-items:flex-start;gap:12px;padding:14px 16px;background:linear-gradient(135deg,rgba(245,158,11,0.1),rgba(217,119,6,0.06));border:1px solid rgba(245,158,11,0.5);border-radius:12px;margin-bottom:16px">
      <span style="font-size:24px;flex-shrink:0">⚡</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:13px;font-weight:700;color:#f59e0b;margin-bottom:3px">${escapeHtml(evt.title)} — ${escapeHtml(daysLabel)}</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:10px">${escapeHtml(dateFormatted)}${evt.event_time ? ' · ' + evt.event_time : ''} · Ton équipe est prête</div>
        <button onclick="openTeamMeetingWithEvent('${escapeHtml(evt.id)}','${escapeHtml(evt.title).replace(/'/g,'\\\'').replace(/"/g,'&quot;')}','${escapeHtml(evt.event_date)}',${JSON.stringify(suggestedAgents)})" style="padding:8px 14px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:12px;cursor:pointer;font-family:Inter,sans-serif">Démarrer la réunion →</button>
      </div>
      <button onclick="_dismissMeetingTrigger('${escapeHtml(evt.id)}')" style="background:none;border:none;color:var(--muted);font-size:14px;cursor:pointer;flex-shrink:0;padding:0;line-height:1" title="Ne plus afficher">✕</button>
    </div>
  `;
  card.style.display = '';
}

function _hideMeetingTriggerCard() {
  const card = document.getElementById('meetingTriggerCard');
  if (card) { card.innerHTML = ''; card.style.display = 'none'; }
}

function _dismissMeetingTrigger(eventId) {
  if (!eventId) return;
  const dismissKey = `sv_mtrigger_dismissed_${eventId}`;
  localStorage.setItem(dismissKey, String(Date.now() + 7 * 24 * 3600 * 1000));
  _hideMeetingTriggerCard();
  _hideSidebarBadge();
}
