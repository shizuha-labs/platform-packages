"""
Test helpers for services that use shizuha-auth.

Provides factory functions for creating FederatedUser instances and
signed JWT tokens without needing a running Shizuha ID service.
"""

import uuid
from datetime import timedelta

from .user import FederatedUser


def make_federated_user(user_id=1, email='test@example.com', **kwargs):
    """
    Create a FederatedUser for testing.

    Usage:
        user = make_federated_user(user_id=42, email='admin@test.com', is_superuser=True)
    """
    defaults = {
        'username': kwargs.pop('username', email.split('@')[0]),
        'first_name': kwargs.pop('first_name', 'Test'),
        'last_name': kwargs.pop('last_name', 'User'),
        'is_staff': kwargs.pop('is_staff', False),
        'is_superuser': kwargs.pop('is_superuser', False),
        'enabled_services': kwargs.pop('enabled_services', None),
        'organization_id': kwargs.pop('organization_id', None),
    }
    defaults.update(kwargs)
    return FederatedUser(user_id=user_id, email=email, **defaults)


def make_jwt_token(user_id=1, email='test@example.com', **kwargs):
    """
    Create a signed JWT access token for API testing.

    Usage:
        token = make_jwt_token(user_id=42, email='admin@test.com', is_superuser=True)
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {token}')
    """
    from rest_framework_simplejwt.tokens import AccessToken
    from django.conf import settings  # noqa: F401 — ensures settings loaded

    token = AccessToken()
    token['user_id'] = user_id
    token['email'] = email
    token['username'] = kwargs.get('username', email.split('@')[0])
    token['first_name'] = kwargs.get('first_name', 'Test')
    token['last_name'] = kwargs.get('last_name', 'User')
    token['is_staff'] = kwargs.get('is_staff', False)
    token['is_superuser'] = kwargs.get('is_superuser', False)
    token['enabled_services'] = kwargs.get('enabled_services', None)
    token['is_agent'] = kwargs.get('is_agent', False)
    token['jti'] = str(uuid.uuid4())
    token['token_type'] = 'access'

    if 'lifetime' in kwargs:
        token.set_exp(from_time=token.current_time, lifetime=kwargs['lifetime'])

    return str(token)
