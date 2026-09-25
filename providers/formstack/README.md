# Formstack

Formstack Forms' WebHook submit action ("Send Data to an External URL"). It fires on
exactly one thing, a form submission, and sends no event type in any header or body field.
That is why `topic_identifier` is `null`.

`submission` is the name of the file, not a value Formstack sends. Don't match on it, and
don't treat it as Formstack event vocabulary. Route Formstack deliveries on the `FormID`
body field.

## The sample

`latest/submission.json` is a real delivery, captured on 2026-09-25 from a test form with
no answer fields. It went through a Hookdeck source, and the `x-hookdeck-*` headers were
removed. Everything else is as received, including the signature.

- The body arrived as `application/x-www-form-urlencoded`, which is Formstack's default.
  The exact wire bytes were `FormID=6606394&UniqueID=1500878955&HandshakeKey=test`.
- `x-fs-signature` is HMAC-SHA256 of those bytes, as lowercase hex prefixed with
  `sha256=`. The WebHook's HMAC Key was the throwaway value `test1`, so the signature can
  be recomputed:

  ```bash
  printf '%s' 'FormID=6606394&UniqueID=1500878955&HandshakeKey=test' | openssl dgst -sha256 -hmac test1 -r
  ```

- `HandshakeKey` carries the WebHook's Shared Secret, here the throwaway `test`. This capture
  had a Shared Secret set, so it doesn't show what a WebHook without one sends.

A mock send re-encodes the body, and the bytes may not match the original. The
signature is only valid against the exact wire bytes above.

Formstack Documents (formerly WebMerge) is a different product with a different webhook
and is not covered here.
