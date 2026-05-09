// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — TEAM MEETING (multi-agent meeting MVP + threading + UX chat)
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5.
// v63.0.0 — Idée 7 STRATEGIE / audit 4.3 = killer feature ProductHunt.
// v63.1.0 — Threading multi-tour : 1 meeting = 1 thread, 5 tours max par thread.
// v63.1.1 — Refonte UX : composer en bas, thread scrollable au-dessus
//           (pattern chat standard WhatsApp/ChatGPT, fini de scroller en haut
//           pour poser un follow-up).
//
// Structure modal :
//   ┌────────────────────┐
//   │ header (titre + ✕) │ ← fixe top
//   ├────────────────────┤
//   │                    │
//   │  thread scrollable │ ← flex:1, auto-scroll bas
//   │   (turns + cards)  │
//   │                    │
//   ├────────────────────┤
//   │  chips agents      │
//   │  textarea          │ ← fixe bottom
//   │  ↻ + Submit btn    │
//   └────────────────────┘
//
// Quotas : Plus = 2 meetings/mois × 5 tours, Pro = illimité × 5 tours.
// Dépend des globals : currentUser, currentLang, AGENTS, T, sb, getDailyLogContext,
//                      dateToStr, escapeHtml, userProfile.
// ═══════════════════════════════════════════════════════════════════

let _teamMeetingSelectedAgents = [];
let _teamMeetingHistory = [];
let _teamMeetingActive = false;
const _TEAM_MEETING_MAX_TURNS = 5;

const _TEAM_MEETING_DEFAULT_AGENTS = ['physique', 'recuperation', 'sommeil'];

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
  // Reset state complet à chaque ouverture
  _teamMeetingSelectedAgents = [..._TEAM_MEETING_DEFAULT_AGENTS];
  _teamMeetingHistory = [];
  _teamMeetingActive = false;

  _resetComposerState();
  _renderTeamMeetingResultsArea();
  _renderTeamMeetingAgentChips();
  modal.style.display = 'flex';

  // Focus textarea pour fluidity
  setTimeout(() => {
    const ta = document.getElementById('teamMeetingQuestion');
    if (ta) ta.focus();
  }, 50);
}

function closeTeamMeeting() {
  const modal = document.getElementById('teamMeetingModal');
  if (modal) modal.style.display = 'none';
}

// v63.1.0 — Reset le thread mais garde la modal ouverte.
function newTeamMeetingThread() {
  _teamMeetingHistory = [];
  _teamMeetingActive = false;
  _teamMeetingSelectedAgents = [..._TEAM_MEETING_DEFAULT_AGENTS];
  _resetComposerState();
  _renderTeamMeetingResultsArea();
  _renderTeamMeetingAgentChips();
  setTimeout(() => {
    const ta = document.getElementById('teamMeetingQuestion');
    if (ta) ta.focus();
  }, 50);
}

// Reset l'état du composer (textarea, bouton submit, bouton "Nouvelle réunion",
// header turn counter, agents block). Centralisé pour cohérence.
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
  // Hide "Nouvelle réunion" + turn counter (pas de thread actif)
  const newBtn = document.getElementById('teamMeetingNewBtn');
  if (newBtn) newBtn.style.display = 'none';
  const headerTurn = document.getElementById('teamMeetingHeaderTurn');
  if (headerTurn) {
    headerTurn.style.display = 'none';
    headerTurn.textContent = '';
  }
  // Agents block visible (chips picker accessible)
  const agentsBlock = document.getElementById('teamMeetingAgentsBlock');
  if (agentsBlock) agentsBlock.style.display = '';
}

