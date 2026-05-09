// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — TRANSFORMATION VIEW (Killer Feature #3)
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5.
// v63.4.0-draft — PRD : PRD_KF3_VUE_AVANT_APRES_v1.md
//
// Widget permanent du dashboard qui montre 4 KPIs comparés sur 4 fenêtres
// temporelles (3mois / 6mois / 1an / depuis inscription) + narratif David
// (P0-4, ajouté en phase 2).
//
// 4 KPIs comparés baseline vs récent :
//   1. Fitness Score moyen (0-100)            — via computeFitnessScore()
//   2. Régularité d'entraînement              — séances/semaine moyenne (training_done bool)
//   3. Mood / Sommeil / Énergie composite     — moy(mood + energy + sleep)/3 sur 1-5
//   4. Régularité check-in                    — % jours avec daily_log présent
//
// Calcul deltas :
//   - Récent  = moyenne sur les 14 derniers jours de la fenêtre (today - 14 → today)
//   - Baseline = moyenne sur les 14 PREMIERS jours de la fenêtre
//   - Delta   = récent - baseline (signed, formaté avec sign + couleur sémantique)
//
// Empty state : si user a < 21 daily_log entries.
// Caching : les KPIs sont cachés en mémoire par fenêtre (regénérés au switch).
//
// Dépend des globals (déclarés dans dashboard.html ou autres modules) :
//   - sb (Supabase client)
//   - currentUser (auth user, contient created_at pour fenêtre depuis_inscription)
//   - userProfile (peut contenir created_at si dispo via profiles)
//   - T (i18n catalog) + currentLang
//   - computeFitnessScore (helpers-fitness-score.js)
//   - dateToStr (helpers-date.js)
// ═══════════════════════════════════════════════════════════════════

// ── Constantes & state ─────────────────────────────────────────────
const TV_WINDOWS = ['3mois', '6mois', '1an', 'depuis_inscription'];
const TV_BASELINE_DAYS = 14;   // fenêtre baseline (premiers 14j)
const TV_RECENT_DAYS = 14;     // fenêtre récente (derniers 14j)
const TV_MIN_LOGS_REQUIRED = 21; // seuil empty state

let _tvSelectedWindow = '3mois';
let _tvCachedKPIsByWindow = {};   // { '3mois': { recent, baseline, deltas, nbLogs }, ... }
let _tvLogsTotal = null;          // count global pour empty state check
let _tvLoading = false;
let _tvNarrativeGen = 0;          // generation counter pour ignorer les fetch stale au toggle

// ── Helpers ────────────────────────────────────────────────────────

function _tvText(key, fallback) {
  return (T && T[currentLang] && T[currentLang][key]) || fallback;
}

function _tvGetWindowDays(window) {
  switch(window) {
    case '3mois': return 90;
    case '6mois': return 180;
    case '1an': return 365;
    case 'depuis_inscription': {
      // Use auth user's created_at as definitive baseline. Fallback userProfile, fallback 90j.
      const createdAt = (currentUser && currentUser.created_at)
                     || (userProfile && userProfile.created_at);
      if (!createdAt) return 90;
      const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
      return Math.max(TV_MIN_LOGS_REQUIRED, days);
    }
  }
  return 90;
}

function _tvIsWindowAvailable(window) {
  // A window is "available" if user has enough days of history. For 'depuis_inscription'
  // it's always available (we cap at user's actual signup date).
  if (window === 'depuis_inscription') return true;
  const required = _tvGetWindowDays(window);
  const createdAt = (currentUser && currentUser.created_at)
                 || (userProfile && userProfile.created_at);
  if (!createdAt) return true; // pas de date → on assume tout dispo (fallback safe)
  const userDays = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  return userDays >= required;
}

async function _tvFetchLogs(windowDays) {
  const startDate = new Date(Date.now() - windowDays * 86400000);
  const startStr = (typeof dateToStr === 'function')
    ? dateToStr(startDate)
    : startDate.toISOString().slice(0, 10);
  try {
    const { data, error } = await sb.from('daily_log')
      .select('mood,energy,sleep_quality,motivation,pain_level,nutrition_quality,training_done,log_date')
      .eq('user_id', currentUser.id)
      .gte('log_date', startStr)
      .order('log_date', { ascending: true });
    if (error) {
      console.warn('[TV] fetchLogs error:', error);
      return [];
    }
    return data || [];
  } catch(e) {
    console.warn('[TV] fetchLogs exception:', e);
    return [];
  }
}

