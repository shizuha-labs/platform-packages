"""
Shared JWT authentication classes for all Shizuha services.

ShizuhaJWTAuthentication — DRF JWT auth that creates FederatedUser from token claims.
ShizuhaIDAuthentication  — Alternative auth that validates tokens via AccessToken directly.
"""

import json
import logging
import os
import time
import urllib.request

import jwt

from rest_framework import authentication, exceptions
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework_simplejwt.tokens import AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
from django.contrib.auth import get_user_model

from .user import FederatedUser, normalize_memberships
from .revocation import enforce_token_active

logger = logging.getLogger(__name__)


class RS256Token(dict):
    """Dict-like SimpleJWT-compatible token returned for JWKS-verified RS256 JWTs."""


_JWKS_CACHE = {}
_DEFAULT_JWKS_TTL_SECONDS = 600


def _jwks_url_from_context(expected_issuer: str = '') -> str:
    """Resolve the shizuha-id JWKS endpoint from settings/env."""
    explicit = os.environ.get('SHIZUHA_OAUTH_JWKS_URL') or os.environ.get('SHIZUHA_JWKS_URL')
    if explicit:
        return explicit
    issuer = (expected_issuer or os.environ.get('SHIZUHA_EXPECTED_ISSUER')
              or 'http://shizuha-id:8001').rstrip('/')
    return f'{issuer}/.well-known/jwks.json'


def clear_jwks_cache() -> None:
    """Clear the in-process JWKS cache (useful for tests and key-rotation probes)."""
    _JWKS_CACHE.clear()


def _fetch_jwks_keys(jwks_url: str, *, force_refresh: bool = False) -> dict:
    """Fetch and cache RSA public keys from shizuha-id's JWKS endpoint by kid."""
    ttl = int(os.environ.get('SHIZUHA_JWKS_CACHE_TTL_SECONDS') or _DEFAULT_JWKS_TTL_SECONDS)
    now = time.time()
    cached = _JWKS_CACHE.get(jwks_url)
    if (not force_refresh and cached and
            now - cached.get('fetched_at', 0) < ttl and cached.get('keys')):
        return cached['keys']

    with urllib.request.urlopen(jwks_url, timeout=5) as response:
        jwks = json.loads(response.read().decode('utf-8'))

    keys = {}
    for raw_key in jwks.get('keys', []):
        kid = raw_key.get('kid')
        if not kid or raw_key.get('kty') != 'RSA':
            continue
        alg = raw_key.get('alg')
        if alg and alg != 'RS256':
            continue
        keys[kid] = jwt.algorithms.RSAAlgorithm.from_jwk(json.dumps(raw_key))

    _JWKS_CACHE[jwks_url] = {'fetched_at': now, 'keys': keys}
    return keys


def _audience_values(aud):
    if aud is None:
        return []
    if isinstance(aud, str):
        return [aud]
    if isinstance(aud, (list, tuple, set)):
        return list(aud)
    return [aud]


def enforce_rs256_token_binding(validated_token, service_name: str) -> None:
    """Require RS256 tokens to be bound to the consuming service audience."""
    if not service_name:
        return
    audiences = _audience_values(validated_token.get('aud'))
    first_party_human = (
        '*' in audiences and not validated_token.get('client_id')
        and not validated_token.get('is_service') and not validated_token.get('is_agent')
        and str(validated_token.get('user_id', '')).isdecimal()
        and int(validated_token['user_id']) > 0
    )
    if service_name not in audiences and not first_party_human:
        logger.warning(
            f"RS256 JWT rejected: aud={audiences!r} does not include required "
            f"service={service_name!r}"
        )
        raise InvalidToken(
            f"RS256 token audience {audiences} does not include '{service_name}'"
        )


