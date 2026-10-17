# Shizuha authentication

Django REST Framework user authentication shared by Shizuha services.
Configure `SHIZUHA_SERVICE_NAME` and the exact public
`SHIZUHA_EXPECTED_ISSUER`. Set `SHIZUHA_OAUTH_JWKS_URL` for the trusted key
transport, and `SHIZUHA_REVOCATION_STATUS_URL` for the private ID
`/api/oauth/revocation-status` endpoint when public issuer and transport differ.

RS256 authentication requires a keyed access token with expiry and issued-at
claims. Its audience must name the consuming service, or be the canonical
first-party human wildcard. A service/client token cannot use that wildcard.
The generic user authenticators continue to refuse canonical M2M tokens without
user identity; service clients require purpose-built scope-aware authorization.
Legacy HS256 access tokens retain their configured SimpleJWT verification.

Both exported authenticators consult ID for every verified token, including
legacy tokens. Revoked tokens return 401; unknown, malformed, unavailable or
redirected authority responses return 503. There is no cached allow after logout.
Invalid signatures and missing issuer/service configuration do not send the
bearer to the authority. Signature-only utilities never authenticate a user.

Run `PYTHONPATH=. python -m pytest -q tests/` with Django, Django REST Framework,
SimpleJWT, PyJWT, cryptography and pytest installed. The HTTP regressions use a
local disposable signing key and authority; they never contact a deployed ID.