async function _tvFetchTotalLogsCount() {
  // Lightweight count for empty state gating.
  if (_tvLogsTotal !== null) return _tvLogsTotal;
  try {
    const { count, error } = await sb.from('daily_log')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', currentUser.id);
    if (error) {
      console.warn('[TV] count logs error:', error);
      return 0;
    }
    _tvLogsTotal = count || 0;
    return _tvLogsTotal;
  } catch(e) {
    console.warn('[TV] count logs exception:', e);
    return 0;
  }
}

function _tvAvg(arr) {
  const valid = arr.filter(v => v !== null && v !== undefined && !isNaN(v));
  if (valid.length === 0) return null;
  return valid.reduce((a,b) => a + b, 0) / valid.length;
}

function _tvComputeKPIsForLogs(logs, windowDays) {
  // Returns { fitness, training_per_week, mse, checkin_rate, nbLogs }
  if (!logs || logs.length === 0) {
    return { fitness: null, training_per_week: null, mse: null, checkin_rate: 0, nbLogs: 0 };
  }
  // Fitness Score : moyenne des computeFitnessScore par log (skip nulls)
  const fitnessScores = logs
    .map(l => (typeof computeFitnessScore === 'function') ? computeFitnessScore(l) : null)
    .filter(v => v !== null && !isNaN(v));
  const fitness = _tvAvg(fitnessScores);

  // Training : nombre de séances totales / nombre de semaines de la fenêtre
  const trainingDaysCount = logs.filter(l => l.training_done === true).length;
  const nbSemainesFenetre = windowDays / 7;
  const training_per_week = trainingDaysCount / nbSemainesFenetre;

  // MSE composite (Mood + Sleep + Energy) sur 1-5
  const mseValues = logs.map(l => {
    const parts = [l.mood, l.sleep_quality, l.energy].filter(v => v !== null && v !== undefined);
    if (parts.length === 0) return null;
    return parts.reduce((a,b) => a + b, 0) / parts.length;
  }).filter(v => v !== null);
  const mse = _tvAvg(mseValues);

  // Régularité check-in : % jours avec log présent / nombre de jours total fenêtre
  const checkin_rate = logs.length / windowDays;

  return {
    fitness: fitness !== null ? Math.round(fitness) : null,
    training_per_week: training_per_week !== null ? Number(training_per_week.toFixed(1)) : null,
    mse: mse !== null ? Number(mse.toFixed(1)) : null,
    checkin_rate: Number((checkin_rate * 100).toFixed(0)),
    nbLogs: logs.length
  };
}

function _tvSplitLogsBaselineRecent(logs, windowDays) {
  // Splits logs into:
  //   - baseline = the first TV_BASELINE_DAYS of the window
  //   - recent   = the last TV_RECENT_DAYS of the window
  // If overlap (window <= baseline+recent days), uses early-half / late-half split.
  const totalDays = windowDays;
  const today = new Date();
  let baselineCutoff, recentCutoff;
  if (totalDays > TV_BASELINE_DAYS + TV_RECENT_DAYS + 7) {
    // Plenty of room: use absolute dates
    baselineCutoff = new Date(today.getTime() - (totalDays - TV_BASELINE_DAYS) * 86400000);
    recentCutoff = new Date(today.getTime() - TV_RECENT_DAYS * 86400000);
  } else {
    // Tight window: split in half
    const halfDays = Math.floor(totalDays / 2);
    baselineCutoff = new Date(today.getTime() - (totalDays - halfDays) * 86400000);
    recentCutoff = new Date(today.getTime() - halfDays * 86400000);
  }
  const dateFn = (typeof dateToStr === 'function') ? dateToStr : (d) => d.toISOString().slice(0, 10);
  const baselineStr = dateFn(baselineCutoff);
  const recentStr = dateFn(recentCutoff);
  const baseline = logs.filter(l => l.log_date <= baselineStr);
  const recent = logs.filter(l => l.log_date >= recentStr);
  return { baseline, recent };
}

