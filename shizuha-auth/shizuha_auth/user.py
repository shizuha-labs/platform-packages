"""
Federated User — lightweight user object for cross-service JWT authentication.

This is the single source of truth for the FederatedUser class used by all
Shizuha services. It is a superset of all fields found across services.
"""

import logging

logger = logging.getLogger(__name__)


def normalize_memberships(raw) -> dict:
    """
    Coerce the JWT's organization_memberships claim into {int: str}.

    JSON serialization forces object keys to strings, so the claim arrives
    as {"1": "admin", "7": "owner"}. Coerce back to int because almost all
    downstream filters compare against integer FKs (project.org_id etc.) —
    this removes a class of "1 != '1'" mismatches.
    """
    if not raw or not isinstance(raw, dict):
        return {}
    out = {}
    for k, v in raw.items():
        try:
            out[int(k)] = str(v)
        except (TypeError, ValueError):
            continue
    return out


class FederatedUser:
    """
    A lightweight user object for federated authentication.
    Used when the user exists in Shizuha ID but not in the local database.

    This class is intentionally NOT a Django Model — it lives only in memory
    and is created fresh from JWT claims on every request.
    """

    def __init__(
        self,
        user_id,
        email=None,
        username=None,
        first_name=None,
        last_name=None,
        date_joined=None,
        is_staff=False,
        is_superuser=False,
        enabled_services=None,
        organization_id=None,
        organization_role=None,
        organization_memberships=None,
    ):
        from django.utils import timezone

        # JWT `user_id` claim arrives as a string; DB pks across services are ints.
        # Coerce here so `federated_user.id == user.id` works against ORM rows
        # (matches shizuha-connect's existing pattern).
        self.id = int(user_id) if user_id is not None else user_id
        self.pk = self.id
        self._original_email = email
        self.email = email or f"user_{user_id}@shizuha.id"
        self.username = username or f"user_{user_id}"
        self.first_name = first_name or ""
        self.last_name = last_name or ""
        self.date_joined = date_joined or timezone.now()
        self.is_authenticated = True
        self.is_active = True
        self.is_anonymous = False
        self.is_staff = is_staff
        self.is_superuser = is_superuser
        # None = unrestricted (staff/superuser), [] = no services, [...] = specific services
        self.enabled_services = enabled_services
        self.organization_id = organization_id
        self.organization_role = organization_role
        # Tenant-scoped RBAC claim: {org_id_int: role_str}.
        # Empty dict = user belongs to no orgs (personal workspace only,
        # or token predates the claim and admin-service was unreachable).
        self.organization_memberships = normalize_memberships(organization_memberships)

        if not email:
            logger.warning(
                f"FederatedUser {user_id} created without email claim, "
                f"using fallback: {self.email}"
            )

    @property
    def admin_org_ids(self):
        """Org IDs where this user has owner or admin role."""
        return [oid for oid, role in self.organization_memberships.items()
                if role in ('owner', 'admin')]

    @property
    def member_org_ids(self):
        """Org IDs where this user has any active membership (used for read-aggregation)."""
        return list(self.organization_memberships.keys())

    def role_in_org(self, org_id):
        """Lookup the user's role in a specific org. Returns None if not a member."""
        if org_id is None:
            return None
        try:
            return self.organization_memberships.get(int(org_id))
        except (TypeError, ValueError):
            return None

    def is_member_of(self, org_id) -> bool:
        """True if the user belongs to the given org (any role)."""
        return self.role_in_org(org_id) is not None

    @property
    def has_real_email(self):
        """Returns True if the email came from JWT claims, False if using fallback."""
        return self._original_email is not None

    def get_full_name(self):
        full = f"{self.first_name} {self.last_name}".strip()
        return full or self.username

    def get_short_name(self):
        return self.first_name or self.username

    def __str__(self):
        return f"FederatedUser({self.id})"

    def save(self, *args, **kwargs):
        pass  # No-op for federated users
