"""
Organization context middleware for Shizuha services.

Extracts the X-Organization-ID header and makes it available as
request.organization_id after DRF authentication has run.
"""

import logging
import os

logger = logging.getLogger(__name__)


class OrganizationContextMiddleware:
    """
    Extract organization from X-Organization-ID header.

    Note: This middleware only extracts the org ID from the header. The actual
    validation happens via the permission classes after DRF authentication.
    Django middleware runs before DRF authentication, so we can't validate
    membership here.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        org_id = request.META.get('HTTP_X_ORGANIZATION_ID')
        request._pending_organization_id = int(org_id) if org_id else None
        return self.get_response(request)


def check_organization_membership(user_id, org_id, email=None):
    """
    Check if user is a member of the organization via shizuha-admin internal API.

    Returns dict with 'is_member' and 'role' if member, None otherwise.
    """
    skip_validation = os.environ.get('SKIP_ORG_VALIDATION', '').lower() == 'true'
    if skip_validation:
        return {'is_member': True, 'role': 'admin'}

    import requests as http_requests
    admin_url = os.environ.get('SHIZUHA_ADMIN_API_URL', 'http://shizuha-admin:8003/api')
    try:
        params = {'email': email} if email else {}
        response = http_requests.get(
            f'{admin_url}/internal/organizations/{org_id}/members/{user_id}/',
            params=params,
            timeout=5
        )
        if response.status_code == 200:
            return response.json()
        logger.debug(f"Membership check failed: {response.status_code}")
    except Exception as e:
        logger.warning(f"Failed to check organization membership: {e}")
    return None


def set_organization_context(request):
    """
    Set organization context on request after DRF authentication.
    Called from permission classes.
    """
    if hasattr(request, 'organization_id'):
        return  # Already set

    org_id = getattr(request, '_pending_organization_id', None)
    if org_id is None:
        request.organization_id = None
        request.organization_role = None
        return

    if not request.user or not request.user.is_authenticated:
        request.organization_id = None
        request.organization_role = None
        return

    membership = check_organization_membership(
        request.user.id,
        org_id,
        getattr(request.user, 'email', None)
    )

    if membership and membership.get('is_member'):
        request.organization_id = org_id
        request.organization_role = membership.get('role')
        if hasattr(request.user, 'organization_id'):
            request.user.organization_id = org_id
        if hasattr(request.user, 'organization_role'):
            request.user.organization_role = membership.get('role')
    else:
        request.organization_id = None
        request.organization_role = None