function _tvComputeDelta(recent, baseline) {
  // Returns delta KPIs object (signed numbers).
  return {
    fitness: (recent.fitness !== null && baseline.fitness !== null)
      ? recent.fitness - baseline.fitness : null,
    training_per_week: (recent.training_per_week !== null && baseline.training_per_week !== null)
      ? Number((recent.training_per_week - baseline.training_per_week).toFixed(1)) : null,
    mse: (recent.mse !== null && baseline.mse !== null)
      ? Number((recent.mse - baseline.mse).toFixed(1)) : null,
    checkin_rate: (recent.checkin_rate !== null && baseline.checkin_rate !== null)
      ? recent.checkin_rate - baseline.checkin_rate : null
  };
}

async function _tvComputeKPIsForWindow(window) {
  // Lazy-cached. Returns { recent, baseline, deltas, nbLogs }.
  if (_tvCachedKPIsByWindow[window]) return _tvCachedKPIsByWindow[window];
  const windowDays = _tvGetWindowDays(window);
  const logs = await _tvFetchLogs(windowDays);
  const { baseline: baselineLogs, recent: recentLogs } = _tvSplitLogsBaselineRecent(logs, windowDays);
  const recent = _tvComputeKPIsForLogs(recentLogs, TV_RECENT_DAYS);
  const baseline = _tvComputeKPIsForLogs(baselineLogs, TV_BASELINE_DAYS);
  const deltas = _tvComputeDelta(recent, baseline);
  const result = { recent, baseline, deltas, nbLogs: logs.length, windowDays };
  _tvCachedKPIsByWindow[window] = result;
  return result;
}

// ── Format helpers (for display) ───────────────────────────────────

function _tvFormatDelta(delta, kpiKey) {
  if (delta === null || delta === undefined) return '';
  const sign = delta > 0 ? '+' : '';
  let display;
  if (kpiKey === 'fitness') display = `${sign}${Math.round(delta)} pts`;
  else if (kpiKey === 'training_per_week') display = `${sign}${delta} séances/sem`;
  else if (kpiKey === 'mse') display = `${sign}${delta}`;
  else if (kpiKey === 'checkin_rate') display = `${sign}${Math.round(delta)} pts`;
  else display = `${sign}${delta}`;
  return display;
}

function _tvDeltaColor(delta, kpiKey) {
  // Sémantique : positif = vert, négatif = rouge, stable (< 5%) = gris
  if (delta === null || delta === undefined) return 'var(--muted2)';
  const absDelta = Math.abs(delta);
  // Seuils variables selon KPI
  let stableThreshold = 0.5;
  if (kpiKey === 'fitness' || kpiKey === 'checkin_rate') stableThreshold = 5;
  if (absDelta < stableThreshold) return 'var(--muted2)';
  return delta > 0 ? 'var(--green)' : 'var(--red)';
}

function _tvFormatValue(value, kpiKey) {
  if (value === null || value === undefined) return '—';
  if (kpiKey === 'fitness') return value.toString();
  if (kpiKey === 'training_per_week') return `${value}`;
  if (kpiKey === 'mse') return `${value}/5`;
  if (kpiKey === 'checkin_rate') return `${value}%`;
  return value.toString();
}

// ── Render functions ───────────────────────────────────────────────

function _tvRenderEmptyState(currentLogsCount) {
  const remaining = Math.max(0, TV_MIN_LOGS_REQUIRED - currentLogsCount);
  const title = _tvText('tvEmptyTitle', 'Ton chemin se construit');
  const sub = remaining > 0
    ? _tvText('tvEmptySub', `Continue ton check-in. Dans <strong>${remaining} jour${remaining > 1 ? 's' : ''}</strong> je te montre comment t'as évolué.`)
        .replace('{n}', remaining)
    : _tvText('tvEmptyReady', 'Ton historique est prêt — recharge la page.');
  return `
    <div style="text-align:center;padding:24px 16px">
      <div style="font-size:32px;line-height:1;margin-bottom:8px">📈</div>
      <div style="font-size:15px;font-weight:600;color:var(--text);margin-bottom:6px">${title}</div>
      <div style="font-size:13px;color:var(--muted2);line-height:1.5">${sub}</div>
    </div>
  `;
}