def validate_rs256_jwks_token(raw_token, *, service_name: str = '',
                              expected_issuer: str = ''):
    """
    Validate an RS256 JWT via shizuha-id JWKS and return a dict-like token.

    Security properties: alg-pins RS256, requires kid, selects only RSA JWKS
    keys by kid, refetches once for rotation, requires access-token expiry/issued-at and the exact configured issuer,
    and enforces per-service audience binding for RS256 tokens.
    """
    try:
        header = jwt.get_unverified_header(raw_token)
    except jwt.PyJWTError:
        return None

    if header.get('alg') != 'RS256':
        return None
    kid = header.get('kid')
    if not kid:
        raise InvalidToken('RS256 token missing kid')

    if not service_name:
        raise InvalidToken('RS256 consuming service is required')
    if not expected_issuer:
        raise InvalidToken('RS256 expected issuer is required')

    jwks_url = _jwks_url_from_context(expected_issuer)
    try:
        keys = _fetch_jwks_keys(jwks_url)
        key = keys.get(kid)
        if key is None:
            keys = _fetch_jwks_keys(jwks_url, force_refresh=True)
            key = keys.get(kid)
    except Exception as exc:
        raise InvalidToken(f'JWKS fetch from {jwks_url} failed: {exc}')

    if key is None:
        raise InvalidToken(f'No RS256 JWKS key available for kid={kid!r}')

    options = {'verify_aud': False, 'verify_exp': True,
               'require': ['exp', 'iat', 'iss', 'aud', 'token_type']}
    kwargs = {'key': key, 'algorithms': ['RS256'], 'options': options}
    if expected_issuer:
        kwargs['issuer'] = expected_issuer
    try:
        payload = jwt.decode(raw_token, **kwargs)
    except (jwt.PyJWTError, TypeError, ValueError) as exc:
        raise InvalidToken(f'RS256 validation failed: {exc}')

    if payload.get('token_type') != 'access':
        raise InvalidToken('Not an access token')
    token = RS256Token(payload)
    enforce_rs256_token_binding(token, service_name)
    return token


def _extract_org_memberships(validated_token, user_id=None, user_email=None) -> dict:
    """
    Read `organization_memberships` from a validated JWT.

    Behavior:
      - Claim present (even as `{}`): trust the JWT — it was stamped at
        token-mint time from authoritative data and tokens are short-lived.
      - Claim absent: fall back to a live fetch from shizuha-admin so old
        tokens upgrade themselves rather than silently degrade to "no orgs".

    `{}` is a legitimate "user is in zero orgs" state (personal workspace
    only, pending invite) and must NOT trigger a live fetch — that would
    hammer admin-service for users with no memberships.
    """
    if 'organization_memberships' in validated_token:
        return normalize_memberships(validated_token['organization_memberships'])
    return _fetch_memberships_live(user_id, user_email)


def _fetch_memberships_live(user_id, user_email=None) -> dict:
    """
    Fallback for tokens that predate the organization_memberships claim.
    Failures are non-fatal — never raises, never blocks auth.
    """
    if user_id is None:
        return {}
    import requests as _req
    base = os.environ.get('SHIZUHA_ADMIN_API_URL') or 'http://shizuha-admin:8003/api'
    url = f"{base}/internal/users/{user_id}/memberships/"
    params = {}
    if user_email:
        params['email'] = user_email
    try:
        resp = _req.get(url, params=params, timeout=3)
        if resp.status_code == 200:
            data = resp.json()
            return normalize_memberships(data.get('memberships') or {})
    except _req.RequestException as exc:
        logger.warning(
            f"Live memberships fallback failed for user {user_id}: {exc}. "
            f"Falling back to empty grants."
        )
    return {}


def advisory_claim_check(validated_token, service_name: str = '',
                         expected_issuer: str = '') -> dict:
    """
    Log mismatched `aud`/`iss` claims without rejecting the token (Phase 2).

    - `aud` claim present, not '*', not containing `service_name` → warn
    - `aud` absent → debug (legacy tokens predate the claim)
    - `iss` present, mismatches `expected_issuer` → warn
    - `iss` absent → debug

    Returns a dict with `aud_status` / `iss_status` for callers that want to
    feed the result into enforcement.
    """
    result = {'aud_status': 'ok', 'iss_status': 'ok'}

    aud = validated_token.get('aud')
    if aud is None:
        result['aud_status'] = 'missing'
        logger.debug(f"JWT missing aud claim (legacy) service={service_name!r}")
    elif aud == '*' or aud == ['*']:
        result['aud_status'] = 'wildcard'
    else:
        aud_list = aud if isinstance(aud, list) else [aud]
        if service_name and service_name not in aud_list:
            result['aud_status'] = 'mismatch'
            logger.warning(
                f"JWT aud={aud_list!r} does not include service={service_name!r}. "
                f"Phase 2 advisory — token accepted."
            )

    iss = validated_token.get('iss')
    if iss is None:
        result['iss_status'] = 'missing'
        logger.debug(f"JWT missing iss claim (legacy)")
    elif expected_issuer and iss != expected_issuer:
        result['iss_status'] = 'mismatch'
        logger.warning(
            f"JWT iss={iss!r} does not match expected={expected_issuer!r}. "
            f"Phase 2 advisory — token accepted."
        )

    return result


