// ═══════════════════════════════════════════════════════════════════
// SPORTVISE — WEB PUSH SUBSCRIPTIONS (Killer Feature #1 — Brief matinal)
// ═══════════════════════════════════════════════════════════════════
// Module concaténé au build via build.js section §1.5.
// v63.3.0 — Phase B Idée 1 STRATEGIE / audit P1 #9.
//
// Permet aux users opt-in de recevoir un push notification chaque matin
// à 7h CET avec leur brief : prochain événement, alerte journal, etc.
// L'envoi est fait par Netlify Function send-morning-brief, déclenchée
// par cron-job.org. Voir RUNBOOK_v63_brief_matinal_setup.md.
//
// Architecture :
//   1. User opt-in via modal au boot dashboard (dans dashboard.html)
//   2. subscribeToPush() demande permission browser + crée subscription
//      via SW pushManager + INSERT dans table push_subscriptions Supabase
//   3. Update profiles.morning_brief_optin = 'on'
//   4. À 7h, send-morning-brief itère sur les subscriptions et envoie
//   5. SW v23 listener 'push' affiche la notification
//   6. Click sur notif → focus dashboard (SW listener 'notificationclick')
//
// Dépend des globals : currentUser, sb (Supabase client), userProfile.
// VAPID public key : injectée par build.js dans window.SV_VAPID_PUBLIC_KEY
// (depuis env var Netlify VAPID_PUBLIC_KEY — voir runbook).
// ═══════════════════════════════════════════════════════════════════

// ── Vérifie le support browser (Push API + Notifications + SW) ──
function isPushSupported() {
  return ('Notification' in window)
      && ('serviceWorker' in navigator)
      && ('PushManager' in window);
}

// ── Vérifie si la VAPID public key est configurée ──
// Retourne null si l'env var n'a pas été substituée au build (build local sans env).
function getVapidPublicKey() {
  const key = (typeof window !== 'undefined' && window.SV_VAPID_PUBLIC_KEY) || '';
  // Détection du placeholder non-substitué (cas build local sans env var)
  if (!key || key === '__SV_VAPID_PUBLIC_KEY__' || key.length < 80) return null;
  return key;
}

// ── Convertit la clé VAPID base64url en Uint8Array (format requis par PushManager) ──
function _urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const arr = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) arr[i] = rawData.charCodeAt(i);
  return arr;
}