function _tvRenderLoadingSkeleton() {
  return `
    <div style="padding:16px">
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px">
        ${[1,2,3,4].map(() => `
          <div style="background:var(--border);opacity:0.4;border-radius:10px;height:64px;animation:tv-pulse 1.4s ease-in-out infinite"></div>
        `).join('')}
      </div>
    </div>
  `;
}

function _tvRenderTabs(selectedWindow) {
  const labels = {
    '3mois': _tvText('tvWin3mois', '3 mois'),
    '6mois': _tvText('tvWin6mois', '6 mois'),
    '1an': _tvText('tvWin1an', '1 an'),
    'depuis_inscription': _tvText('tvWinSince', 'Depuis le début')
  };
  return TV_WINDOWS.map(w => {
    const isSelected = w === selectedWindow;
    const isAvailable = _tvIsWindowAvailable(w);
    const cursor = isAvailable ? 'pointer' : 'not-allowed';
    const opacity = isAvailable ? '1' : '0.4';
    const onclick = isAvailable ? `_tvSelectWindow('${w}')` : '';
    const bg = isSelected ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'transparent';
    const color = isSelected ? '#07091a' : 'var(--text)';
    const border = isSelected ? '#f59e0b' : 'var(--border)';
    return `<button type="button" onclick="${onclick}" style="padding:6px 12px;border-radius:14px;border:1px solid ${border};background:${bg};color:${color};font-size:12px;font-weight:600;cursor:${cursor};opacity:${opacity};font-family:Inter,sans-serif;transition:all 0.15s">${labels[w]}</button>`;
  }).join('');
}

function _tvRenderKPICard(label, value, delta, kpiKey) {
  const valueDisplay = _tvFormatValue(value, kpiKey);
  const deltaDisplay = _tvFormatDelta(delta, kpiKey);
  const deltaColor = _tvDeltaColor(delta, kpiKey);
  return `
    <div style="background:var(--bg3);border:1px solid var(--border);border-radius:12px;padding:14px 12px;text-align:center">
      <div style="font-size:11px;color:var(--muted2);font-weight:500;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.4px">${label}</div>
      <div style="font-size:26px;font-weight:700;color:var(--text);line-height:1.1;margin-bottom:4px">${valueDisplay}</div>
      ${deltaDisplay ? `<div style="font-size:12px;font-weight:600;color:${deltaColor}">${deltaDisplay}</div>` : ''}
    </div>
  `;
}

function _tvRenderKPIs(kpis) {
  const labels = {
    fitness: _tvText('tvKpiFitness', 'Forme'),
    training: _tvText('tvKpiTraining', 'Entraînement'),
    mse: _tvText('tvKpiMSE', 'Humeur · Sommeil · Énergie'),
    checkin: _tvText('tvKpiCheckin', 'Régularité')
  };
  return `
    <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px">
      ${_tvRenderKPICard(labels.fitness, kpis.recent.fitness, kpis.deltas.fitness, 'fitness')}
      ${_tvRenderKPICard(labels.training, kpis.recent.training_per_week, kpis.deltas.training_per_week, 'training_per_week')}
      ${_tvRenderKPICard(labels.mse, kpis.recent.mse, kpis.deltas.mse, 'mse')}
      ${_tvRenderKPICard(labels.checkin, kpis.recent.checkin_rate, kpis.deltas.checkin_rate, 'checkin_rate')}
    </div>
  `;
}

// ── Narrative David (Phase 2) ──────────────────────────────────────

const TV_NARRATIVE_CACHE_KEY_PREFIX = 'tv_narrative_';
const TV_NARRATIVE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