// Met à jour les contrôles du composer selon l'état du thread.
// Appelé après chaque submit réussi pour refléter le nouveau state.
function _updateComposerForActiveThread() {
  const ta = document.getElementById('teamMeetingQuestion');
  const submitBtn = document.getElementById('teamMeetingSubmit');
  const newBtn = document.getElementById('teamMeetingNewBtn');
  const headerTurn = document.getElementById('teamMeetingHeaderTurn');
  const agentsBlock = document.getElementById('teamMeetingAgentsBlock');

  // Show "Nouvelle réunion" button (icon-only, compact)
  if (newBtn) {
    newBtn.style.display = '';
    newBtn.title = (T?.[currentLang]?.teamMeetingNewMeeting) || 'Nouvelle réunion';
  }
  // Hide agents block après 1er tour (gain de place pour le thread)
  if (agentsBlock) agentsBlock.style.display = 'none';

  // Update header turn counter
  if (headerTurn) {
    const turn = _teamMeetingHistory.length;
    const tpl = (T?.[currentLang]?.teamMeetingTurnCounter) || 'Tour {n}/{max}';
    headerTurn.textContent = '· ' + tpl.replace('{n}', turn).replace('{max}', _TEAM_MEETING_MAX_TURNS);
    headerTurn.style.display = '';
    headerTurn.style.color = (turn >= _TEAM_MEETING_MAX_TURNS) ? '#ef4444' : 'var(--muted)';
  }

  // Update textarea + submit button
  if (_teamMeetingHistory.length >= _TEAM_MEETING_MAX_TURNS) {
    if (ta) {
      ta.disabled = true;
      ta.placeholder = (T?.[currentLang]?.teamMeetingMaxTurnsReached) ||
        'Limite de tours atteinte';
    }
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = (T?.[currentLang]?.teamMeetingMaxTurnsTitle) ||
        'Limite atteinte';
    }
  } else {
    if (ta) {
      ta.disabled = false;
      ta.value = '';
      ta.placeholder = (T?.[currentLang]?.teamMeetingFollowupPlaceholder) ||
        'Pose une question de suivi…';
      ta.focus();
    }
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = (T?.[currentLang]?.teamMeetingFollowupSubmit) || 'Envoyer';
    }
  }
}

// Render la zone results (thread).
// - Si pas de thread actif et pas de history : message d'accueil + chips visibles dans le composer
// - Si thread actif : affichage des turns
function _renderTeamMeetingResultsArea() {
  const resultsEl = document.getElementById('teamMeetingResults');
  if (!resultsEl) return;
  if (_teamMeetingHistory.length === 0) {
    // Placeholder d'accueil pour pré-remplir l'espace vide visuellement
    resultsEl.innerHTML = `
      <div style="text-align:center;padding:32px 16px;color:var(--muted);font-size:12px;line-height:1.6">
        <div style="font-size:32px;margin-bottom:12px">💬</div>
        <div style="font-size:13px;color:var(--text);font-weight:600;margin-bottom:6px">${escapeHtml((T?.[currentLang]?.teamMeetingEmptyTitle) || 'Démarre la réunion')}</div>
        <div>${escapeHtml((T?.[currentLang]?.teamMeetingEmptyHint) || 'Sélectionne 2-3 agents et pose ta question. Ils répondent ensemble depuis leur domaine d\'expertise.')}</div>
      </div>
    `;
  } else {
    resultsEl.innerHTML = _renderThreadHtml(_teamMeetingHistory);
    _scrollThreadToBottom();
  }
}

function _scrollThreadToBottom() {
  const resultsEl = document.getElementById('teamMeetingResults');
  if (resultsEl) {
    requestAnimationFrame(() => {
      resultsEl.scrollTop = resultsEl.scrollHeight;
    });
  }
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
    const locked = _teamMeetingActive;
    const opacity = locked ? '0.6' : '1';
    const cursor = locked ? 'not-allowed' : 'pointer';
    // v63.4.0 — fix contraste mode jour : remplace couleurs hardcodées dark-mode par CSS vars theme-aware.
    // Avant : color #f1f5f9 (presque blanc) sur fond transparent → invisible en light mode.
    chip.style.cssText = `padding:6px 10px;border-radius:16px;border:1px solid ${isSelected ? '#f59e0b' : 'var(--border)'};background:${isSelected ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'transparent'};color:${isSelected ? '#07091a' : 'var(--text)'};font-size:11px;font-weight:600;cursor:${cursor};font-family:Inter,sans-serif;display:inline-flex;align-items:center;gap:4px;margin:2px;opacity:${opacity}`;
    chip.disabled = locked;
    chip.textContent = (agent.emoji ? agent.emoji + ' ' : '') + agent.name;
    chip.onclick = () => {
      if (locked) return;
      _toggleTeamMeetingAgent(aid);
    };
    container.appendChild(chip);
  });
  // Counter "X/3 sélectionnés" (visible seulement avant 1er tour, le compteur de tours
  // est dans le header une fois le thread actif)
  const counter = document.getElementById('teamMeetingCounter');
  if (counter) {
    const count = _teamMeetingSelectedAgents.length;
    const tpl = (T?.[currentLang]?.teamMeetingCounter) || '{n}/{max} agents sélectionnés';
    counter.textContent = tpl.replace('{n}', count).replace('{max}', 3);
  }
}

