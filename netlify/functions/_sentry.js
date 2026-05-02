// SPORTVISE — Sentry helper pour les Netlify Functions (v61.3 — server-side observability)
//
// Initialise Sentry SDK Node au top-level d'un module qui l'importe.
// Chaque Netlify Function critique (chat/index.js, stripe-webhook.js, etc.) doit faire :
//
//   const { initSentry, captureError } = require('./_sentry');
//   initSentry({ release: 'v62.5', component: 'chat' });   // au top-level (avant exports.handler)
//   ...
//   try { ... } catch (err) {
//     captureError(err, { context: { user_id, agent_id, ... } });
//     ...
//   }
//
// SÉCURITÉ : aucun PII n'est envoyé par défaut. Le contexte que tu passes via captureError
// est attaché à l'event Sentry — fais attention à ne PAS y mettre d'email, contenu de message,
// ou autre data sensible. user_id (UUID opaque) est OK.
//
// ENV VAR requise : SENTRY_DSN_SERVER (à configurer dans Netlify env vars).
//   • Si absente → l'helper devient un no-op gracieux (aucun crash, aucun event reporté).
//   • Recommandé : créer un projet Sentry séparé "sportvise-server" (région DE comme le front
//     v58) pour ne pas mélanger les events front et back.
//
// COÛT : Sentry plan free = 5k events/mois, largement suffisant pour un MVP solo.
// La tagging de release (= APP_V) permet de corréler les erreurs avec les déploiements,
// très utile pour identifier "v62.5 a introduit cette régression".

let Sentry = null;
let _initialized = false;

function initSentry({ release, component } = {}) {
  if (_initialized) return; // déjà fait dans cette invocation
  const dsn = process.env.SENTRY_DSN_SERVER;
  if (!dsn) {
    // No-op gracieux : pas de crash, juste un log discret.
    console.log('[SENTRY] DSN absent (SENTRY_DSN_SERVER non set) — observability serveur OFF');
    return;
  }
  try {
    // Lazy require — évite de charger @sentry/node si pas configuré
    Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      release: release || (process.env.SPORTVISE_APP_V || 'unknown'),
      environment: process.env.CONTEXT || 'production', // Netlify expose CONTEXT='production'/'deploy-preview'/'branch-deploy'
      tracesSampleRate: 0.0, // pas de tracing des perfs — on veut juste les erreurs
      // PII scrubbing — Sentry strippe par défaut emails/headers, mais double-check :
      sendDefaultPii: false,
      beforeSend(event) {
        // Tag composant (chat, stripe-webhook, etc.) pour filtrer dans le dashboard Sentry
        if (component) {
          event.tags = { ...(event.tags || {}), component };
        }
        return event;
      },
    });
    _initialized = true;
    console.log(`[SENTRY] init OK component=${component || 'unknown'} release=${release || 'unknown'}`);
  } catch (e) {
    console.warn('[SENTRY] init failed (require @sentry/node?):', e.message);
  }
}

// Capture une erreur avec contexte additionnel.
// `context` peut contenir { user_id, agent_id, error_code, ... } — fait attention au PII.
function captureError(err, { context, level } = {}) {
  if (!_initialized || !Sentry) return; // no-op si init pas faite
  try {
    Sentry.withScope(scope => {
      if (context) {
        for (const [k, v] of Object.entries(context)) {
          if (v != null) scope.setTag(k, String(v).slice(0, 200)); // capse 200 chars
        }
      }
      if (level) scope.setLevel(level); // 'fatal' | 'error' | 'warning' | 'info' | 'debug'
      Sentry.captureException(err);
    });
  } catch (e) {
    console.warn('[SENTRY] captureException failed:', e.message);
  }
}

// Capture un message texte (pour les warnings non-Error)
function captureMessage(message, { context, level } = {}) {
  if (!_initialized || !Sentry) return;
  try {
    Sentry.withScope(scope => {
      if (context) {
        for (const [k, v] of Object.entries(context)) {
          if (v != null) scope.setTag(k, String(v).slice(0, 200));
        }
      }
      if (level) scope.setLevel(level);
      Sentry.captureMessage(message);
    });
  } catch (e) {
    console.warn('[SENTRY] captureMessage failed:', e.message);
  }
}

// Flush avant la fin de l'exécution Netlify Function (sinon les events peuvent être perdus).
// À appeler en fin de handler (idéalement avec timeout court).
async function flushSentry(timeoutMs = 2000) {
  if (!_initialized || !Sentry) return;
  try {
    await Sentry.flush(timeoutMs);
  } catch (_) { /* swallow */ }
}

module.exports = { initSentry, captureError, captureMessage, flushSentry };