function _tvNarrativeCacheKey(window, kpis) {
  // Hash simple sur les 4 KPIs pour invalider le cache si les chiffres bougent significativement.
  // Round à l'entier (fitness, checkin) ou x10 (training, mse) pour stabilité.
  const r = kpis.recent;
  const d = kpis.deltas;
  const sig = [
    r.fitness, r.checkin_rate,
    Math.round((r.training_per_week || 0) * 10),
    Math.round((r.mse || 0) * 10),
    d.fitness, d.checkin_rate,
    Math.round((d.training_per_week || 0) * 10),
    Math.round((d.mse || 0) * 10)
  ].join('|');
  const userId = (currentUser && currentUser.id) ? currentUser.id.slice(0, 8) : 'anon';
  return `${TV_NARRATIVE_CACHE_KEY_PREFIX}${userId}_${window}_${sig}`;
}

function _tvGetCachedNarrative(window, kpis) {
  try {
    const key = _tvNarrativeCacheKey(window, kpis);
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || !obj.text || !obj.ts) return null;
    if (Date.now() - obj.ts > TV_NARRATIVE_TTL_MS) {
      sessionStorage.removeItem(key);
      return null;
    }
    return obj.text;
  } catch(_) { return null; }
}

function _tvSetCachedNarrative(window, kpis, text) {
  try {
    const key = _tvNarrativeCacheKey(window, kpis);
    sessionStorage.setItem(key, JSON.stringify({ text, ts: Date.now() }));
  } catch(_) {}
}

function _tvWindowLabelLong(window) {
  // Format lisible pour la prompt (le LLM voit "3 derniers mois" plutôt que "3mois")
  const map = {
    '3mois': '3 derniers mois',
    '6mois': '6 derniers mois',
    '1an': '12 derniers mois',
    'depuis_inscription': 'depuis ton inscription'
  };
  return map[window] || window;
}

function _tvBuildNarrativePrompt(window, kpis) {
  const r = kpis.recent;
  const d = kpis.deltas;
  const fmt = (val, kpiKey) => _tvFormatValue(val, kpiKey);
  const fmtD = (val, kpiKey) => _tvFormatDelta(val, kpiKey) || '—';
  const periode = _tvWindowLabelLong(window);
  return `Voici l'évolution de mes 4 indicateurs sportifs sur ${periode} (récent vs baseline en début de fenêtre) :

• Forme moyenne : ${fmt(r.fitness, 'fitness')}/100 (${fmtD(d.fitness, 'fitness')})
• Régularité d'entraînement : ${fmt(r.training_per_week, 'training_per_week')} séances/semaine (${fmtD(d.training_per_week, 'training_per_week')})
• Humeur · Sommeil · Énergie : ${fmt(r.mse, 'mse')} (${fmtD(d.mse, 'mse')})
• Régularité check-in : ${fmt(r.checkin_rate, 'checkin_rate')} (${fmtD(d.checkin_rate, 'checkin_rate')})

Résume cette évolution en 1-2 phrases (max 45 mots), avec ton ton d'entraîneur expert. Honnête, encourageant sans flatterie. Si progression globalement positive, célèbre intelligemment. Si régression, mentionne avec tact. Pas d'emoji, pas de listes, juste un paragraphe direct adressé à moi (tutoiement).`;
}

function _tvFallbackNarrative(window, kpis) {
  // Phrase statique générée selon le delta dominant. Honnête mais sans coach personnalisé.
  const d = kpis.deltas;
  const periode = _tvWindowLabelLong(window);
  const positive = (d.fitness !== null && d.fitness > 5)
                || (d.training_per_week !== null && d.training_per_week > 0.5)
                || (d.checkin_rate !== null && d.checkin_rate > 10);
  if (positive) {
    return `Belle progression sur ${periode}. Garde ce rythme.`;
  }
  const negative = (d.fitness !== null && d.fitness < -5)
                || (d.checkin_rate !== null && d.checkin_rate < -10);
  if (negative) {
    return `Ton activité a ralenti ces derniers temps sur ${periode}. Pas grave, on repart progressivement.`;
  }
  return `Ton évolution est stable sur ${periode}. Continue ton rythme actuel.`;
}

