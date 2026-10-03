"""
Shared permission classes for all Shizuha services.
"""

from rest_framework import permissions


class ServiceAccessPermission(permissions.BasePermission):
    """
    Check that the user has access to this service via their enabled_services list.

    Usage — set SERVICE_SLUG on the subclass or the view:

        class WikiServiceAccess(ServiceAccessPermission):
            SERVICE_SLUG = 'wiki'

    Or on the view:

        class MyView(APIView):
            service_slug = 'wiki'
            permission_classes = [ServiceAccessPermission]
    """
    SERVICE_SLUG = None
    message = 'You do not have access to this service.'

    def has_permission(self, request, view):
        user = request.user
        if not hasattr(user, 'enabled_services'):
            return True  # Not a federated user (e.g., Django admin)
        if user.enabled_services is None:
            return True  # Unrestricted (staff/superuser)

        slug = self.SERVICE_SLUG or getattr(view, 'service_slug', None)
        if slug is None:
            return True  # No slug configured — allow through
        return slug in user.enabled_services


class IsOrgAdmin(permissions.BasePermission):
    """
    Check if user is an org admin (superuser or org-level admin/owner role).

    Checks multiple sources for org role:
    1. user.is_superuser (platform superuser — full access)
    2. request.organization_role (set by OrganizationContextMiddleware)
    3. user.organization_role (set from JWT claims by ShizuhaJWTAuthentication)
    """
    message = 'Organization admin access is required.'

    def has_permission(self, request, view):
        if getattr(request.user, 'is_superuser', False):
            return True
        # Check middleware-set role (from X-Organization-ID header validation)
        role = getattr(request, 'organization_role', None)
        if role in ('owner', 'admin'):
            return True
        # Check JWT-derived role (from organization_role claim)
        jwt_role = getattr(request.user, 'organization_role', None)
        return jwt_role in ('owner', 'admin')


def is_org_admin_or_owner(user) -> bool:
    """
    Check if a user has org admin/owner privileges.
    Works with both Django User and FederatedUser objects.

    Use this in permission classes and views to grant org admins
    implicit elevated access to org-scoped resources — similar to
    AWS account admin having access to all services.
    """
    if getattr(user, 'is_superuser', False):
        return True
    role = getattr(user, 'organization_role', None)
    return role in ('owner', 'admin')
