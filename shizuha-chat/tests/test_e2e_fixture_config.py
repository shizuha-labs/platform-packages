"""Exercise the actual script preflight before any third-party import/network."""
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT=Path(__file__).with_name('e2e_chat_sync.py')


class ChatFixtureAuthorityTests(unittest.TestCase):
    def configured(self):
        return {'CHAT_TEST_NONPRODUCTION':'1','WS_URL':'ws://127.0.0.1:18443/ws/chat',
                'API_URL':'http://127.0.0.1:18443/api','CHAT_TEST_AGENT_ID':'fixture-agent',
                'CHAT_TEST_TOKEN_A':'fixture-user-a','CHAT_TEST_TOKEN_B':'fixture-user-b'}

    def run_script(self,overrides=None,removed=(),validate=True):
        env={key:value for key,value in os.environ.items()
             if key not in self.configured() and key!='JWT_SECRET_KEY'}
        env.update(self.configured())
        if overrides:env.update(overrides)
        for name in removed:env.pop(name,None)
        with tempfile.TemporaryDirectory() as d:
            root=Path(d)
            # Any network-library import is an instrument failure, not a request.
            for name in ('websockets','aiohttp','jwt'):
                (root/(name+'.py')).write_text("raise RuntimeError('UNEXPECTED_THIRD_PARTY_IMPORT')\n")
            env['PYTHONPATH']=str(root)
            result=subprocess.run([sys.executable,str(SCRIPT),*(['--validate-config'] if validate else [])],
                                  env=env,text=True,capture_output=True,timeout=5)
        return result

    def test_missing_authority_refuses_before_any_third_party_import(self):
        for name in self.configured():
            with self.subTest(name=name):
                result=self.run_script(removed=(name,))
                self.assertEqual(result.returncode,2)
                self.assertNotIn('UNEXPECTED_THIRD_PARTY_IMPORT',result.stderr)
                self.assertNotIn('fixture-user-',result.stderr)

    def test_malformed_or_cross_origin_inputs_are_terminal_preflight_failures(self):
        cases=[{'CHAT_TEST_NONPRODUCTION':'0'},{'CHAT_TEST_TOKEN_A':''},
               {'CHAT_TEST_TOKEN_A':'Bearer fixture-user-a'},{'CHAT_TEST_TOKEN_B':'fixture-user-a'},
               {'CHAT_TEST_TOKEN_A':'bad\nheader'},{'CHAT_TEST_AGENT_ID':'../foreign'},
               {'WS_URL':'ws://remote.example.test/ws','API_URL':'http://remote.example.test/api'},
               {'API_URL':'http://other.example.test:18443/api'},
               {'API_URL':'http://user:password@127.0.0.1:18443/api'},
               {'WS_URL':'ws://127.0.0.1:18443/ws?authority=foreign'},
               {'API_URL':'http://127.0.0.1:99999/api'},{'API_URL':'http://127.0.0.1:0/api'}]
        for case in cases:
            with self.subTest(fields=tuple(case)):
                result=self.run_script(case)
                self.assertEqual(result.returncode,2)
                self.assertNotIn('UNEXPECTED_THIRD_PARTY_IMPORT',result.stderr)
                self.assertNotIn('fixture-user-',result.stderr)

    def test_valid_config_can_be_checked_without_network_or_token_signing(self):
        for config in ({},{'WS_URL':'wss://fixtures.example.test/ws','API_URL':'https://fixtures.example.test/api'}):
            result=self.run_script(config)
            self.assertEqual(result.returncode,0,result.stderr)
            self.assertIn('Fixture configuration valid',result.stdout)
            self.assertNotIn('fixture-user-',result.stdout+result.stderr)

    def test_instrument_refuses_real_run_at_first_third_party_import(self):
        result=self.run_script(validate=False)
        self.assertNotEqual(result.returncode,0)
        self.assertIn('UNEXPECTED_THIRD_PARTY_IMPORT',result.stderr)


if __name__=='__main__':
    unittest.main()
