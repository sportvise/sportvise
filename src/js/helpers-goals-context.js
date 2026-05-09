// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — GOALS CONTEXT FOR AGENTS
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5 (PAS chargé via <script src>).
// Refactor v62.37 (Phase 2) — extrait de dashboard.html.
//
// Construit le bloc texte "Objectifs actifs" injecté dans les prompts agents.
// Lit la table goals via Supabase (sb), filtre status='active', limite à 5.
// Dépend des globals : sb, currentUser. Appelée à runtime, donc OK.
// ═══════════════════════════════════════════════════════════════════

async function getGoalsContext() {
  try {
    const { data: goals } = await sb.from('goals')
      .select('*')
      .eq('user_id', currentUser.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (!goals || goals.length === 0) return '';

    const domainEmojis = { financier:'💰', physique:'💪', mental:'🧠', carriere:'🚀' };
    let ctx = 'Objectifs actifs:\n';
    goals.slice(0, 5).forEach(g => {
      const emoji = domainEmojis[g.domain] || '';
      const progress = g.target_value ? Math.round((g.current_value / g.target_value) * 100) : 0;
      const deadline = g.deadline ? new Date(g.deadline).toLocaleDateString('fr-FR') : 'N/A';
      ctx += `- ${emoji} ${g.title}: ${progress}% atteint (deadline: ${deadline})\n`;
    });
    return ctx;
  } catch(e) {
    console.warn('Goals context error:', e);
    return '';
  }
}
