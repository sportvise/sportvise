// SPORTVISE — Netlify Function : Proxy Claude AI
// Agent data externalized to agents-data.js for maintainability
const { SPORTS_SUISSE, CALENDRIERS_SUISSE, AGENTS } = require("./agents-data");

// v45 — Per-model configuration for Haiku (default) / Sonnet (opt-in beta).
// Beta opt-in is driven by env var AI_MODEL_BETA_USERS (comma-separated emails).
// Model IDs are env-overridable so we can swap without redeploying code.
const MODEL_CONFIG = {
  haiku: {
    id: process.env.AI_MODEL_DEFAULT || 'claude-haiku-4-5-20251001',
    maxTokens: 1200,
    temperature: 1.0,
    systemPrefix: ''
  },
  sonnet: {
    id: process.env.AI_MODEL_BETA || 'claude-sonnet-4-6',
    maxTokens: 800,
    temperature: 0.4,
    // Strict style guardrails (regression case David v40 : Sonnet inventait des URLs
    // et tirait long en listes). Préfixe écrit en FR : Claude applique les règles
    // quel que soit le langInstruction qui suit.
    systemPrefix: `[CONSIGNES DE STYLE STRICTES — À RESPECTER POUR CHAQUE RÉPONSE]
- Réponds en 2 à 3 paragraphes courts maximum (pas plus).
- Tutoie systématiquement l'athlète (jamais de "vous").
- Termine par UNE seule question OU UN seul appel à l'action concret — pas les deux.
- Pas de listes à puces ni de listes numérotées, SAUF si la réponse en a vraiment besoin (ex : étapes ordonnées d'un protocole). Privilégie des phrases fluides en prose.
- N'invente JAMAIS d'URL, de lien, de site web, de marque ni de produit que tu n'es pas certain d'avoir vu apparaître dans le contexte fourni. Si tu ne connais pas un lien précis, dis "cherche sur Google" ou "demande à ta fédération".
- Ton conversationnel et concret, pas académique.

`
  }
};

// Decide which model to use based on the caller's email.
// Returns 'haiku' or 'sonnet'. Defaults to 'haiku' when email is missing,
// the env var is unset, or the user is not in the beta list.
function pickModel(userEmail) {
  const betaUsersRaw = process.env.AI_MODEL_BETA_USERS || '';
  if (!userEmail || !betaUsersRaw) return 'haiku';
  const betaSet = new Set(
    betaUsersRaw.split(',').map(e => e.trim().toLowerCase()).filter(Boolean)
  );
  return betaSet.has(String(userEmail).trim().toLowerCase()) ? 'sonnet' : 'haiku';
}