async function _tvFetchNarrativeFromApi(window, kpis) {
  // Appel /.netlify/functions/chat avec David (agentId='physique').
  // Conserve le compteur de messages user → cacher agressivement (24h TTL via sessionStorage).
  // TODO post-launch : extraire dans un endpoint dédié /transformation-narrative qui ne compte
  // pas vers la rate limit chat user. Pour l'instant on partage le quota.
  const message = _tvBuildNarrativePrompt(window, kpis);
  const fetchHeaders = { 'Content-Type': 'application/json' };
  try {
    const { data: { session } } = await sb.auth.getSession();
    if (session && session.access_token) {
      fetchHeaders['Authorization'] = `Bearer ${session.access_token}`;
    }
  } catch(_) {}
  const requestBody = {
    agentId: 'physique',
    message,
    history: [],
    lang: (typeof currentLang !== 'undefined') ? currentLang : 'fr',
    profile: (typeof userProfile !== 'undefined') ? userProfile : null
  };
  const res = await fetch('/.netlify/functions/chat', {
    method: 'POST',
    headers: fetchHeaders,
    body: JSON.stringify(requestBody)
  });
  if (!res.ok) {
    if (res.status === 429) throw new Error('rate_limit');
    throw new Error('api_error_' + res.status);
  }
  const data = await res.json();
  const reply = (data && data.reply) || '';
  // Sanity check : le reply doit être texte non vide et raisonnable (< 500 chars)
  if (!reply || typeof reply !== 'string' || reply.length > 500) {
    throw new Error('reply_invalid');
  }
  return reply.trim();
}

async function _tvGetNarrative(window, kpis) {
  // Cache → API → fallback statique
  const cached = _tvGetCachedNarrative(window, kpis);
  if (cached) return { text: cached, source: 'cache' };
  try {
    const text = await _tvFetchNarrativeFromApi(window, kpis);
    _tvSetCachedNarrative(window, kpis, text);
    return { text, source: 'api' };
  } catch(e) {
    console.warn('[TV] narrative API error, using fallback:', e.message);
    const fallback = _tvFallbackNarrative(window, kpis);
    return { text: fallback, source: 'fallback' };
  }
}

function _tvRenderNarrativeCard(text, source) {
  // source = 'api' | 'cache' | 'fallback' (utilisé pour debug, invisible UX)
  const safeText = String(text)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `
    <div style="margin-top:14px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;display:flex;gap:10px;align-items:flex-start" data-tv-narrative-source="${source}">
      <div style="font-size:24px;line-height:1;flex-shrink:0">🏋️</div>
      <div style="font-size:13px;color:var(--text);line-height:1.55">${safeText}</div>
    </div>
  `;
}

function _tvRenderNarrativeLoading() {
  const label = _tvText('tvNarrativeLoading', 'David analyse ta progression…');
  return `
    <div style="margin-top:14px;padding:12px 14px;background:var(--bg3);border:1px solid var(--border);border-radius:12px;display:flex;gap:10px;align-items:flex-start">
      <div style="font-size:24px;line-height:1;flex-shrink:0;animation:tv-pulse 1.4s ease-in-out infinite">🏋️</div>
      <div style="font-size:13px;color:var(--muted2);line-height:1.55;font-style:italic">${label}</div>
    </div>
  `;
}

async function _tvLoadNarrativeIntoDom(window, kpis) {
  // Async load + insert dans #tvNarrative. Génération-check pour ignorer les fetch
  // stale si user toggle vers une autre fenêtre pendant le fetch.
  const myGen = ++_tvNarrativeGen;
  const { text, source } = await _tvGetNarrative(window, kpis);
  if (myGen !== _tvNarrativeGen) return; // stale, l'user a switch entre-temps
  const el = document.getElementById('tvNarrative');
  if (el) el.innerHTML = _tvRenderNarrativeCard(text, source);
}

