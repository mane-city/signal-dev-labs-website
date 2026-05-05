#!/usr/bin/env bash
set -euo pipefail

: "${TWILIO_ACCOUNT_SID:?Set TWILIO_ACCOUNT_SID first}"
: "${TWILIO_AUTH_TOKEN:?Set TWILIO_AUTH_TOKEN first}"
: "${TWILIO_PHONE_NUMBER_SID:=PN916bd50a864a854c5e67a63f720b5362}"
: "${TWILIO_MESSAGING_SERVICE_SID:=MG7b89187b403984084977ef76529d8998}"
: "${HERMES_PUBLIC_BASE_URL:=https://www.signaldevlabs.xyz}"

BASE="${HERMES_PUBLIC_BASE_URL%/}"
INBOUND="$BASE/twilio/sms/inbound"
FALLBACK="$BASE/twilio/sms/inbound-fallback"
STATUS="$BASE/twilio/sms/status"

echo "Configuring Twilio number and Messaging Service webhooks..."
echo "Inbound:  $INBOUND"
echo "Fallback: $FALLBACK"
echo "Status:   $STATUS"

curl -fsS -X POST "https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/IncomingPhoneNumbers/${TWILIO_PHONE_NUMBER_SID}.json" \
  -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" \
  --data-urlencode "SmsUrl=${INBOUND}" \
  --data-urlencode "SmsMethod=POST" \
  --data-urlencode "SmsFallbackUrl=${FALLBACK}" \
  --data-urlencode "SmsFallbackMethod=POST" \
  >/tmp/twilio-phone-update.json

curl -fsS -X POST "https://messaging.twilio.com/v1/Services/${TWILIO_MESSAGING_SERVICE_SID}" \
  -u "${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}" \
  --data-urlencode "StatusCallback=${STATUS}" \
  >/tmp/twilio-service-update.json

python3 - <<'PY'
import json
for label,path in [('phone','/tmp/twilio-phone-update.json'),('service','/tmp/twilio-service-update.json')]:
    data=json.load(open(path))
    keep={k:data.get(k) for k in ['sid','friendly_name','phone_number','sms_url','sms_method','sms_fallback_url','sms_fallback_method','status_callback'] if k in data}
    print(label, json.dumps(keep, indent=2))
PY

echo "Twilio webhook configuration complete."
