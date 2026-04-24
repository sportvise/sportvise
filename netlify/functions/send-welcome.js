// SPORTVISE — Netlify Function : Email de bienvenue
// Envoyé automatiquement à chaque nouvel athlète inscrit

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: '' };

  try {
    const { name, email, sport } = JSON.parse(event.body);
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'Resend API key missing' }) };

    const firstName = (name || 'Athlète').split(' ')[0];

    const html = `
<!DOCTYPE html>
<html lang="fr">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1.0"/></head>
<body style="margin:0;padding:0;background:#07091a;font-family:'Segoe UI',Arial,sans-serif">
  <div style="max-width:580px;margin:0 auto;padding:32px 20px">

    <!-- HEADER -->
    <div style="text-align:center;margin-bottom:32px">
      <div style="font-size:28px;font-weight:900;letter-spacing:3px;background:linear-gradient(135deg,#f59e0b,#fbbf24);-webkit-background-clip:text;-webkit-text-fill-color:transparent;display:inline-block">
        SPORTVISE
      </div>
      <div style="color:#64748b;font-size:12px;margin-top:4px">🇨🇭 Management Sportif IA · Suisse</div>
    </div>

    <!-- CARD -->
    <div style="background:#0d1127;border:1px solid #1e2d47;border-radius:16px;padding:36px;margin-bottom:24px">
      <div style="font-size:32px;margin-bottom:16px">🏆</div>
      <h1 style="color:#f1f5f9;font-size:24px;font-weight:800;margin:0 0 8px">
        Bienvenue, ${firstName} !
      </h1>
      <p style="color:#94a3b8;font-size:15px;line-height:1.6;margin:0 0 24px">
        Votre compte SPORTVISE est actif. Vous avez accès à <strong style="color:#10b981">3 agents IA</strong> sur le plan Free. Passez au plan Plus ou Pro pour débloquer jusqu'à <strong style="color:#f59e0b">11 agents spécialisés</strong> et révolutionner votre carrière sportive en Suisse.
      </p>

      ${sport ? `
      <div style="background:#f59e0b15;border:1px solid #f59e0b30;border-radius:10px;padding:14px 18px;margin-bottom:24px">
        <div style="color:#f59e0b;font-size:13px;font-weight:700">⚽ Sport détecté : ${sport}</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:3px">Vos agents sont déjà adaptés à votre sport !</div>
      </div>
      ` : ''}

      <!-- AGENTS PREVIEW -->
      <div style="margin-bottom:24px">
        <div style="color:#64748b;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">Vos 11 agents disponibles</div>
        <div style="display:grid;gap:8px">
          ${[
            ['💼','Lucas','Manager Sportif','🟢 Free'],
            ['🧠','Emma','Préparation Mentale','🟢 Free'],
            ['🥗','Clara','Nutrition Sportive','🟢 Free'],
            ['🏋️','David','Préparation Physique','💎 Plus'],
            ['😴','Nora','Spécialiste du Sommeil','💎 Plus'],
            ['♻️','Julie','Récupération & Régénération','💎 Plus'],
            ['🎯','Alex','Marketing & Personal Branding','⚡ Pro'],
            ['🤝','Marc','Gestion des Sponsors','⚡ Pro'],
            ['💶','Sophie','Conseil Financier Suisse','⚡ Pro'],
            ['⚖️','Léa','Négociation de Contrats','⚡ Pro'],
            ['📊','Pierre','Comptabilité & Facturation','⚡ Pro'],
          ].map(([emoji, name, role, plan]) => `
            <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;background:#111827;border-radius:8px;border:1px solid #1e2d47">
              <span style="font-size:18px">${emoji}</span>
              <div style="flex:1">
                <div style="color:#f1f5f9;font-size:13px;font-weight:700">${name}</div>
                <div style="color:#64748b;font-size:11px">${role}</div>
              </div>
              <div style="font-size:9px;color:#64748b;white-space:nowrap">${plan}</div>
            </div>
          `).join('')}
        </div>
      </div>

      <!-- CTA -->
      <div style="text-align:center">
        <a href="https://sportvise.ch/app/login.html" style="display:inline-block;padding:14px 36px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#07091a;font-size:15px;font-weight:800;text-decoration:none;border-radius:10px;letter-spacing:0.3px">
          Accéder à mon dashboard →
        </a>
      </div>
    </div>

    <!-- TIPS -->
    <div style="background:#0d1127;border:1px solid #1e2d47;border-radius:16px;padding:24px;margin-bottom:24px">
      <div style="color:#f59e0b;font-size:13px;font-weight:700;margin-bottom:14px">💡 Par où commencer ?</div>
      ${[
        ['1️⃣', 'Complétez votre profil', 'Sport, niveau, club, canton — pour des conseils ultra-personnalisés'],
        ['2️⃣', 'Parlez à Emma', 'Votre coach mental vous aide à gérer le stress et la performance'],
        ['3️⃣', 'Consultez Clara', 'Recevez un plan nutrition adapté à votre sport'],
      ].map(([num, title, desc]) => `
        <div style="display:flex;gap:12px;margin-bottom:12px">
          <span style="font-size:18px;flex-shrink:0">${num}</span>
          <div>
            <div style="color:#f1f5f9;font-size:13px;font-weight:700">${title}</div>
            <div style="color:#64748b;font-size:12px;margin-top:2px">${desc}</div>
          </div>
        </div>
      `).join('')}
    </div>

    <!-- FOOTER -->
    <div style="text-align:center;color:#475569;font-size:11px;line-height:1.7">
      <div>© 2026 SPORTVISE · Suisse 🇨🇭</div>
      <div>Fondé en Suisse Romande · <a href="https://sportvise.ch" style="color:#f59e0b;text-decoration:none">sportvise.ch</a></div>
      <div style="margin-top:6px">Des questions ? <a href="mailto:hello@sportvise.ch" style="color:#f59e0b;text-decoration:none">hello@sportvise.ch</a></div>
    </div>
  </div>
</body>
</html>`;

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        from: 'SPORTVISE <hello@sportvise.ch>',
        to: [email],
        subject: `Bienvenue sur SPORTVISE, ${firstName} ! 🏆`,
        html
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Resend error:', err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Email send failed' }) };
    }

    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };

  } catch (error) {
    console.error('Function error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
