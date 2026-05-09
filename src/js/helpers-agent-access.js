// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — AGENT ACCESS BY PLAN
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.37 (Phase 2) — extrait de dashboard.html.
//
// Matrice d'accès des 11 agents par plan (Free/Plus/Pro) + verrouillage des
// features payantes. Les fonctions sont appelées au runtime (post-init), donc
// elles peuvent référencer les globals AGENTS et userPlan déclarés plus tard
// dans le main script — function declarations hoistées au sein du bundle.
// ═══════════════════════════════════════════════════════════════════

const FREE_AGENTS = ['equipe', 'mental', 'nutrition']; // Lucas, Emma, Clara
const PLUS_AGENTS = ['equipe', 'mental', 'nutrition', 'physique', 'sommeil', 'recuperation']; // + David, Nora, Julie
// Pro = all agents

function isAgentLocked(agentPage) {
  if (!AGENTS[agentPage]) return false; // not an agent page
  if (userPlan === 'pro') return false; // Pro = full access
  if (userPlan === 'plus') return !PLUS_AGENTS.includes(agentPage);
  return !FREE_AGENTS.includes(agentPage); // free
}

function getRequiredPlan(agentPage) {
  if (FREE_AGENTS.includes(agentPage)) return 'free';
  if (PLUS_AGENTS.includes(agentPage)) return 'plus';
  return 'pro';
}

// Features locked behind Plus plan (Free users can't access)
const PLUS_FEATURES = ['defis', 'prepa-match'];

function isFeatureLocked(page) {
  if (userPlan === 'pro' || userPlan === 'plus') return false;
  return PLUS_FEATURES.includes(page);
}

function updateSidebarLocks() {
  document.querySelectorAll('.nav-item').forEach(btn => {
    const onclickAttr = btn.getAttribute('onclick') || '';
    const match = onclickAttr.match(/showPage\('([^']+)'/);
    if (!match) return;
    const page = match[1];

    // Remove existing lock badges
    const existingLock = btn.querySelector('.agent-lock');
    if (existingLock) existingLock.remove();
    btn.style.opacity = '1';

    // Check agent locks
    if (AGENTS[page] && isAgentLocked(page)) {
      const reqPlan = getRequiredPlan(page);
      const lockBadge = document.createElement('span');
      lockBadge.className = 'agent-lock';
      lockBadge.textContent = '🔒';
      lockBadge.title = reqPlan === 'plus' ? 'Plan Plus requis' : 'Plan Pro requis';
      lockBadge.style.cssText = 'margin-left:auto;font-size:10px;opacity:0.5';
      btn.style.position = 'relative';
      btn.appendChild(lockBadge);
      btn.style.opacity = '0.6';
    }

    // Check feature locks
    if (isFeatureLocked(page)) {
      const lockBadge = document.createElement('span');
      lockBadge.className = 'agent-lock';
      lockBadge.textContent = '🔒';
      lockBadge.title = 'Plan Plus requis';
      lockBadge.style.cssText = 'margin-left:auto;font-size:10px;opacity:0.5';
      btn.style.position = 'relative';
      btn.appendChild(lockBadge);
      btn.style.opacity = '0.6';
    }
  });
}