async function renderTransformationView() {
  const container = document.getElementById('transformationView');
  if (!container) return;

  // 1. Vérifier si user a assez d'historique pour afficher la vraie vue
  if (!currentUser || !currentUser.id) {
    container.innerHTML = '';
    return;
  }
  const totalLogs = await _tvFetchTotalLogsCount();
  if (totalLogs < TV_MIN_LOGS_REQUIRED) {
    container.innerHTML = `
      <div style="background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:0;overflow:hidden">
        <div style="padding:14px 16px 0">
          <div style="font-size:14px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px">
            <span style="font-size:18px">📈</span> ${_tvText('tvTitle', 'Ta transformation')}
          </div>
        </div>
        ${_tvRenderEmptyState(totalLogs)}
      </div>
    `;
    return;
  }

  // 2. State plein : tabs + KPIs + narratif
  // Loading skeleton initial pendant que les KPIs chargent
  container.innerHTML = `
    <div id="tvWidget" style="background:var(--bg2);border:1px solid var(--border);border-radius:16px;padding:16px">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">
        <div style="font-size:14px;font-weight:600;color:var(--text);display:flex;align-items:center;gap:8px">
          <span style="font-size:18px">📈</span> ${_tvText('tvTitle', 'Ta transformation')}
        </div>
        <div id="tvTabs" style="display:flex;gap:6px;flex-wrap:wrap">${_tvRenderTabs(_tvSelectedWindow)}</div>
      </div>
      <div id="tvBody">${_tvRenderLoadingSkeleton()}</div>
    </div>
    <style>@keyframes tv-pulse { 0%,100% { opacity: 0.4 } 50% { opacity: 0.7 } }</style>
  `;

  // Compute KPIs
  try {
    const kpis = await _tvComputeKPIsForWindow(_tvSelectedWindow);
    const body = document.getElementById('tvBody');
    if (!body) return;
    if (kpis.nbLogs === 0) {
      body.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted2);font-size:13px">${_tvText('tvNoDataWindow', 'Pas encore de données sur cette fenêtre.')}</div>`;
      return;
    }
    body.innerHTML = `
      ${_tvRenderKPIs(kpis)}
      <div id="tvNarrative">${_tvRenderNarrativeLoading()}</div>
    `;
    // Fire-and-forget : narratif David async, remplace le loading skeleton à l'arrivée
    _tvLoadNarrativeIntoDom(_tvSelectedWindow, kpis);
  } catch(e) {
    console.warn('[TV] render error:', e);
    const body = document.getElementById('tvBody');
    if (body) body.innerHTML = `<div style="padding:16px;text-align:center;color:var(--red);font-size:13px">${_tvText('tvError', 'Impossible de charger ta vue transformation pour l\'instant.')}</div>`;
  }
}

// ── User interaction ───────────────────────────────────────────────

async function _tvSelectWindow(window) {
  if (!TV_WINDOWS.includes(window)) return;
  if (window === _tvSelectedWindow) return;
  if (!_tvIsWindowAvailable(window)) return;
  _tvSelectedWindow = window;

  // Update tabs visual
  const tabs = document.getElementById('tvTabs');
  if (tabs) tabs.innerHTML = _tvRenderTabs(_tvSelectedWindow);

  // Show loading skeleton in body
  const body = document.getElementById('tvBody');
  if (body) body.innerHTML = _tvRenderLoadingSkeleton();

  // Compute and render
  try {
    const kpis = await _tvComputeKPIsForWindow(_tvSelectedWindow);
    if (!body) return;
    if (kpis.nbLogs === 0) {
      body.innerHTML = `<div style="padding:16px;text-align:center;color:var(--muted2);font-size:13px">${_tvText('tvNoDataWindow', 'Pas encore de données sur cette fenêtre.')}</div>`;
      return;
    }
    body.innerHTML = `
      ${_tvRenderKPIs(kpis)}
      <div id="tvNarrative">${_tvRenderNarrativeLoading()}</div>
    `;
    // Fire-and-forget : narratif David async, remplace le loading skeleton à l'arrivée
    _tvLoadNarrativeIntoDom(_tvSelectedWindow, kpis);

    // Telemetry (pattern api_usage_log existant)
    try {
      sb.from('api_usage_log').insert({
        user_id: currentUser.id,
        endpoint: 'transformation_view',
        agent_id: window,
        success: true,
        latency_ms: 0
      });
    } catch(_) {}
  } catch(e) {
    console.warn('[TV] selectWindow error:', e);
  }
}

// Expose to global scope so onclick handlers in HTML can find it
window._tvSelectWindow = _tvSelectWindow;
window.renderTransformationView = renderTransformationView;
