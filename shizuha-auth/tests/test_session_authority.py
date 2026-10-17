"""The exported DRF authenticators must agree with authoritative session logout."""
import base64
import json
import secrets
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from unittest.mock import patch

import jwt
import pytest
from django.conf import settings

if not settings.configured:
    settings.configure(SECRET_KEY=secrets.token_urlsafe(48),
        INSTALLED_APPS=['django.contrib.auth', 'django.contrib.contenttypes'],
        DATABASES={'default': {'ENGINE': 'django.db.backends.sqlite3', 'NAME': ':memory:'}},
        USE_TZ=True, ROOT_URLCONF=__name__, ALLOWED_HOSTS=['testserver'])
    import django
    django.setup()

from cryptography.hazmat.primitives.asymmetric import rsa
from django.test import override_settings
from django.urls import path
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.test import APIClient
from rest_framework.views import APIView
from shizuha_auth import authentication


class Protected(APIView):
    permission_classes = [IsAuthenticated]
    def get(self, request):
        return Response({'user_id': request.user.id})


urlpatterns = [path('protected/', Protected.as_view())]


def b64(value):
    return base64.urlsafe_b64encode(value.to_bytes((value.bit_length() + 7) // 8, 'big')).rstrip(b'=').decode()


@pytest.fixture
def authority(monkeypatch):
    private = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    numbers = private.public_key().public_numbers()
    jwk = {'kid': 'test-session-key', 'kty': 'RSA', 'alg': 'RS256', 'n': b64(numbers.n), 'e': b64(numbers.e)}
    state = {'active': True, 'code': 200, 'tokens': [], 'redirect_gets': 0}
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            if self.path == '/.well-known/jwks.json':
                self.answer({'keys': [jwk]})
            else:
                state['redirect_gets'] += 1
                self.answer({'active': True})
        def do_POST(self):
            state['tokens'].append(json.loads(self.rfile.read(int(self.headers['Content-Length'])))['token'])
            self.answer({'active': state['active']}, state['code'])
        def answer(self, body, code=200):
            raw = json.dumps(body).encode()
            self.send_response(code)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(raw)))
            if code == 302:
                self.send_header('Location', '/redirect-target')
            self.end_headers()
            self.wfile.write(raw)
        def log_message(self, *args):
            pass
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    origin = f'http://127.0.0.1:{server.server_port}'
    monkeypatch.setenv('SHIZUHA_OAUTH_JWKS_URL', origin + '/.well-known/jwks.json')
    monkeypatch.setenv('SHIZUHA_REVOCATION_STATUS_URL', origin + '/api/oauth/revocation-status')
    authentication.clear_jwks_cache()
    def token(**extra):
        payload = {'user_id': 13, 'sub': '13', 'token_type': 'access', 'iat': int(time.time()),
                   'exp': int(time.time()) + 300, 'iss': origin, 'aud': 'wiki',
                   'sid': 'disposable-session', 'organization_memberships': {'7': 'member'}}
        payload.update(extra)
        if payload.get('is_service'):
            payload.pop('user_id', None)
        return jwt.encode(payload, private, algorithm='RS256', headers={'kid': jwk['kid']})
    with override_settings(ROOT_URLCONF=__name__, SHIZUHA_SERVICE_NAME='wiki',
                           SHIZUHA_EXPECTED_ISSUER=origin):
        with patch.object(authentication, '_try_local_user',
                          side_effect=lambda _uid, claims: authentication._make_federated_user(claims)):
            yield state, token, origin
    server.shutdown()
    thread.join()
    server.server_close()
    authentication.clear_jwks_cache()


@pytest.fixture(params=[authentication.ShizuhaJWTAuthentication, authentication.ShizuhaIDAuthentication])
def client(request):
    Protected.authentication_classes = [request.param]
    return APIClient()


def get(client, token):
    return client.get('/protected/', HTTP_AUTHORIZATION='Bearer ' + token)


def test_exact_token_is_rechecked_after_authoritative_logout(client, authority):
    state, mint, _ = authority
    token = mint()
    assert get(client, token).status_code == 200
    state['active'] = False
    assert get(client, token).status_code == 401
    assert state['tokens'] == [token, token]


@pytest.mark.parametrize('code,active', [(503, True), (200, 'true'), (302, True)])
def test_unknown_authority_is_not_an_allow_or_redirect(client, authority, code, active):
    state, mint, _ = authority
    state.update(code=code, active=active)
    assert get(client, mint()).status_code == 503
    assert state['redirect_gets'] == 0


def test_canonical_service_principal_cannot_become_a_generic_authenticated_user(client, authority):
    state, mint, _ = authority
    token = mint(sub='service:service-client', is_service=True,
                 client_id='service-client', scope='wiki:pages.read', aud=['wiki'], sid=None)
    assert get(client, token).status_code == 401
    assert state['tokens'] == [token]


def test_first_party_human_wildcard_is_the_native_id_contract(client, authority):
    state, mint, _ = authority
    token = mint(aud='*')
    assert get(client, token).status_code == 200
    state['active'] = False
    assert get(client, token).status_code == 401


@pytest.mark.parametrize('claims', [{'aud': 'foreign-client'}, {'iss': 'https://wrong.example'},
                                   {'token_type': 'refresh'}, {'exp': None},
                                   {'is_service': True, 'client_id': 'service-client',
                                    'sub': 'service:service-client', 'aud': '*'}])
def test_unbound_or_non_access_token_never_reaches_authority(client, authority, claims):
    state, mint, _ = authority
    assert get(client, mint(**claims)).status_code == 401
    assert state['tokens'] == []


def test_legacy_hs_access_token_also_consults_authority(client, authority):
    from rest_framework_simplejwt.tokens import AccessToken
    state, _, _ = authority
    token = AccessToken()
    token['user_id'] = 13
    token['organization_memberships'] = {'7': 'member'}
    raw = str(token)
    assert get(client, raw).status_code == 200
    state['active'] = False
    assert get(client, raw).status_code == 401
    assert state['tokens'] == [raw, raw]


def test_unsigned_input_never_reaches_session_authority(client, authority):
    state, _, _ = authority
    token = jwt.encode({'user_id': 13}, key='', algorithm='none')
    assert get(client, token).status_code == 401
    assert state['tokens'] == []


def test_missing_consuming_service_cannot_skip_audience_binding(client, authority, monkeypatch):
    state, mint, _ = authority
    monkeypatch.delenv('SHIZUHA_SERVICE_NAME', raising=False)
    with override_settings(SHIZUHA_SERVICE_NAME=''):
        assert get(client, mint()).status_code == 401
    assert state['tokens'] == []
