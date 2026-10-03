"""
Reusable MinIO/S3 storage settings for Django services.

Usage in a service's settings.py:

    from shizuha_storage.settings import get_minio_storage_settings

    STORAGES = get_minio_storage_settings(
        bucket_name=os.environ.get('AWS_STORAGE_BUCKET_NAME', 'shizuha-wiki'),
        endpoint=os.environ.get('AWS_S3_ENDPOINT_URL', 'http://minio:9000'),
        access_key=os.environ.get('AWS_ACCESS_KEY_ID', 'minioadmin'),
        secret_key=os.environ.get('AWS_SECRET_ACCESS_KEY', ''),
    )
"""


def get_minio_storage_settings(bucket_name, endpoint='http://minio:9000',
                                access_key='minioadmin', secret_key='',
                                querystring_auth=True, url_protocol='http:',
                                custom_domain=None):
    """
    Return Django STORAGES dict for S3Boto3Storage (MinIO-compatible).

    Args:
        bucket_name: The MinIO bucket name (e.g. 'shizuha-wiki')
        endpoint: MinIO endpoint URL (e.g. 'http://minio:9000')
        access_key: MinIO access key
        secret_key: MinIO secret key
        querystring_auth: Whether to use query string auth for URLs
        url_protocol: Protocol for generated URLs
        custom_domain: Optional custom domain for file URLs
    """
    return {
        "default": {
            "BACKEND": "storages.backends.s3boto3.S3Boto3Storage",
            "OPTIONS": {
                "access_key": access_key,
                "secret_key": secret_key,
                "bucket_name": bucket_name,
                "endpoint_url": endpoint,
                "addressing_style": "path",
                "signature_version": "s3v4",
                "querystring_auth": querystring_auth,
                "url_protocol": url_protocol,
                "custom_domain": custom_domain,
                "file_overwrite": False,
                "default_acl": None,
            },
        },
        "staticfiles": {
            "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
        },
    }
