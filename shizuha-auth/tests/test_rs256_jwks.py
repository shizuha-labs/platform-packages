import base64
import json
import time
from unittest.mock import patch

import jwt
import pytest
from django.conf import settings

if not settings.configured:
    settings.configure(
        SECRET_KEY="test",
        INSTALLED_APPS=["django.contrib.auth", "django.contrib.contenttypes"],
        DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3", "NAME": ":memory:"}},
        USE_TZ=True,
        DEFAULT_AUTO_FIELD="django.db.models.AutoField",
    )
    import django
    django.setup()
from cryptography.hazmat.primitives.asymmetric import rsa
from rest_framework_simplejwt.exceptions import InvalidToken

from shizuha_auth.authentication import (
    clear_jwks_cache,
    validate_rs256_jwks_token,
)


class _Response:
    def __init__(self, payload):
        self.payload = payload

    def __enter__(self):
        return self

    def __exit__(self, *args):
        return False

    def read(self):
        return json.dumps(self.payload).encode("utf-8")


def _b64url_int(value):
    raw = value.to_bytes((value.bit_length() + 7) // 8, "big")
    return base64.urlsafe_b64encode(raw).rstrip(b"=").decode("ascii")


def _keypair(kid="kid-1"):
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = private_key.public_key().public_numbers()
    jwk = {
        "kty": "RSA",
        "kid": kid,
        "alg": "RS256",
        "use": "sig",
        "n": _b64url_int(numbers.n),
        "e": _b64url_int(numbers.e),
    }
    return private_key, jwk


def _token(private_key, kid="kid-1", aud="pulse", iss="https://id.test"):
    payload = {
        "user_id": "13",
        "email": "kai@example.test",
        "aud": aud,
        "iss": iss,
        "exp": int(time.time()) + 300,
    }
    return jwt.encode(payload, private_key, algorithm="RS256", headers={"kid": kid})


def test_validate_rs256_jwks_token_uses_kid_and_enforces_audience():
    private_key, jwk = _keypair()
    token = _token(private_key)
    clear_jwks_cache()

    with patch("urllib.request.urlopen", return_value=_Response({"keys": [jwk]})):
        validated = validate_rs256_jwks_token(
            token,
            service_name="pulse",
            expected_issuer="https://id.test",
        )

    assert validated["user_id"] == "13"
    assert validated["aud"] == "pulse"


def test_validate_rs256_jwks_token_rejects_missing_or_wrong_audience():
    private_key, jwk = _keypair()
    token = _token(private_key, aud="connect")
    clear_jwks_cache()

    with patch("urllib.request.urlopen", return_value=_Response({"keys": [jwk]})):
        with pytest.raises(InvalidToken, match="audience"):
            validate_rs256_jwks_token(
                token,
                service_name="pulse",
                expected_issuer="https://id.test",
            )


def test_validate_rs256_jwks_token_refetches_for_rotated_kid():
    private_key, jwk = _keypair("new-kid")
    token = _token(private_key, kid="new-kid")
    clear_jwks_cache()
    first = _Response({"keys": []})
    second = _Response({"keys": [jwk]})

    with patch("urllib.request.urlopen", side_effect=[first, second]):
        validated = validate_rs256_jwks_token(
            token,
            service_name="pulse",
            expected_issuer="https://id.test",
        )

    assert validated["email"] == "kai@example.test"


def test_validate_rs256_jwks_token_rejects_alg_none_before_jwks_fetch():
    token = jwt.encode({"user_id": "13"}, key="", algorithm="none")
    clear_jwks_cache()

    with patch("urllib.request.urlopen") as urlopen:
        assert validate_rs256_jwks_token(token, service_name="pulse") is None

    urlopen.assert_not_called()
