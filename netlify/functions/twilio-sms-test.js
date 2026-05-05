exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'text/xml; charset=utf-8',
    'Cache-Control': 'no-store',
  };

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: '<Response><Message>Method not allowed.</Message></Response>',
    };
  }

  const contentType = event.headers['content-type'] || event.headers['Content-Type'] || '';
  let params = {};

  if (event.httpMethod === 'GET') {
    params = event.queryStringParameters || {};
  } else if (contentType.includes('application/x-www-form-urlencoded')) {
    params = Object.fromEntries(new URLSearchParams(event.body || ''));
  } else if (contentType.includes('application/json')) {
    try {
      params = JSON.parse(event.body || '{}');
    } catch (error) {
      params = { parse_error: String(error), raw_body: event.body || '' };
    }
  } else {
    params = { raw_body: event.body || '' };
  }

  const from = params.From || params.from || 'unknown';
  const body = params.Body || params.body || params.text || '';
  const sid = params.MessageSid || params.SmsSid || params.sid || 'no-sid';
  const maskedFrom = String(from).replace(/(\+?\d{2})\d+(\d{4})$/, '$1****$2');

  console.log(JSON.stringify({
    event: 'twilio_sms_test_received',
    at: new Date().toISOString(),
    sid,
    from: maskedFrom,
    body,
    contentType,
  }));

  const safeSid = String(sid).replace(/[<>&'"]/g, '');
  const reply = `SignalDev Labs SMS test received. Ref ${safeSid.slice(-8) || 'test'}. Reply STOP to opt out, HELP for help.`;

  return {
    statusCode: 200,
    headers,
    body: `<Response><Message>${reply}</Message></Response>`,
  };
};