exports.handler = async (event) => {
  // CORS: restrict to SPORTVISE domains only
  const allowedOrigins = ['https://sportvise.ch', 'https://www.sportvise.ch', 'https://prismatic-lebkuchen-48a8ee.netlify.app', 'https://stately-hummingbird-2ce1c2.netlify.app'];
  const origin = event.headers?.origin || event.headers?.Origin || '';
  const corsOrigin = allowedOrigins.includes(origin) ? origin : allowedOrigins[0];
  const headers = {
    'Access-Control-Allow-Origin': corsOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const { agentId, message, history, lang, profile, otherAgents, calendar, style, goals, dailyLog, smartContext, image, imageType, userEmail } = JSON.parse(event.body);
    if (!agentId || !message) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing agentId or message' }) };

    // Rate limit: max message length (prevent abuse)
    if (message.length > 5000) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Message too long (max 5000 chars)' }) };

    const agent = AGENTS[agentId];
    if (!agent) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Unknown agent' }) };

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 500, headers, body: JSON.stringify({ error: 'API key not configured' }) };

    // v45 — pick Haiku (default) or Sonnet (beta opt-in via env var).
    const modelKey = pickModel(userEmail);
    const modelConfig = MODEL_CONFIG[modelKey];

    // Language instruction
    const langInstructions = {
      fr: 'Réponds toujours en français.',
      de: 'Antworte immer auf Deutsch (Schweizerdeutsch-freundlich, aber Standard-Deutsch).',
      en: 'Always respond in English.',
      it: 'Rispondi sempre in italiano.'
    };
    const langInstruction = langInstructions[lang] || langInstructions.fr;

    // Inject today's date so agents reason on the correct timeframe
    // (Anchored to Europe/Zurich since SPORTVISE targets Swiss athletes.)
    const todayLabel = new Date().toLocaleDateString('fr-CH', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      timeZone: 'Europe/Zurich'
    });
    const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Zurich' });
    const dateInstruction = `[DATE DU JOUR : ${todayLabel} (${todayIso}). Utilise cette date pour TOUS tes raisonnements temporels (J-1, demain, semaine prochaine, etc.). Ne te fie jamais à ta date d'entraînement.]`;

    // Build enriched system prompt with athlete memory.
    // The Sonnet model gets a strict style prefix prepended FIRST so the guardrails
    // dominate the agent's own (often verbose) persona prompt.
    let systemWithLang = (modelConfig.systemPrefix || '') + agent.system + '\n\n' + langInstruction + '\n\n' + dateInstruction;

    // Add athlete profile context
    if (profile) {
      systemWithLang += `\n\n[PROFIL ATHLÈTE - utilise ces infos pour personnaliser chaque réponse]\n${profile}`;
    }

    // Add cross-agent intelligence
    if (otherAgents) {
      systemWithLang += `\n\n[CONTEXTE INTER-AGENTS - sujets récents discutés avec d'autres agents SPORTVISE. Utilise ces infos si pertinent pour enrichir ta réponse, faire des liens entre les domaines, ou suggérer de consulter un autre agent.]\n${otherAgents}`;
    }

    // Add calendar context — THIS IS KEY DIFFERENTIATOR
    if (calendar) {
      systemWithLang += `\n\n[CALENDRIER SPORTIF - événements à venir de l'athlète. UTILISE ACTIVEMENT ces informations pour :\n- Adapter tes conseils au timing (ex: "tu as un match demain, voici ce que je recommande...")\n- Planifier la préparation en fonction des échéances\n- Alerter sur les priorités imminentes\n- Proposer un programme adapté au calendrier de compétition\nÉvénements :\n${calendar}]`;
    }

    // Add goals context — helps agents give concrete advice towards objectives
    if (goals) {
      systemWithLang += `\n\n[OBJECTIFS DE L'ATHLÈTE - utilise ces objectifs pour orienter tes conseils. Aide l'athlète à progresser vers ses objectifs, propose des actions concrètes, et félicite les progrès.]\n${goals}`;
    }

    // Add daily log context — agents adapt to current physical/mental state
    if (dailyLog) {
      systemWithLang += `\n\n[ÉTAT DU JOUR - journal de bord de l'athlète aujourd'hui. Adapte tes conseils à son état actuel (fatigue, douleurs, humeur). Si l'athlète va mal, sois bienveillant et adapte l'intensité de tes recommandations.]\n${dailyLog}`;
    }

    // Add smart context — agent-specific intelligence with trends, alerts, and cross-data insights
    if (smartContext) {
      systemWithLang += `\n\n[INTELLIGENCE CONTEXTUELLE — INSTRUCTIONS PRIORITAIRES]
IMPORTANT: Tu as accès à des DONNÉES EN TEMPS RÉEL fournies par la plateforme SPORTVISE.
Les données ci-dessous (classements, résultats, tendances, calendrier) sont ACTUELLES et FIABLES — utilise-les dans tes réponses.
Ne dis JAMAIS que tu n'as pas accès à des données live ou à Internet — SPORTVISE te fournit ces données automatiquement.
Les ALERTES sont prioritaires : adapte TOUJOURS ta réponse en conséquence.
Les TENDANCES t'indiquent l'évolution sur 7 jours : utilise-les pour anticiper et personnaliser.
Si tu détectes qu'un autre domaine est concerné, recommande l'agent approprié naturellement.
${smartContext}`;
    }

    // Add coaching style instruction
    if (style) {
      systemWithLang += `\n\n[STYLE DE COMMUNICATION]\n${style}`;
    }

    // Build conversation with more history for better memory
    const messages = [];
    if (history && history.length > 0) {
      history.slice(-28).forEach(msg => {
        if (msg.from === 'user') messages.push({ role: 'user', content: msg.text });
        else if (msg.from === 'agent' && msg.text !== agent.greeting) messages.push({ role: 'assistant', content: msg.text });
      });
    }
    // Build user content — with vision support if image is attached
    let userContent;
    if (image && imageType) {
      userContent = [
        {
          type: 'image',
          source: {
            type: 'base64',
            media_type: imageType,
            data: image
          }
        },
        {
          type: 'text',
          text: message + "\n\n[L'utilisateur a joint cette image. Décris ce que tu vois et réponds en fonction de ton rôle d'agent spécialisé.]"
        }
      ];
    } else {
      userContent = message;
    }
    messages.push({ role: 'user', content: userContent });

    const startTs = Date.now();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: modelConfig.id,
        max_tokens: modelConfig.maxTokens,
        temperature: modelConfig.temperature,
        system: systemWithLang,
        messages
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error(`[CHAT] model=${modelKey} (${modelConfig.id}) status=${response.status} err=`, err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Claude API error' }) };
    }

    const data = await response.json();
    const latencyMs = Date.now() - startTs;
    const inputTokens = data.usage?.input_tokens ?? null;
    const outputTokens = data.usage?.output_tokens ?? null;

    // Comparative log line for Haiku vs Sonnet observation (visible in Netlify function logs).
    console.log(`[CHAT] model=${modelKey} id=${modelConfig.id} agent=${agentId} email=${userEmail || 'anon'} input=${inputTokens} output=${outputTokens} latency=${latencyMs}ms`);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        reply: data.content[0].text,
        agent: agent.name,
        model: modelKey,
        modelId: modelConfig.id,
        inputTokens,
        outputTokens,
        latencyMs
      })
    };

  } catch (error) {
    console.error('Function error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Internal server error' }) };
  }
};