def enforce_audience_claim(validated_token, service_name: str,
                           enforce: bool = False) -> None:
    """
    Phase 4 enforcement: raise InvalidToken when aud mismatches service.

    Accepts: missing aud (legacy), '*' wildcard, or any list containing
    `service_name`. Rejects otherwise when `enforce=True`.
    """
    if not enforce or not service_name:
        return
    aud = validated_token.get('aud')
    if aud is None or aud == '*' or aud == ['*']:
        return
    aud_list = aud if isinstance(aud, list) else [aud]
    if service_name not in aud_list:
        logger.warning(
            f"JWT rejected: aud={aud_list!r} does not include required "
            f"service={service_name!r}"
        )
        raise InvalidToken(
            f"Token audience {aud_list} does not include '{service_name}'"
        )


def _service_context_from_settings():
    """Read expected service-name + issuer from Django settings / env."""
    try:
        from django.conf import settings
        service_name = getattr(settings, 'SHIZUHA_SERVICE_NAME', '') \
            or os.environ.get('SHIZUHA_SERVICE_NAME', '')
        expected_issuer = getattr(settings, 'SHIZUHA_EXPECTED_ISSUER', '') \
            or os.environ.get('SHIZUHA_EXPECTED_ISSUER', '')
        enforce = bool(getattr(settings, 'SHIZUHA_AUD_ENFORCE', False))
    except Exception:
        service_name = os.environ.get('SHIZUHA_SERVICE_NAME', '')
        expected_issuer = os.environ.get('SHIZUHA_EXPECTED_ISSUER', '')
        enforce = os.environ.get('SHIZUHA_AUD_ENFORCE', '').lower() in ('1', 'true', 'yes')
    return service_name, expected_issuer, enforce


def _extract_claims(validated_token):
    """Extract common claims from a validated JWT token."""
    user_id = validated_token.get('user_id')
    email = validated_token.get('email')
    username = validated_token.get('username')
    first_name = validated_token.get('first_name')
    last_name = validated_token.get('last_name')
    is_staff = validated_token.get('is_staff', False)
    is_superuser = validated_token.get('is_superuser', False)
    enabled_services = validated_token.get('enabled_services')
    is_agent = validated_token.get('is_agent', False)
    organization_role = validated_token.get('organization_role')
    organization_memberships = _extract_org_memberships(
        validated_token, user_id=user_id, user_email=email,
    )

    # Staff/superuser override: None = unrestricted access to all services
    if is_staff or is_superuser:
        enabled_services = None

    return {
        'user_id': user_id,
        'email': email,
        'username': username,
        'first_name': first_name,
        'last_name': last_name,
        'is_staff': is_staff,
        'is_superuser': is_superuser,
        'enabled_services': enabled_services,
        'is_agent': is_agent,
        'organization_role': organization_role,
        'organization_memberships': organization_memberships,
    }


def _make_federated_user(claims):
    """Create a FederatedUser from extracted token claims."""
    return FederatedUser(
        user_id=claims['user_id'],
        email=claims['email'],
        username=claims['username'],
        first_name=claims['first_name'],
        last_name=claims['last_name'],
        is_staff=claims['is_staff'],
        is_superuser=claims['is_superuser'],
        enabled_services=claims['enabled_services'],
        organization_role=claims.get('organization_role'),
        organization_memberships=claims.get('organization_memberships'),
    )


