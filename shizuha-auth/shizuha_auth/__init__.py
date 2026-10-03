"""
shizuha-auth — Shared authentication package for the Shizuha platform.

All Shizuha microservices should import auth primitives from this package
rather than maintaining their own copies.
"""

from .user import FederatedUser, normalize_memberships
from .authentication import (
    ShizuhaJWTAuthentication, ShizuhaIDAuthentication,
    advisory_claim_check, clear_jwks_cache, enforce_audience_claim,
    enforce_rs256_token_binding, validate_rs256_jwks_token,
)
from .permissions import ServiceAccessPermission, IsOrgAdmin, is_org_admin_or_owner
from .middleware import (
    OrganizationContextMiddleware,
    check_organization_membership,
    set_organization_context,
)
from .test_utils import make_federated_user, make_jwt_token

__all__ = [
    'FederatedUser',
    'normalize_memberships',
    'ShizuhaJWTAuthentication',
    'ShizuhaIDAuthentication',
    'advisory_claim_check',
    'enforce_audience_claim',
    'clear_jwks_cache',
    'enforce_rs256_token_binding',
    'validate_rs256_jwks_token',
    'ServiceAccessPermission',
    'IsOrgAdmin',
    'is_org_admin_or_owner',
    'OrganizationContextMiddleware',
    'check_organization_membership',
    'set_organization_context',
    'make_federated_user',
    'make_jwt_token',
]
