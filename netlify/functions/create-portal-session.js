// SPORTVISE — Stripe Customer Portal Session
// Allows customers to manage/cancel their subscription

const https = require('https');
const { initSentry, captureError } = require('./_sentry');

// v61.3 — observability serveur. No-op gracieux si SENTRY_DSN_SERVER absent.
initSentry({ component: 'create-portal-session', release: process.env.SPORTVISE_APP_V || 'v62.5' });

const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

function stripeApiPost(path, body) {
  const postData = new URLSearchParams(body).toString();
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com',
      path: path,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(data) }); }
        catch(e) { resolve({ status: res.statusCode, data: data }); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

function stripeApiGet(path) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.stripe.com',
      path: path,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: 'Method not allowed' };

  if (!STRIPE_SECRET_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Stripe not configured' }) };
  }

  try {
    const { email } = JSON.parse(event.body);

    if (!email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Email required' }) };
    }

    // Find Stripe customer by email
    const customers = await stripeApiGet(`/v1/customers?email=${encodeURIComponent(email)}&limit=1`);

    if (!customers.data || customers.data.length === 0) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'No Stripe customer found for this email' }) };
    }

    const customerId = customers.data[0].id;

    // Create a Stripe Customer Portal session
    const portalSession = await stripeApiPost('/v1/billing_portal/sessions', {
      customer: customerId,
      return_url: 'https://sportvise.ch/app/dashboard.html'
    });

    if (portalSession.status >= 300) {
      console.error('Portal session error:', portalSession.data);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to create portal session', details: portalSession.data?.error?.message }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ url: portalSession.data.url })
    };

  } catch (error) {
    console.error('Portal error:', error);
    captureError(error, { level: 'error' });
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
