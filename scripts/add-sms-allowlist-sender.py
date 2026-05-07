#!/usr/bin/env python3
"""Add a phone number to the hashed SMS allowlist JSON.

Usage:
  SMS_ALLOWLIST_HASH_PEPPER='...' scripts/add-sms-allowlist-sender.py +15551234567

The output JSON stores only HMAC-SHA256 hashes, not raw phone numbers.
"""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import pathlib
import re
import sys

DEFAULT_PATH = pathlib.Path(__file__).resolve().parents[1] / "allowlists" / "sms-authorized-senders.json"


def normalize_phone(value: str) -> str:
    raw = value.strip()
    plus_digits = re.sub(r"[^+\d]", "", raw)
    if plus_digits.startswith("+"):
        return "+" + re.sub(r"\D", "", plus_digits[1:])
    digits = re.sub(r"\D", "", plus_digits)
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) > 10:
        return "+" + digits
    raise SystemExit("phone number must be E.164 or a 10+ digit number")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("phone", help="Phone number to authorize; raw value is never written to JSON")
    ap.add_argument("--path", default=str(DEFAULT_PATH), help="Allowlist JSON path")
    args = ap.parse_args()

    pepper = os.environ.get("SMS_ALLOWLIST_HASH_PEPPER", "")
    if not pepper:
        raise SystemExit("Set SMS_ALLOWLIST_HASH_PEPPER in the environment first")

    path = pathlib.Path(args.path)
    data = json.loads(path.read_text())
    phone = normalize_phone(args.phone)
    digest = hmac.new(pepper.encode(), phone.encode(), hashlib.sha256).hexdigest()
    hashes = set(data.get("authorized_sender_hashes") or [])
    before = len(hashes)
    hashes.add(digest)
    data["authorized_sender_hashes"] = sorted(hashes)
    data["updated_at"] = dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")
    path.write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")
    print(json.dumps({"path": str(path), "added": len(hashes) > before, "hash_count": len(hashes)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
