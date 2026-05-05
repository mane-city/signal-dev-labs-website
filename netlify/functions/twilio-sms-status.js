const crypto = require('crypto');

function parseParams(event) {
  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(event.body || ''));
  }
  if (contentType.includes('application/json')) {
    try { return JSON.parse(event.body || '{}'); } catch { return {}; }
  }
  return event.queryStringParameters || {};
}

function twilioSignature(authToken, url, params) {
  const material = url + Object.keys(params).sort().map((k) => `${k}${params[k]}`).join('');
  return crypto.createHmac('sha1', authToken).update(material).digest('base64');
}

function validate(event, params, route) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const provided = event.headers['x-twilio-signature'] || event.headers['X-Twilio-Signature'] || '';
  if (!authToken) return { ok: true, mode: 'skipped_missing_auth_token' };
  if (!provided) return { ok: false, mode: 'missing_signature' };
  const host = event.headers.host || event.headers.Host || new URL(process.env.HERMES_PUBLIC_BASE_URL || 'https://www.signaldevlabs.xyz').host;
  const url = `https://${host}${route}`;
  const expected = twilioSignature(authToken, url, params);
  const ok = crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  return { ok, mode: ok ? 'valid' : 'invalid' };
}

exports.handler = async (event) => {
  const params = parseParams(event);
  const route = event.path.includes('fallback') ? '/twilio/sms/inbound-fallback' : '/twilio/sms/status';
  const sig = validate(event, params, route);
  const payload = {
    event: route.endsWith('status') ? 'twilio_sms_status' : 'twilio_sms_inbound_fallback',
    at: new Date().toISOString(),
    signature: sig.mode,
    messageSid: params.MessageSid || params.SmsSid || '',
    messageStatus: params.MessageStatus || '',
    errorCode: params.ErrorCode || '',
    optOutType: params.OptOutType || '',
    to_last4: params.To ? String(params.To).slice(-4) : '',
    from_last4: params.From ? String(params.From).slice(-4) : '',
  };
  console.log(JSON.stringify(payload));
  if (!sig.ok) {
    return { statusCode: 403, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' }, body: '<Response><Message>Signature validation failed.</Message></Response>' };
  }
  if (route.endsWith('fallback')) {
    return { statusCode: 200, headers: { 'Content-Type': 'text/xml; charset=utf-8', 'Cache-Control': 'no-store' }, body: '<Response><Message>Due diligence SMS fallback received. We are checking the request.</Message></Response>' };
  }
  return { statusCode: 204, headers: { 'Cache-Control': 'no-store' }, body: '' };
};
