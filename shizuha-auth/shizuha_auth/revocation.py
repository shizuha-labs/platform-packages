"""Authoritative session/client liveness for locally verified access tokens."""
import json
import os
import urllib.error
import urllib.request

from django.conf import settings
from rest_framework import exceptions


class SessionAuthorityUnavailable(exceptions.APIException):
    status_code = 503
    default_detail = 'Session authority unavailable'
    default_code = 'session_authority_unavailable'


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, message, headers, new_url):
        return None


def enforce_token_active(raw_token):
    """A valid signature does not prove a session survived logout.

    Consult ID for every authentication, including service/internal tokens
    without a human sid. Do not cache an allow or follow a redirect carrying
    credentials. The endpoint returns the same active contract for each type.
    """
    if isinstance(raw_token, bytes):
        raw_token = raw_token.decode('utf-8')
    explicit = (getattr(settings, 'SHIZUHA_REVOCATION_STATUS_URL', '')
                or os.environ.get('SHIZUHA_REVOCATION_STATUS_URL', ''))
    issuer = (getattr(settings, 'SHIZUHA_EXPECTED_ISSUER', '')
              or os.environ.get('SHIZUHA_EXPECTED_ISSUER') or 'http://shizuha-id:8001')
    url = explicit or issuer.rstrip('/') + '/api/oauth/revocation-status'
    request = urllib.request.Request(url, method='POST',
        data=json.dumps({'token': raw_token}).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'Accept': 'application/json'})
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), _NoRedirect())
    try:
        with opener.open(request, timeout=2) as response:
            if response.status != 200:
                raise ValueError('Invalid authority status')
            body = response.read(8193)
        if len(body) > 8192:
            raise ValueError('Invalid authority response size')
        result = json.loads(body)
        if not isinstance(result, dict) or type(result.get('active')) is not bool:
            raise ValueError('Invalid authority response')
    except (urllib.error.URLError, OSError, ValueError):
        raise SessionAuthorityUnavailable() from None
    if result['active'] is not True:
        raise exceptions.AuthenticationFailed('Token revoked')
