"""Explicit authority and target configuration for disposable chat E2E fixtures."""
from dataclasses import dataclass
import re
from urllib.parse import urlsplit


class FixtureConfigurationError(ValueError):
    pass


@dataclass(frozen=True)
class FixtureConfig:
    ws_url: str
    api_url: str
    agent_id: str
    token_a: str
    token_b: str


def load_fixture_config(environment):
    """Validate without imports of network clients, token signing or I/O."""
    def required(name):
        value=environment.get(name)
        if not isinstance(value,str) or not value or value!=value.strip():
            raise FixtureConfigurationError(f'{name} must be explicitly configured')
        return value

    if environment.get('CHAT_TEST_NONPRODUCTION') != '1':
        raise FixtureConfigurationError('CHAT_TEST_NONPRODUCTION=1 is required for disposable fixtures')
    ws=required('WS_URL')
    api=required('API_URL')
    def endpoint(value,name,schemes):
        try:
            parsed=urlsplit(value)
            port=parsed.port
        except ValueError:
            raise FixtureConfigurationError(f'{name} is not a valid endpoint') from None
        if (parsed.scheme not in schemes or not parsed.hostname or parsed.username is not None
                or parsed.password is not None or parsed.query or parsed.fragment
                or any(ord(c)<=32 or ord(c)==127 for c in value)
                or '\\' in value or (port is not None and port < 1)):
            raise FixtureConfigurationError(f'{name} is not a valid endpoint')
        return parsed.hostname.lower(), port or (443 if parsed.scheme in ('https','wss') else 80), parsed.scheme
    wh,wp,scheme=endpoint(ws,'WS_URL',('ws','wss'))
    ah,ap,api_scheme=endpoint(api,'API_URL',('http','https'))
    if (wh,wp)!=(ah,ap) or {'ws':'http','wss':'https'}[scheme]!=api_scheme:
        raise FixtureConfigurationError('WS_URL and API_URL must share the same transport authority')
    if scheme=='ws' and wh not in ('localhost','127.0.0.1','::1'):
        raise FixtureConfigurationError('Remote fixture endpoints require TLS')
    agent=required('CHAT_TEST_AGENT_ID')
    if re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}',agent) is None:
        raise FixtureConfigurationError('CHAT_TEST_AGENT_ID is not a valid fixture identity')
    tokens=[required(name) for name in ('CHAT_TEST_TOKEN_A','CHAT_TEST_TOKEN_B')]
    if any(len(token)>16384 or re.fullmatch(r'[A-Za-z0-9._~+/=-]+',token) is None for token in tokens):
        raise FixtureConfigurationError('Fixture bearer tokens must be bounded opaque token strings')
    if tokens[0]==tokens[1]:
        raise FixtureConfigurationError('Two distinct fixture bearer tokens are required')
    return FixtureConfig(ws.rstrip('/'),api.rstrip('/'),agent,*tokens)