function _toggleTeamMeetingAgent(agentId) {
  if (_teamMeetingActive) return;
  const idx = _teamMeetingSelectedAgents.indexOf(agentId);
  if (idx >= 0) {
    if (_teamMeetingSelectedAgents.length <= 2) return;
    _teamMeetingSelectedAgents.splice(idx, 1);
  } else {
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
    _flashErrorInline((T?.[currentLang]?.teamMeetingErrShort) || 'Question trop courte (min 10 caractères)');
    return;
  }
  if (_teamMeetingSelectedAgents.length < 2) {
    _flashErrorInline((T?.[currentLang]?.teamMeetingErrAgents) || 'Sélectionne au moins 2 agents');
    return;
  }
  if (_teamMeetingHistory.length >= _TEAM_MEETING_MAX_TURNS) {
    _flashErrorInline((T?.[currentLang]?.teamMeetingMaxTurnsReached) ||
      'Tu as atteint la limite de tours pour cette réunion. Démarre-en une nouvelle.');
    return;
  }

  // Loading state
  submitBtn.disabled = true;
  submitBtn.textContent = (T?.[currentLang]?.teamMeetingLoading) || 'Réunion en cours…';
  ta.disabled = true;

  // Affichage : on garde le thread existant + on ajoute un loader dynamique en bas
  // (loader inline dans la zone results pour préserver le scroll context)
  const isFollowup = _teamMeetingActive && _teamMeetingHistory.length > 0;
  const loaderHtml = '<div id="tm-loader" style="text-align:center;padding:20px;color:var(--muted);font-size:13px">' +
    '<div style="display:inline-block;width:28px;height:28px;border:3px solid #1e2d47;border-top-color:#f59e0b;border-radius:50%;animation:tm-spin 0.8s linear infinite;margin-bottom:6px"></div>' +
    '<div>' + escapeHtml((T?.[currentLang]?.teamMeetingThinking) || 'Tes agents réfléchissent ensemble…') + '</div>' +
    '</div><style>@keyframes tm-spin{to{transform:rotate(360deg)}}</style>';

  // Optimistic UI : on ajoute la question pending dans le thread visuellement
  const optimisticHtml = '<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;margin-top:20px">' +
    '<div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">' +
    (_teamMeetingHistory.length + 1) + '</div>' +
    '<div style="flex:1"><div style="font-size:11px;color:var(--muted);margin-bottom:2px">' +
    escapeHtml((T?.[currentLang]?.teamMeetingQuestionLabel) || 'Question') + '</div>' +
    '<div style="font-size:13px;color:var(--text);font-weight:600;line-height:1.4">' +
    escapeHtml(question) + '</div></div></div>';

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
  } catch (e) {
    console.warn('[TEAM_MEETING] getSession error:', e);
  }
  if (!accessToken) {
    _renderError(resultsEl, 'Session expirée. Reconnecte-toi.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  // Contexte enrichi (best effort, seulement au 1er tour)
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
        history: _teamMeetingHistory,
        lang: currentLang || 'fr',
        profile, calendar, dailyLog
      })
    });
  } catch (netErr) {
    console.error('[TEAM_MEETING] network error:', netErr);
    _renderError(resultsEl, (T?.[currentLang]?.teamMeetingErrNetwork) || 'Erreur réseau. Réessaie.');
    _restoreSubmitButton(submitBtn, ta);
    return;
  }

  let data;
  try {
    data = await resp.json();
  } catch (_) {
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

  // Succès — append au thread et re-render
  const responses = data.responses || [];
  _teamMeetingHistory.push({ question, responses });
  _teamMeetingActive = true;

  // Re-render thread complet (l'optimistic UI est remplacé par le rendu canonique)
  resultsEl.innerHTML = _renderThreadHtml(_teamMeetingHistory);
  _scrollThreadToBottom();

  _updateComposerForActiveThread();
  _renderTeamMeetingAgentChips();
}

function _restoreSubmitButton(btn, ta) {
  if (!btn) return;
  btn.disabled = false;
  btn.textContent = _teamMeetingActive
    ? ((T?.[currentLang]?.teamMeetingFollowupSubmit) || 'Envoyer')
    : ((T?.[currentLang]?.teamMeetingSubmit) || 'Lancer la réunion');
  if (ta) ta.disabled = false;
}

