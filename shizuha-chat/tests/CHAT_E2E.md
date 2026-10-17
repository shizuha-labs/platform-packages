# Disposable chat E2E target

`e2e_chat_sync.py` exercises messaging, session cleanup and chat clearing. Run it
only against an isolated, disposable nonproduction installation with dedicated
fixture users and an agent. It changes that fixture's chat history. It does not
create accounts, mint tokens, or provide any default identity or signing key.

Provide all six target/authority variables and acknowledge the disposable scope:

- `CHAT_TEST_NONPRODUCTION=1`
- `WS_URL`: full WebSocket endpoint
- `API_URL`: HTTP API base URL with the same host, port and transport security
- `CHAT_TEST_AGENT_ID`: provisioned disposable agent identity
- `CHAT_TEST_TOKEN_A` and `CHAT_TEST_TOKEN_B`: distinct bearer tokens obtained from
  that installation's normal authentication flow for two dedicated fixture users

Use TLS for remote fixture installations; plaintext endpoints are accepted only
on loopback. Supply tokens through a private environment, not command-line
arguments, tracked files, or logs. The script makes no fallback to a signing key,
operator account, production host or baked-in tenant. No token is generated.

First run `python tests/e2e_chat_sync.py --validate-config` to validate inputs
without importing network clients or making a request. Then run
`python tests/e2e_chat_sync.py` only after checking the fixture scope. Missing,
malformed or cross-origin configuration fails before any third-party import.

Run the preflight regressions without service credentials or network access:
`python -m unittest discover -s tests -p test_e2e_fixture_config.py`.
