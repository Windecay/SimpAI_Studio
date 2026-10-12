"""Recoverable inference secrets, encrypted independently of their auth hashes."""
import hashlib
import json
import os
import secrets
import tempfile
from pathlib import Path

from modules.agent_service import AgentAPIError


class KeyVault:
    def __init__(self, database_path):
        self.path = Path(database_path).with_suffix(".inference-secret")

    def _key(self, create=False):
        try:
            if self.path.is_symlink():
                raise ValueError("invalid_secret_store")
            if not self.path.exists() and create:
                secret = secrets.token_bytes(32)
                if os.name == "nt":
                    from modules.agent_mcp_client import _protect
                    stored = b"dpapi-v1:" + _protect(secret)
                else:
                    stored = b"private-v1:" + secret
                fd, temporary = tempfile.mkstemp(dir=self.path.parent, prefix=".inference-secret-")
                try:
                    with os.fdopen(fd, "wb") as handle:
                        handle.write(stored)
                        handle.flush()
                        os.fsync(handle.fileno())
                    os.replace(temporary, self.path)
                finally:
                    if os.path.exists(temporary):
                        os.unlink(temporary)
            if os.name != "nt" and self.path.stat().st_mode & 0o077:
                raise ValueError("invalid_secret_permissions")
            if self.path.stat().st_size > 16384:
                raise ValueError("invalid_secret_store")
            stored = self.path.read_bytes()
            if stored.startswith(b"dpapi-v1:") and os.name == "nt":
                from modules.agent_mcp_client import _protect
                secret = _protect(stored[len(b"dpapi-v1:"):], decrypt=True)
            elif stored.startswith(b"private-v1:"):
                secret = stored[len(b"private-v1:"):]
            else:
                raise ValueError("invalid_secret_format")
            if len(secret) != 32:
                raise ValueError("invalid_secret_size")
            return secret
        except Exception:
            raise AgentAPIError("inference_key_secret_unavailable", "Inference key encryption storage is unavailable. Restore its private backup.", 503) from None

    @staticmethod
    def _aad(key_id, owner, service_id):
        return json.dumps([key_id, owner, service_id], separators=(",", ":")).encode("utf-8")

    def encrypt(self, value, key_id, owner, service_id, create_master=False):
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            cipher = AESGCM(self._key(create=create_master))
            nonce = secrets.token_bytes(12)
            return b"aesgcm-v1:" + nonce + cipher.encrypt(nonce, value.encode("ascii"), self._aad(key_id, owner, service_id))
        except AgentAPIError:
            raise
        except Exception:
            raise AgentAPIError("inference_key_secret_unavailable", "Inference key encryption is unavailable.", 503) from None

    def decrypt(self, row):
        if not row["encrypted_key"]:
            raise AgentAPIError("inference_key_not_recoverable", "This older key has no recoverable copy. Create a new key.", 409)
        try:
            from cryptography.hazmat.primitives.ciphers.aead import AESGCM
            stored = bytes(row["encrypted_key"])
            if not stored.startswith(b"aesgcm-v1:"):
                raise ValueError("invalid_secret_format")
            stored = stored[len(b"aesgcm-v1:"):]
            identity = json.loads(row["identity"])
            value = AESGCM(self._key()).decrypt(stored[:12], stored[12:], self._aad(row["id"], row["owner"], identity["service_id"])).decode("ascii")
            if hashlib.sha256(value.encode()).hexdigest() != row["key_hash"]:
                raise ValueError("invalid_secret_hash")
            return value
        except AgentAPIError:
            raise
        except Exception:
            raise AgentAPIError("inference_key_secret_unavailable", "The saved inference key could not be decrypted.", 503) from None
