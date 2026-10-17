"""A configured storage backend must have an explicit credential pair."""
import os
import secrets
import unittest
from unittest.mock import patch
from shizuha_storage.settings import get_minio_storage_settings


class ExplicitStorageCredentialTests(unittest.TestCase):
    def test_omitted_pair_is_not_invented_or_loaded_from_ambient_environment(self):
        with patch.dict(os.environ, {'AWS_ACCESS_KEY_ID':secrets.token_urlsafe(18),'AWS_SECRET_ACCESS_KEY':secrets.token_urlsafe(32)}):
            with self.assertRaisesRegex(ValueError,'access_key must be configured'):
                get_minio_storage_settings('fixture')

    def test_each_missing_blank_or_wrong_type_is_rejected_before_returning_backend(self):
        valid={'access_key':secrets.token_urlsafe(18),'secret_key':secrets.token_urlsafe(32)}
        for key in valid:
            for value in (None,'',' \t\n ',False,0,[],{}):
                with self.subTest(field=key,kind=type(value).__name__):
                    with self.assertRaisesRegex(ValueError,key+' must be configured'):
                        get_minio_storage_settings('fixture',**{**valid,key:value})

    def test_configured_credential_bytes_and_other_backend_options_unchanged(self):
        key='  '+secrets.token_urlsafe(18)+'  ';secret='  '+secrets.token_urlsafe(32)+'  '
        with patch.dict(os.environ, {},clear=True):
            result=get_minio_storage_settings('fixture',endpoint='http://storage.example:9000',access_key=key,secret_key=secret,querystring_auth=True)
        options=result['default']['OPTIONS']
        self.assertEqual(options['access_key'],key);self.assertEqual(options['secret_key'],secret)
        self.assertEqual(options['bucket_name'],'fixture');self.assertEqual(options['endpoint_url'],'http://storage.example:9000')
        self.assertTrue(options['querystring_auth']);self.assertEqual(result['default']['BACKEND'],'storages.backends.s3boto3.S3Boto3Storage')


if __name__=='__main__':unittest.main()