def _try_local_user(user_id, claims):
    """
    Try to find a local Django user by ID. Returns the user if found,
    otherwise returns a FederatedUser.

    ``user_id`` is expected to be an int-coercible value (Shizuha ID issues
    integer PKs as string claims for both human users and agents). A
    non-int-coercible ``user_id`` is treated as a malformed token claim — the
    ``int()`` ValueError/TypeError propagates to the JWT layer which surfaces
    it as InvalidToken, rather than being silently papered over with a
    synthesized FederatedUser.

    Grafts org_memberships onto the local user too so downstream code can
    read user.organization_memberships uniformly across federated and local.
    """
    User = get_user_model()
    int_user_id = int(user_id)
    try:
        user = User.objects.get(pk=int_user_id)
        user.organization_memberships = normalize_memberships(
            claims.get('organization_memberships')
        )
        return user
    except User.DoesNotExist:
        logger.debug(f"User {user_id} not found locally, using federated user")
        return _make_federated_user(claims)


def _validate_access_token(raw_token, legacy_validator):
    try:
        header = jwt.get_unverified_header(raw_token)
    except jwt.PyJWTError:
        raise InvalidToken('Invalid token')
    if header.get('alg') == 'RS256':
        service_name, expected_issuer, _ = _service_context_from_settings()
        token = validate_rs256_jwks_token(
            raw_token, service_name=service_name, expected_issuer=expected_issuer,
        )
    else:
        token = legacy_validator(raw_token)
    enforce_token_active(raw_token)
    return token


class ShizuhaJWTAuthentication(JWTAuthentication):
    """
    Custom JWT authentication that works with Shizuha ID tokens.

    If the user doesn't exist locally, creates a FederatedUser object
    from the token claims instead of failing with 401.

    ``user_id`` claims are int-coercible strings issued by Shizuha ID's token
    issuer for both human users and agents. A malformed (non-int-coercible)
    ``user_id`` is rejected as InvalidToken via the underlying int() raise.
    """

    def get_validated_token(self, raw_token):
        """Accept legacy HS256 tokens, then RS256 tokens verified via JWKS."""
        return _validate_access_token(raw_token, super().get_validated_token)

    def get_user(self, validated_token):
        try:
            # Phase 2/4: advisory logs + optional aud enforcement.
            service_name, expected_issuer, enforce = _service_context_from_settings()
            advisory_claim_check(validated_token, service_name, expected_issuer)
            enforce_audience_claim(validated_token, service_name, enforce)

            claims = _extract_claims(validated_token)
            user_id = claims['user_id']

            if user_id is None:
                raise InvalidToken('Token contained no recognizable user identification')

            # Agent tokens always use FederatedUser (no local DB lookup)
            if claims['is_agent']:
                logger.debug(f"Agent token detected for {claims['email']}, using federated user")
                return _make_federated_user(claims)

            return _try_local_user(user_id, claims)

        except KeyError:
            raise InvalidToken('Token contained no recognizable user identification')
        except (ValueError, TypeError):
            raise InvalidToken('Token contained malformed user_id claim')


class ShizuhaIDAuthentication(authentication.BaseAuthentication):
    """
    Alternative authentication that validates tokens via AccessToken directly.

    Useful for:
    - Getting fresh user data from token claims
    - Validating token hasn't been revoked
    - Supporting token refresh flows
    """

    def authenticate(self, request):
        auth_header = request.META.get('HTTP_AUTHORIZATION', '')

        if not auth_header.startswith('Bearer '):
            return None

        token = auth_header.split(' ')[1]

        try:
            service_name, expected_issuer, enforce = _service_context_from_settings()
            validated_token = _validate_access_token(token, AccessToken)

            # Phase 2/4: advisory + enforcement
            advisory_claim_check(validated_token, service_name, expected_issuer)
            enforce_audience_claim(validated_token, service_name, enforce)

            claims = _extract_claims(validated_token)
            user_id = claims['user_id']

            if user_id is None:
                raise exceptions.AuthenticationFailed('Invalid token')

            # Agent tokens always use FederatedUser
            if claims['is_agent']:
                logger.debug(f"Agent token detected for {claims['email']}")
                return (_make_federated_user(claims), validated_token)

            user = _try_local_user(user_id, claims)
            return (user, validated_token)

        except TokenError as e:
            raise exceptions.AuthenticationFailed(f'Invalid token: {str(e)}')
        except (ValueError, TypeError):
            raise exceptions.AuthenticationFailed('Invalid token: malformed user_id claim')

    def authenticate_header(self, request):
        return 'Bearer realm="api"'
