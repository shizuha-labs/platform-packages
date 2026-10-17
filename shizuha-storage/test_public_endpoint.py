import os
import secrets
import unittest
from unittest.mock import patch
from urllib.parse import parse_qs, urlsplit

from django.conf import settings
from django.test import override_settings
if not settings.configured:
    settings.configure()
from shizuha_storage.backends import PublicEndpointS3Storage
from shizuha_storage.settings import get_minio_storage_settings


class PublicEndpointTests(unittest.TestCase):
    def options(self):
        return dict(access_key=secrets.token_hex(10), secret_key=secrets.token_hex(20),
                    bucket_name='test-attachments', endpoint_url='http://storage.internal:8333',
                    addressing_style='path', signature_version='s3v4', region_name='us-east-1')

    def test_public_url_signs_external_host_without_changing_internal_client(self):
        storage = PublicEndpointS3Storage('https://files.example.org', **self.options())
        internal = storage.connection.meta.client
        self.assertEqual(internal.meta.endpoint_url, 'http://storage.internal:8333')
        url = storage.url('folder/a b.txt', parameters={'ResponseContentType': 'text/plain'}, expire=73)
        parsed = urlsplit(url); query = parse_qs(parsed.query)
        self.assertEqual((parsed.scheme, parsed.netloc, parsed.path),
                         ('https', 'files.example.org', '/test-attachments/folder/a%20b.txt'))
        self.assertEqual(query['X-Amz-Expires'], ['73'])
        self.assertEqual(query['response-content-type'], ['text/plain'])
        self.assertIn('X-Amz-Signature', query)
        self.assertIs(storage.connection.meta.client, internal)
        self.assertEqual(internal.meta.endpoint_url, 'http://storage.internal:8333')

    def test_public_endpoint_is_covered_by_signature(self):
        options = self.options()
        a = PublicEndpointS3Storage('https://a.example.org', **options)
        b = PublicEndpointS3Storage('https://b.example.org', **options)
        # Fix signer time, so the endpoint is the only changed signing input.
        import datetime
        with patch('botocore.auth.get_current_datetime', return_value=datetime.datetime(2026, 1, 1)):
            first, second = a.url('same-key'), b.url('same-key')
        self.assertNotEqual(parse_qs(urlsplit(first).query)['X-Amz-Signature'],
                            parse_qs(urlsplit(second).query)['X-Amz-Signature'])

    def test_rejects_ambiguous_or_unsigned_public_endpoint(self):
        for endpoint in ['ftp://files.example.org', 'https://user:pass@example.org',
                         'https://files.example.org/path', 'https://files.example.org?q=1']:
            with self.assertRaises(ValueError):
                PublicEndpointS3Storage(endpoint, **self.options())
        for option in [{'querystring_auth': False}, {'custom_domain': 'files.example.org'}]:
            with self.assertRaises(ValueError):
                PublicEndpointS3Storage('https://files.example.org', **self.options(), **option)

    def test_factory_keeps_existing_backend_until_public_endpoint_is_explicit(self):
        credentials = {'access_key': secrets.token_hex(10), 'secret_key': secrets.token_hex(20)}
        with patch.dict(os.environ, {}, clear=True):
            ordinary = get_minio_storage_settings('attachments', **credentials)
            self.assertEqual(ordinary['default']['BACKEND'], 'storages.backends.s3boto3.S3Boto3Storage')
        with patch.dict(os.environ, {'AWS_S3_PUBLIC_ENDPOINT_URL': 'https://files.example.org'}):
            external = get_minio_storage_settings('attachments', endpoint='http://internal:8333', **credentials)
        self.assertEqual(external['default']['BACKEND'], 'shizuha_storage.backends.PublicEndpointS3Storage')
        self.assertEqual(external['default']['OPTIONS']['endpoint_url'], 'http://internal:8333')
        self.assertEqual(external['default']['OPTIONS']['public_endpoint'], 'https://files.example.org')

    def test_rejects_unsigned_or_custom_domain_defaults_from_django_settings(self):
        for defaults in [{'AWS_QUERYSTRING_AUTH': False},
                         {'AWS_S3_CUSTOM_DOMAIN': 'files.example.org'}]:
            with override_settings(**defaults):
                with self.assertRaises(ValueError):
                    PublicEndpointS3Storage('https://files.example.org', **self.options())


if __name__ == '__main__':
    unittest.main()
