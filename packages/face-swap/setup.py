"""
Setup script for face-swap package
"""
from setuptools import setup, find_packages
from pathlib import Path

# Read requirements
requirements = Path('requirements.txt').read_text().splitlines()
requirements = [r.strip() for r in requirements if r.strip() and not r.startswith('#')]

# Read README
readme = Path('README.md').read_text() if Path('README.md').exists() else ''

setup(
    name='face-swap-realtime',
    version='1.0.0',
    description='Real-time face swapping with diffusion models',
    long_description=readme,
    long_description_content_type='text/markdown',
    author='Face Swap Team',
    packages=find_packages(where='src'),
    package_dir={'': 'src'},
    install_requires=requirements,
    extras_require={
        'dev': [
            'pytest>=7.0.0',
            'black>=23.0.0',
            'isort>=5.12.0',
            'mypy>=1.0.0',
            'flake8>=6.0.0',
        ],
        'gpu': [
            'onnxruntime-gpu>=1.16.0',
        ],
        'training': [
            'wandb>=0.16.0',
            'tensorboard>=2.15.0',
            'pytorch-lightning>=2.1.0',
        ]
    },
    python_requires='>=3.9',
    entry_points={
        'console_scripts': [
            'face-swap-demo=face_swap_demo:main',
            'face-swap-cli=face_swap_cli:main',
        ],
    },
    classifiers=[
        'Development Status :: 4 - Beta',
        'Intended Audience :: Developers',
        'License :: OSI Approved :: MIT License',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.9',
        'Programming Language :: Python :: 3.10',
        'Programming Language :: Python :: 3.11',
        'Programming Language :: Python :: 3.12',
        'Topic :: Scientific/Engineering :: Artificial Intelligence',
    ],
)
