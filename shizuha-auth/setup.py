from setuptools import setup, find_packages

setup(
    name='shizuha-auth',
    version='1.0.0',
    description='Shared authentication utilities for Shizuha platform',
    author='Shizuha Team',
    author_email='dev@shizuha.com',
    packages=find_packages(),
    python_requires='>=3.10',
    install_requires=[
        'Django>=4.2',
        'djangorestframework>=3.14',
        'djangorestframework-simplejwt>=5.0',
        'PyJWT>=2.8',
        'cryptography>=41',
    ],
    classifiers=[
        'Development Status :: 4 - Beta',
        'Framework :: Django :: 4.2',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
    ],
)