// ── Subscribe : demande permission + crée subscription + stocke en DB ──
// Retourne { ok: true } en cas de succès, { ok: false, reason } sinon.
async function subscribeToPush() {
  if (!isPushSupported()) {
    return { ok: false, reason: 'unsupported' };
  }
  const vapidKey = getVapidPublicKey();
  if (!vapidKey) {
    console.warn('[PUSH] VAPID_PUBLIC_KEY missing in window.SV_VAPID_PUBLIC_KEY');
    return { ok: false, reason: 'vapid_missing' };
  }

  // 1. Permission browser
  let permission = Notification.permission;
  if (permission === 'default') {
    try {
      permission = await Notification.requestPermission();
    } catch (e) {
      return { ok: false, reason: 'permission_error', error: e.message };
    }
  }
  if (permission !== 'granted') {
    return { ok: false, reason: 'permission_denied' };
  }

  // 2. Récupère la SW registration (sw.js v23 doit être actif)
  let swReg;
  try {
    swReg = await navigator.serviceWorker.ready;
  } catch (e) {
    return { ok: false, reason: 'sw_not_ready', error: e.message };
  }

  // 3. Crée la subscription via PushManager
  let subscription;
  try {
    // Vérifie si déjà subscribed (re-utilise la subscription existante)
    subscription = await swReg.pushManager.getSubscription();
    if (!subscription) {
      subscription = await swReg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(vapidKey)
      });
    }
  } catch (e) {
    console.error('[PUSH] subscribe error:', e);
    return { ok: false, reason: 'subscribe_error', error: e.message };
  }

  // 4. Sérialise la subscription pour Supabase
  const subJson = subscription.toJSON();
  const endpoint = subJson.endpoint;
  const p256dh = subJson.keys?.p256dh;
  const auth = subJson.keys?.auth;
  if (!endpoint || !p256dh || !auth) {
    return { ok: false, reason: 'invalid_subscription' };
  }

  // 5. Upsert dans push_subscriptions (1 user peut avoir plusieurs subs sur multi-device)
  try {
    const { error } = await sb.from('push_subscriptions').upsert({
      user_id: currentUser.id,
      endpoint,
      p256dh,
      auth,
      lang: (typeof currentLang !== 'undefined' ? currentLang : 'fr'),
      user_agent: navigator.userAgent.slice(0, 200)
    }, { onConflict: 'user_id,endpoint' });
    if (error) {
      console.warn('[PUSH] upsert subscription error:', error);
      return { ok: false, reason: 'db_error', error: error.message };
    }
  } catch (e) {
    return { ok: false, reason: 'db_exception', error: e.message };
  }

  // 6. Update profiles.morning_brief_optin = 'on'
  try {
    await sb.from('profiles').update({ morning_brief_optin: 'on' }).eq('id', currentUser.id);
    if (typeof userProfile !== 'undefined' && userProfile) {
      userProfile.morning_brief_optin = 'on';
    }
  } catch (e) {
    console.warn('[PUSH] update morning_brief_optin error:', e);
    // Non-bloquant : la subscription est créée, le scheduler fonctionnera quand même
  }

  return { ok: true, endpoint };
}

// ── Unsubscribe : supprime subscription + DELETE en DB + update profile ──
async function unsubscribeFromPush() {
  if (!isPushSupported()) return { ok: false, reason: 'unsupported' };

  let swReg, subscription;
  try {
    swReg = await navigator.serviceWorker.ready;
    subscription = await swReg.pushManager.getSubscription();
  } catch (e) {
    return { ok: false, reason: 'sw_error', error: e.message };
  }

  if (subscription) {
    const endpoint = subscription.endpoint;
    try {
      await subscription.unsubscribe();
    } catch (e) {
      console.warn('[PUSH] unsubscribe browser error (continuing):', e);
    }
    try {
      await sb.from('push_subscriptions')
        .delete()
        .eq('user_id', currentUser.id)
        .eq('endpoint', endpoint);
    } catch (e) {
      console.warn('[PUSH] delete subscription DB error:', e);
    }
  }

  try {
    await sb.from('profiles').update({ morning_brief_optin: 'off' }).eq('id', currentUser.id);
    if (typeof userProfile !== 'undefined' && userProfile) {
      userProfile.morning_brief_optin = 'off';
    }
  } catch (e) {
    console.warn('[PUSH] update morning_brief_optin off error:', e);
  }

  return { ok: true };
}

// ── Helper : statut actuel pour l'UI (toggle Profile, chip dashboard) ──
function getMorningBriefStatus() {
  if (typeof userProfile !== 'undefined' && userProfile && userProfile.morning_brief_optin) {
    return userProfile.morning_brief_optin; // 'on' | 'later' | 'off'
  }
  return null; // pas encore demandé
}

// ── Update du statut sans toucher aux subscriptions browser ──
// Utilisé pour 'later' (déclic à plus tard) qui n'unsubscribe pas mais marque
// le profil pour ne pas re-spammer la modal au prochain boot.
async function setMorningBriefStatus(status) {
  if (!['on', 'later', 'off'].includes(status)) return { ok: false, reason: 'invalid_status' };
  try {
    await sb.from('profiles').update({ morning_brief_optin: status }).eq('id', currentUser.id);
    if (typeof userProfile !== 'undefined' && userProfile) {
      userProfile.morning_brief_optin = status;
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'db_error', error: e.message };
  }
}