// Erreur inline NON-destructive : affiche un toast au-dessus du thread,
// se cache au prochain submit. Pour les erreurs validation côté frontend.
function _flashErrorInline(msg) {
  const resultsEl = document.getElementById('teamMeetingResults');
  if (!resultsEl) return;
  // On préserve le thread existant et on prepend un message d'erreur
  const existing = (_teamMeetingHistory.length > 0)
    ? _renderThreadHtml(_teamMeetingHistory)
    : ((T?.[currentLang]?.teamMeetingEmptyTitle) ? '' : '');
  const errBlock = '<div style="color:#ef4444;padding:10px 12px;font-size:12px;border:1px solid #ef4444;border-radius:8px;background:rgba(239,68,68,0.08);margin-bottom:12px">⚠️ ' +
    escapeHtml(msg) + '</div>';

  if (_teamMeetingHistory.length > 0) {
    resultsEl.innerHTML = errBlock + existing;
  } else {
    // Pas de thread → on remplace le placeholder par l'erreur
    resultsEl.innerHTML = errBlock;
    // Et on remet le placeholder dessous
    resultsEl.innerHTML += `
      <div style="text-align:center;padding:24px 16px;color:var(--muted);font-size:12px;line-height:1.6">
        <div style="font-size:32px;margin-bottom:12px">💬</div>
        <div style="font-size:13px;color:var(--text);font-weight:600;margin-bottom:6px">${escapeHtml((T?.[currentLang]?.teamMeetingEmptyTitle) || 'Démarre la réunion')}</div>
        <div>${escapeHtml((T?.[currentLang]?.teamMeetingEmptyHint) || 'Sélectionne 2-3 agents et pose ta question.')}</div>
      </div>
    `;
  }
  _scrollThreadToBottom();
}

// Erreur destructive : affichée à la place du thread (pour les erreurs serveur graves
// ou paywall). L'user peut récupérer son thread en ne fermant pas la modal et en
// re-soumettant — _teamMeetingHistory est préservé en mémoire.
function _renderError(resultsEl, msg) {
  resultsEl.innerHTML = '<div style="color:#ef4444;padding:16px;font-size:13px;border:1px solid #ef4444;border-radius:10px;background:rgba(239,68,68,0.06);text-align:center">⚠️ ' +
    escapeHtml(msg) + '</div>';
  _scrollThreadToBottom();
}

function _renderThreadHtml(history) {
  let html = '';
  history.forEach((turn, idx) => {
    // Question header
    html += `<div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:8px;margin-top:${idx === 0 ? '0' : '20px'}">`;
    html += `<div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center">${idx + 1}</div>`;
    html += `<div style="flex:1"><div style="font-size:11px;color:var(--muted);margin-bottom:2px">${escapeHtml((T?.[currentLang]?.teamMeetingQuestionLabel) || 'Question')}</div>`;
    html += `<div style="font-size:13px;color:var(--text);font-weight:600;line-height:1.4">${escapeHtml(turn.question)}</div></div></div>`;

    // Réponses agents pour ce tour
    (turn.responses || []).forEach(r => {
      if (r.error) {
        html += `<div style="border:1px solid #1e2d47;border-radius:10px;padding:10px;margin-bottom:8px;background:rgba(239,68,68,0.04);margin-left:36px">
          <div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:2px">${escapeHtml(r.agent_name || r.agentId)}</div>
          <div style="font-size:11px;color:#ef4444">${escapeHtml((T?.[currentLang]?.teamMeetingErrAgent) || 'Cet agent n\'a pas pu répondre cette fois.')}</div>
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
  return html;
}

function _renderPaywall(resultsEl) {
  resultsEl.innerHTML = `
    <div style="text-align:center;padding:32px 16px;border:1px solid #f59e0b;border-radius:12px;background:linear-gradient(135deg,rgba(245,158,11,0.08),rgba(217,119,6,0.04));margin:auto">
      <div style="font-size:32px;margin-bottom:8px">🔒</div>
      <div style="font-size:14px;font-weight:700;color:var(--text);margin-bottom:8px">${escapeHtml((T?.[currentLang]?.teamMeetingLockedTitle) || 'Réunion d\'équipe — Plus & Pro')}</div>
      <div style="font-size:12px;color:var(--muted);line-height:1.5;margin-bottom:16px">${escapeHtml((T?.[currentLang]?.teamMeetingLockedBody) || 'Demande à 2-3 agents experts de répondre ensemble à ta question. Disponible avec le plan Plus (2/mois) et Pro (illimité).')}</div>
      <button onclick="showPage('abonnement');closeTeamMeeting();" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${escapeHtml((T?.[currentLang]?.teamMeetingUpgrade) || 'Voir les plans')}</button>
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
            ? `<button onclick="showPage('abonnement');closeTeamMeeting();" style="padding:10px 20px;border-radius:8px;border:none;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-weight:700;font-size:13px;cursor:pointer;font-family:Inter,sans-serif">${escapeHtml((T?.[currentLang]?.teamMeetingUpgradePro) || 'Passer en Pro')}</button>`
            : '')
      }
    </div>
  `;
}
