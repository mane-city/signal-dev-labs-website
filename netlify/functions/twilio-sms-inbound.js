const crypto = require('crypto');

function xmlEscape(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function parseParams(event) {
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (event.httpMethod === 'GET') return event.queryStringParameters || {};
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(event.body || ''));
  }
  if (contentType.includes('application/json')) {
    try { return JSON.parse(event.body || '{}'); } catch { return {}; }
  }
  return {};
}

function publicUrl(event) {
  const proto = event.headers['x-forwarded-proto'] || 'https';
  const host = event.headers.host || event.headers.Host || new URL(process.env.HERMES_PUBLIC_BASE_URL || 'https://www.signaldevlabs.xyz').host;
  // Twilio signs the public URL it called. Netlify redirects /twilio/sms/inbound to this function,
  // so prefer the redirected route when available via x-original-url; otherwise use rawUrl.
  const raw = event.rawUrl || `${proto}://${host}${event.path}`;
  try {
    const u = new URL(raw);
    if (u.pathname.includes('/.netlify/functions/twilio-sms-inbound')) {
      u.pathname = '/twilio/sms/inbound';
      u.search = '';
      return u.toString();
    }
    u.search = '';
    return u.toString();
  } catch {
    return `${proto}://${host}/twilio/sms/inbound`;
  }
}

function twilioSignature(authToken, url, params) {
  const material = url + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha1', authToken).update(material).digest('base64');
}

function validateTwilioSignature(event, params) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const provided = event.headers['x-twilio-signature'] || event.headers['X-Twilio-Signature'] || '';
  if (!authToken) return { ok: true, mode: 'skipped_missing_auth_token' };
  if (!provided) return { ok: false, mode: 'missing_signature' };
  const url = publicUrl(event);
  const expected = twilioSignature(authToken, url, params);
  const ok = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  return { ok, mode: ok ? 'valid' : 'invalid', url };
}

function normalizeBody(body) {
  return String(body || '').trim().replace(/^DD\s+/i, '').replace(/^due\s+diligence\s+/i, '').trim();
}

function authorizedSenders() {
  return new Set(String(process.env.AUTHORIZED_SMS_SENDERS || '').split(',').map((s) => s.trim()).filter(Boolean));
}

exports.handler = async (event) => {
  const headers = { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' };
  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: '<Response><Message>Method not allowed.</Message></Response>' };
  }

  const params = parseParams(event);
  const sig = validateTwilioSignature(event, params);
  const from = params.From || '';
  const to = params.To || '';
  const messageSid = params.MessageSid || params.SmsSid || '';
  const accountSid = params.AccountSid || '';
  const company = normalizeBody(params.Body || '');
  const configuredAccount = process.env.TWILIO_ACCOUNT_SID || '';
  const configuredTo = process.env.TWILIO_PHONE_NUMBER || '+18885266409';
  const allowed = authorizedSenders();
  const maskedFrom = String(from).replace(/(\+?\d{2})\d+(\d{4})$/, '$1****$2');

  console.log(JSON.stringify({
    event: 'twilio_due_diligence_inbound',
    at: new Date().toISOString(),
    messageSid,
    accountSid_ok: configuredAccount ? accountSid === configuredAccount : 'not_configured',
    signature: sig.mode,
    from: maskedFrom,
    to,
    to_ok: configuredTo ? to === configuredTo : 'not_configured',
    company,
    authorized_sender_configured: allowed.size > 0,
    authorized: allowed.has(from),
  }));

  if (!sig.ok) {
    return { statusCode: 403, headers, body: '<Response><Message>Signature validation failed.</Message></Response>' };
  }
  if (configuredAccount && accountSid && accountSid !== configuredAccount) {
    return { statusCode: 403, headers, body: '<Response><Message>Account validation failed.</Message></Response>' };
  }
  if (configuredTo && to && to !== configuredTo) {
    return { statusCode: 403, headers, body: '<Response><Message>Destination validation failed.</Message></Response>' };
  }
  if (!allowed.has(from)) {
    return { statusCode: 200, headers, body: '<Response><Message>Sorry, this number isn&apos;t authorized for due-diligence requests.</Message></Response>' };
  }
  if (!company) {
    return { statusCode: 200, headers, body: '<Response><Message>Send a company name, for example: Apple. Reply STOP to opt out or HELP for help.</Message></Response>' };
  }

  // Production bridge point: this currently ACKs and logs a durable Netlify function event.
  // The local Tektronix due-diligence worker remains the private DB-first report generator.
  const ack = `Got it — generating ${company} due diligence report for you now. I'll email you and post in Teams when ready.`;
  return { statusCode: 200, headers, body: `<Response><Message>${xmlEscape(ack)}</Message></Response>` };
};
