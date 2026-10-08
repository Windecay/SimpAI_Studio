"""Bounded startup repair for the tested translators 6.0.4 dependency family."""

from importlib import metadata

from packaging.requirements import Requirement
from packaging.utils import canonicalize_name
from packaging.version import InvalidVersion, Version


# Only these packages may be installed automatically, always with --no-deps.
# Keep compatible newer dependencies; translators itself uses the tested version.
TRANSLATOR_RUNTIME_PINS = {
    "pyjsparser": "2.7.1",
    "tzlocal": "5.4.4",
    "js2py": "0.74",
    "asyncio-throttle": "1.0.2",
    "brotlicffi": "1.2.0.2",
    "exejs": "1.0.1",
    "jh2": "5.0.15",
    "qh3": "2.0.4",
    "wassima": "2.1.4",
    "urllib3-future": "2.25.902",
    "niquests": "3.21.2",
    "ai-urllib4": "2.2.0",
    "ai-cloudscraper": "3.8.4",
    "dill": "0.4.1",
    "multiprocess": "0.70.19",
    "pox": "0.3.7",
    "ppft": "1.7.8",
    "pathos": "0.3.5",
    "translators": "6.0.4",
}

# Requirements imposed on shared libraries by the pinned packages above.
# A mismatch is reported before installation, without changing shared packages.
TRANSLATOR_SHARED_REQUIREMENTS = (
    "aiohttp>=3.11.0",
    "brotli>=1.2.0",
    "certifi>=2024.12.14",
    "cffi>=1.17.0",
    "charset-normalizer<4,>=2",
    "cryptography>=42.0.4",
    "h11<1.0.0,>=0.11.0",
    "httpx>=0.28.1",
    "lxml>=5.4.0",
    "psutil>=5.9.0",
    "pyOpenSSL>=24.2.0",
    "pycryptodome>=3.23.0",
    "pyparsing>=3.2.0",
    "requests-toolbelt>=1.0.0",
    "requests>=2.32.3",
    "six>=1.10",
    "tqdm>=4.67.1",
    "typing-extensions>=4.12.0",
    'tzdata; platform_system == "Windows"',
)
TRANSLATOR_FAMILY_REQUIREMENTS = (
    "urllib3-future<3,>=2.13.903",
    "wassima<3,>=1.0.1",
    "jh2<6.0.0,>=5.0.3",
    "qh3<3.0.0,>=1.5.4",
)


def _installed_version(name):
    try:
        return metadata.version(name)
    except metadata.PackageNotFoundError:
        return None


def _active_requirement(raw, extras=()):
    requirement = Requirement(raw)
    if requirement.marker and not any(
        requirement.marker.evaluate({"extra": extra}) for extra in (extras or ("",))
    ):
        return None
    return requirement


def translator_runtime_plan():
    """Return explicit install specs and any reasons to leave the environment alone."""
    pending = {}
    issues = []
    for name, target in TRANSLATOR_RUNTIME_PINS.items():
        installed = _installed_version(name)
        if installed is None:
            pending[name] = target
            continue
        try:
            ready = (
                Version(installed) == Version(target) if name == "translators"
                else Version(installed) >= Version(target)
            )
        except InvalidVersion:
            issues.append(f"Invalid installed version: {name}={installed}")
            continue
        if not ready:
            pending[name] = target

    def check(requirement, owner):
        name = canonicalize_name(requirement.name)
        installed = pending.get(name) or _installed_version(name)
        if installed is None or not requirement.specifier.contains(installed, prereleases=True):
            issues.append(f"{owner} requires {requirement}; installed/planned={installed or 'missing'}")

    for raw in (*TRANSLATOR_SHARED_REQUIREMENTS, *TRANSLATOR_FAMILY_REQUIREMENTS):
        requirement = _active_requirement(raw)
        if requirement:
            check(requirement, "translators runtime")

    # Check active transitive dependencies, including extras, without importing
    # the library (its import can access the network).
    queue = [(name, ()) for name in TRANSLATOR_RUNTIME_PINS]
    queue += [(Requirement(raw).name, ()) for raw in TRANSLATOR_SHARED_REQUIREMENTS
              if _active_requirement(raw)]
    visited = set()
    while queue:
        name, extras = queue.pop()
        name = canonicalize_name(name)
        key = (name, tuple(sorted(extras)))
        if key in visited or name in pending:
            continue  # Old metadata does not describe the pinned replacement.
        visited.add(key)
        try:
            requirements = metadata.requires(name) or ()
        except metadata.PackageNotFoundError:
            continue  # Already reported by the parent requirement.
        for raw in requirements:
            requirement = _active_requirement(raw, extras)
            if requirement:
                check(requirement, name)
                queue.append((requirement.name, requirement.extras))

    # A translation dependency can also be used by another installed package.
    # Refuse the change if it would violate that package's declared requirement.
    if pending:
        for distribution in metadata.distributions():
            owner = distribution.metadata.get("Name", "")
            if canonicalize_name(owner) in pending:
                continue
            for raw in distribution.requires or ():
                requirement = _active_requirement(raw)
                if requirement and canonicalize_name(requirement.name) in pending:
                    check(requirement, owner)
    return [f"{name}=={version}" for name, version in pending.items()], list(dict.fromkeys(issues))


def ensure_translator_runtime(install, emit=print):
    try:
        specs, issues = translator_runtime_plan()
        if issues:
            emit("Translation runtime requires manual dependency repair; no packages changed: " + "; ".join(issues))
            return False
        if not specs:
            return True
        emit("Installing explicit translation dependencies with --no-deps: " + ", ".join(specs))
        if not install(["install", "--no-deps", *specs]):
            return False
        remaining, issues = translator_runtime_plan()
        if remaining or issues:
            emit("Translation runtime verification failed: " + "; ".join([*remaining, *issues]))
            return False
        return True
    except Exception as exc:
        emit(f"Unable to check translation runtime: {type(exc).__name__}: {exc}")
        return False
