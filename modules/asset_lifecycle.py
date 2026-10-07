"""Per-user lifetime management for materialized Canvas/Agent assets.

Only hashed media beneath the user's asset catalog can be reclaimed. Generated
originals, project documents, credentials and model directories are never deleted.
"""
from contextlib import contextmanager
from functools import wraps
import hashlib
import json
import logging
import os
from pathlib import Path
import re
import sqlite3
import sys
import threading
import time
from urllib.parse import unquote


DAY = 86400
GIB = 1024 ** 3
DEFAULT_POLICY = {"enabled": True, "retention_days": 30, "max_gb": 0}
MEDIA_NAME = re.compile(r"\.([0-9a-f]{16,64})\.(png|jpe?g|webp|gif|bmp|tiff?|avif|mp4|webm|mov|mkv|avi|wav|mp3|flac|ogg|m4a|aac)$", re.I)
ASSET_ID = re.compile(r"^(?:asset|file):([0-9a-f]{16,64})$", re.I)
SCAN_SECONDS = 10
MAX_FILES = 50000
MAX_DELETIONS = 500
MAX_DOCUMENTS = 10000
MAX_DOCUMENT_BYTES = 32 * 1024 * 1024
_LOCKS = {}
_REGISTRY_LOCK = threading.Lock()
_PENDING = {}
_USER_HOMES = set()
_THREAD = None
logger = logging.getLogger(__name__)


class StorageLimitError(ValueError):
    pass


def _lock(root):
    key = os.path.normcase(str(root))
    with _REGISTRY_LOCK:
        return _LOCKS.setdefault(key, threading.RLock())


def for_state(state, project_id="default"):
    import shared
    from modules.canvas_workbench_assets import _asset_root
    root, user_id = _asset_root(project_id, state)
    userhome = Path(getattr(shared, "path_userhome", None) or "users").resolve()
    roleplay_home = (userhome / str(user_id)).resolve()
    references = []
    if roleplay_home.is_relative_to(userhome):
        references = [roleplay_home / "vlm_roleplay", roleplay_home / "presets" / "characters"]
    return AssetStore(Path(root).parent, reference_roots=references)


@contextmanager
def guard(state, project_id="default"):
    store = for_state(state, project_id)
    with store.lock:
        yield store


def serialized(function):
    @wraps(function)
    def wrapped(payload, state_params):
        from modules.canvas_workbench_project import _state_params_for_payload
        state = _state_params_for_payload(payload, state_params)
        project_id = payload.get("project_id", "default") if isinstance(payload, dict) else "default"
        with guard(state, project_id):
            return function(payload, state_params)
    return wrapped


def track(project_id, state, path, original=""):
    store = for_state(state, project_id)
    store.touch(path, original=original)
    schedule(store)


def generation_busy():
    """Do not load the worker/model stack just to run maintenance."""
    runner = sys.modules.get("modules.canvas_workbench_runner")
    if runner is not None:
        if not all(hasattr(runner, name) for name in ("CANVAS_RUNS_LOCK", "CANVAS_RUNS", "TERMINAL_RUN_STATES")):
            return True
        with runner.CANVAS_RUNS_LOCK:
            records = list(runner.CANVAS_RUNS.values())
        for record in records:
            if record.get("state") in runner.TERMINAL_RUN_STATES:
                continue
            task = record.get("task")
            if task is not None and any(item[0] == "finish" for item in list(getattr(task, "yields", []) or []) if isinstance(item, (list, tuple)) and item):
                continue
            return True
    worker = sys.modules.get("modules.async_worker")
    if worker is not None:
        try:
            return bool(worker.get_task_size() or worker.get_processing_id())
        except Exception:
            return True
    return False


def schedule(store, delay=3600):
    global _THREAD
    with _REGISTRY_LOCK:
        # Work with captured directories, never with a mutable current identity.
        previous = _PENDING.get(str(store.root))
        deadline = time.time() + delay
        _PENDING[str(store.root)] = (min(previous[0], deadline) if previous else deadline, store)
        if _THREAD is None or not _THREAD.is_alive():
            _THREAD = threading.Thread(target=_maintenance, name="asset-maintenance", daemon=True)
            _THREAD.start()


def start_maintenance(user_home):
    """Re-enroll persisted stores after restart, including inactive users."""
    global _THREAD
    if not user_home:
        return
    with _REGISTRY_LOCK:
        _USER_HOMES.add(str(Path(user_home).resolve()))
        if _THREAD is None or not _THREAD.is_alive():
            _THREAD = threading.Thread(target=_maintenance, name="asset-maintenance", daemon=True)
            _THREAD.start()


def _discover_stores(user_home):
    boundary = Path(user_home).resolve()
    if not boundary.is_dir():
        return
    deadline = time.monotonic() + SCAN_SECONDS
    for user in boundary.iterdir():
        if time.monotonic() > deadline:
            break
        root = user / "canvas_workbench/assets"
        database = root.parent / "asset_lifecycle.sqlite3"
        if user.is_symlink() or (hasattr(user, "is_junction") and user.is_junction()):
            continue
        if root.is_dir() and database.is_file() and root.resolve().is_relative_to(boundary):
            schedule(AssetStore(root))


def _maintenance():
    last_discovery = 0
    while True:
        time.sleep(60)
        if generation_busy():
            continue
        now = time.time()
        if now - last_discovery >= 3600:
            with _REGISTRY_LOCK:
                homes = list(_USER_HOMES)
            for home in homes:
                try:
                    _discover_stores(home)
                except OSError:
                    logger.warning("Asset maintenance could not enumerate a user directory")
            last_discovery = now
        with _REGISTRY_LOCK:
            due = [(root, entry[1]) for root, entry in _PENDING.items() if entry[0] <= now]
        for root, store in due:
            if not Path(root).is_dir():
                with _REGISTRY_LOCK:
                    _PENDING.pop(root, None)
                continue
            result = {}
            try:
                result = store.cleanup(automatic=True)
            except Exception:
                logger.exception("Asset maintenance failed")
            finally:
                with _REGISTRY_LOCK:
                    delay = 60 if result.get("more_pending") or result.get("index_pending") else 3600
                    _PENDING[root] = (time.time() + delay, store)


class AssetStore:
    def __init__(self, root, reference_roots=()):
        self.root = Path(root).resolve()
        self.lock = _lock(self.root)
        self.database = self.root.parent / "asset_lifecycle.sqlite3"
        self.reference_roots = tuple(Path(path) for path in reference_roots)

    @contextmanager
    def _db(self):
        self.database.parent.mkdir(parents=True, exist_ok=True)
        db = sqlite3.connect(self.database, timeout=10)
        db.row_factory = sqlite3.Row
        try:
            db.executescript("""
                CREATE TABLE IF NOT EXISTS assets (
                    path TEXT PRIMARY KEY, entry_id TEXT UNIQUE NOT NULL,
                    digest TEXT NOT NULL, size INTEGER NOT NULL, mtime_ns INTEGER NOT NULL,
                    created REAL NOT NULL, used REAL NOT NULL, pinned INTEGER NOT NULL DEFAULT 0,
                    original TEXT NOT NULL DEFAULT '', original_stat TEXT NOT NULL DEFAULT ''
                );
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            """)
            if "original_stat" not in {row[1] for row in db.execute("PRAGMA table_info(assets)")}:
                db.execute("ALTER TABLE assets ADD COLUMN original_stat TEXT NOT NULL DEFAULT ''")
            stored = db.execute("SELECT value FROM settings WHERE key='reference_roots'").fetchone()
            if self.reference_roots:
                value = json.dumps([str(path.resolve()) for path in self.reference_roots])
                if stored is None or stored[0] != value:
                    db.execute("INSERT OR REPLACE INTO settings VALUES ('reference_roots',?)", (value,))
            elif stored is not None:
                # Only paths recorded by the server are persisted here; these
                # directories are never accepted from API request bodies.
                self.reference_roots = tuple(Path(path) for path in json.loads(stored[0]))
            yield db
            db.commit()
        finally:
            db.close()

    def _relative(self, path):
        path = Path(path)
        try:
            # Symlinks/junctions are excluded even when they happen to point back
            # into the catalog. A catalog relocation must not change ownership.
            relative = path.absolute().relative_to(self.root)
            current = self.root
            for part in relative.parts:
                current = current / part
                if current.is_symlink() or (hasattr(current, "is_junction") and current.is_junction()):
                    return None
            if not path.resolve().is_relative_to(self.root) or len(relative.parts) != 3:
                return None
            match = MEDIA_NAME.search(relative.name)
            if not match or relative.parts[1].lower() != match[1][:2].lower():
                return None
            return relative.as_posix(), match[1].lower()
        except (OSError, ValueError):
            return None

    def _remember(self, db, path, now, used, original=""):
        reference = self._relative(path)
        if reference is None or not Path(path).is_file():
            return
        relative, digest = reference
        stat = Path(path).stat()
        row = db.execute("SELECT * FROM assets WHERE path=?", (relative,)).fetchone()
        original_stat = ""
        if original:
            try:
                source_stat = Path(original).stat()
                original_stat = json.dumps([source_stat.st_size, source_stat.st_mtime_ns])
            except OSError:
                pass
        elif row is None and re.search(r"\.output\.[0-9a-f]{16,64}\.", Path(path).name, re.I):
            # An old generated copy without provenance may be the sole surviving
            # artwork. Its filename alone cannot prove another original exists.
            original = str(Path(path).resolve())
        entry_id = hashlib.sha256(relative.encode("utf-8")).hexdigest()[:32]
        if row is None:
            # Existing files receive a full grace period when first discovered.
            db.execute("INSERT INTO assets VALUES (?,?,?,?,?,?,?,0,?,?)",
                       (relative, entry_id, digest, stat.st_size, stat.st_mtime_ns, now, now, original, original_stat))
        else:
            changed = row["size"] != stat.st_size or row["mtime_ns"] != stat.st_mtime_ns
            if used or changed or (original and original != row["original"]):
                db.execute("UPDATE assets SET size=?,mtime_ns=?,used=?,original=?,original_stat=? WHERE path=?",
                           (stat.st_size, stat.st_mtime_ns, now if used or changed else row["used"],
                            original or row["original"], original_stat if original else row["original_stat"], relative))

    def touch(self, path, original=""):
        if not self._relative(path):
            return
        with self.lock, self._db() as db:
            self._remember(db, path, time.time(), True, original)

    def forget(self, path):
        reference = self._relative(path)
        if reference:
            with self.lock, self._db() as db:
                db.execute("DELETE FROM assets WHERE path=?", (reference[0],))

    def policy(self, db=None):
        if db is None:
            with self.lock, self._db() as connection:
                return self.policy(connection)
        row = db.execute("SELECT value FROM settings WHERE key='policy'").fetchone()
        if row is None:
            return dict(DEFAULT_POLICY)
        return {**DEFAULT_POLICY, **json.loads(row[0])}

    def set_policy(self, policy):
        if set(policy) != set(DEFAULT_POLICY) or type(policy["enabled"]) is not bool:
            raise ValueError("invalid_storage_policy")
        if type(policy["retention_days"]) is not int or not 1 <= policy["retention_days"] <= 365:
            raise ValueError("invalid_retention_days")
        if type(policy["max_gb"]) is not int or not 0 <= policy["max_gb"] <= 100000:
            raise ValueError("invalid_storage_limit")
        with self.lock, self._db() as db:
            db.execute("INSERT OR REPLACE INTO settings VALUES ('policy',?)", (json.dumps(policy),))
        schedule(self)
        return policy

    def set_pin(self, entry_id, pinned):
        if not re.fullmatch(r"[0-9a-f]{32}", str(entry_id)) or type(pinned) is not bool:
            raise ValueError("invalid_asset_selection")
        with self.lock, self._db() as db:
            row = db.execute("SELECT path FROM assets WHERE entry_id=?", (entry_id,)).fetchone()
            if row is None or not (self.root / row[0]).is_file():
                raise ValueError("asset_not_found")
            db.execute("UPDATE assets SET pinned=?,used=? WHERE entry_id=?", (int(pinned), time.time(), entry_id))

    def _inventory(self, db, now, deadline):
        def get(key, default=""):
            row = db.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
            return row[0] if row else default

        def put(key, value):
            db.execute("INSERT OR REPLACE INTO settings VALUES (?,?)", (key, str(value)))

        phase = get("inventory_phase", "files")
        cursor = get("inventory_cursor")
        count = 0
        put("inventory_pending", "1")
        if phase == "files":
            projects = sorted(self.root.iterdir(), key=lambda path: path.name) if self.root.is_dir() else []
            cursor_parts = cursor.split("/")
            for project in projects:
                if time.monotonic() > deadline:
                    return False
                if cursor and project.name < cursor_parts[0]:
                    continue
                if not project.is_dir() or project.is_symlink() or (hasattr(project, "is_junction") and project.is_junction()):
                    continue
                for bucket in sorted(project.iterdir(), key=lambda path: path.name):
                    if time.monotonic() > deadline:
                        return False
                    if cursor and project.name == cursor_parts[0] and len(cursor_parts) > 1 and bucket.name < cursor_parts[1]:
                        continue
                    if not re.fullmatch(r"[0-9a-f]{2}", bucket.name, re.I) or not bucket.is_dir() or bucket.is_symlink() or (hasattr(bucket, "is_junction") and bucket.is_junction()):
                        continue
                    for path in sorted(bucket.iterdir(), key=lambda path: path.name):
                        relative = path.relative_to(self.root).as_posix()
                        if relative <= cursor:
                            continue
                        if count >= MAX_FILES or time.monotonic() > deadline:
                            return False
                        self._remember(db, path, now, False)
                        count += 1
                        put("inventory_cursor", relative)
            put("inventory_phase", "missing")
            put("inventory_cursor", "")
            cursor = ""
        for row in db.execute("SELECT path FROM assets WHERE path>? ORDER BY path", (cursor,)).fetchall():
            if count >= MAX_FILES or time.monotonic() > deadline:
                return False
            if not (self.root / row[0]).is_file():
                db.execute("DELETE FROM assets WHERE path=?", (row[0],))
            count += 1
            put("inventory_cursor", row[0])
        put("inventory_phase", "files")
        put("inventory_cursor", "")
        put("inventory_pending", "0")
        put("inventory_complete_at", now)
        return True

    def _references(self, deadline):
        canvas = self.root.parent
        workspace = canvas.parent
        directories = [canvas / "projects", canvas / "templates",
                       self.root / "agent_api" / "workflow_imports",
                       workspace / "vlm_roleplay", workspace / "presets" / "characters", *self.reference_roots]
        digests, signatures = set(), {}
        count = 0

        def collect(value, depth=0):
            if depth > 100 or time.monotonic() > deadline:
                raise ValueError("reference_scan_limit")
            if isinstance(value, dict):
                for item in value.values():
                    collect(item, depth + 1)
            elif isinstance(value, list):
                for item in value:
                    collect(item, depth + 1)
            elif isinstance(value, str) and not value.startswith("data:"):
                # Legacy saved parameters can contain a Python-style string
                # representation rather than nested JSON. Asset IDs still count.
                for found in re.finditer(r"(?:asset|file):([0-9a-f]{16,64})(?![0-9a-f])", value, re.I):
                    digests.add(found[1][:16].lower())
                match = ASSET_ID.fullmatch(value)
                if match:
                    digests.add(match[1][:16].lower())
                else:
                    decoded = unquote(value).replace("\\", "/").split("?", 1)[0]
                    match = MEDIA_NAME.search(decoded) or re.search(r"/api/v1/assets/(?:asset|file):([0-9a-f]{16,64})/content(?:$|[?#])", decoded, re.I)
                    if match:
                        digests.add(match[1][:16].lower())
                    elif value.lstrip().startswith(("{", "[")):
                        try:
                            embedded = json.loads(value)
                        except ValueError:
                            return
                        collect(embedded, depth + 1)

        try:
            for directory in dict.fromkeys(directories):
                if not directory.exists():
                    # Remember absent directories as well: a new project save
                    # during a sweep invalidates its reference snapshot.
                    signatures[str(directory)] = None
                    continue
                if directory.is_symlink() or (hasattr(directory, "is_junction") and directory.is_junction()):
                    return digests, {}, False
                boundary = directory.resolve()
                for folder, subdirs, files in os.walk(directory, followlinks=False):
                    folder = Path(folder)
                    if not folder.resolve().is_relative_to(boundary) or time.monotonic() > deadline:
                        return digests, {}, False
                    signatures[str(folder)] = folder.stat().st_mtime_ns
                    if any((folder / name).is_symlink() or (hasattr(folder / name, "is_junction") and (folder / name).is_junction()) for name in subdirs):
                        return digests, {}, False
                    for name in files:
                        if not name.endswith(".json"):
                            continue
                        count += 1
                        path = folder / name
                        stat = path.stat()
                        if count > MAX_DOCUMENTS or stat.st_size > MAX_DOCUMENT_BYTES or time.monotonic() > deadline or path.is_symlink():
                            return digests, {}, False
                        signatures[str(path)] = stat.st_mtime_ns
                        collect(json.loads(path.read_text(encoding="utf-8-sig")))
        except (OSError, ValueError, RecursionError):
            return digests, {}, False
        return digests, signatures, True

    @staticmethod
    def _unchanged(signatures):
        try:
            return all((Path(path).stat().st_mtime_ns if Path(path).exists() else None) == stamp for path, stamp in signatures.items())
        except OSError:
            return False

    def _snapshot(self, db, now):
        referenced, signatures, refs_complete = self._references(time.monotonic() + SCAN_SECONDS)
        inventory_complete = self._inventory(db, now, time.monotonic() + SCAN_SECONDS)
        policy = self.policy(db)
        busy = generation_busy()
        items = []
        for row in db.execute("SELECT * FROM assets ORDER BY used DESC, path").fetchall():
            reason = ("pinned" if row["pinned"] else "referenced" if row["digest"][:16] in referenced
                      else "only_copy" if not self._original_unchanged(row)
                      else "active_task" if busy else "")
            expired = now - max(row["created"], row["used"]) >= policy["retention_days"] * DAY
            item = dict(row)
            item.update(protection=reason, expires_at=max(row["created"], row["used"]) + policy["retention_days"] * DAY,
                        eligible=bool(expired and not reason and refs_complete))
            items.append(item)
        return policy, items, signatures, refs_complete, busy, inventory_complete

    def _original_unchanged(self, row):
        if not row["original"]:
            return True
        original = Path(row["original"])
        try:
            if original.resolve() == (self.root / row["path"]).resolve() or not row["original_stat"]:
                return False
            stat = original.stat()
            return original.is_file() and json.dumps([stat.st_size, stat.st_mtime_ns]) == row["original_stat"]
        except OSError:
            return False

    def status(self, offset=0, limit=50):
        with self.lock, self._db() as db:
            policy, items, _, complete, busy, inventory_complete = self._snapshot(db, time.time())
            used = sum(row["size"] for row in items)
            maximum = policy["max_gb"] * GIB
            result = {"policy": policy, "total_files": len(items), "total_bytes": used,
                      "protected_files": sum(bool(row["protection"]) for row in items),
                      "reclaimable_files": sum(row["eligible"] for row in items),
                      "reclaimable_bytes": sum(row["size"] for row in items if row["eligible"]),
                      "over_limit": bool(maximum and used >= maximum), "scan_complete": complete, "busy": busy,
                      "inventory_complete": inventory_complete,
                      "offset": offset, "limit": limit, "has_more": offset + limit < len(items),
                      "items": [{"entry_id": row["entry_id"], "name": Path(row["path"]).name,
                                 "size": row["size"], "last_used": row["used"], "expires_at": row["expires_at"],
                                 "pinned": bool(row["pinned"]), "protection": row["protection"], "eligible": row["eligible"]}
                                for row in items[offset:offset + limit]]}
            recent = db.execute("SELECT value FROM settings WHERE key='last_cleanup'").fetchone()
            result["last_cleanup"] = json.loads(recent[0]) if recent else None
        schedule(self)
        return result

    def deletion_protection(self):
        with self.lock, self._db() as db:
            _, items, _, complete, busy, _ = self._snapshot(db, time.time())
            return {os.path.normcase(str((self.root / row["path"]).resolve())): row["protection"] for row in items}, complete, busy

    def cleanup(self, automatic=False):
        with self.lock, self._db() as db:
            if automatic and not self.policy(db)["enabled"]:
                return {"deleted_files": 0, "deleted_bytes": 0, "at": time.time(), "blocked": "disabled"}
            policy, items, signatures, complete, busy, inventory_complete = self._snapshot(db, time.time())
            db.commit()
            result = {"deleted_files": 0, "deleted_bytes": 0, "at": time.time(), "blocked": "",
                      "more_pending": False, "index_pending": not inventory_complete}
            if automatic and not policy["enabled"]:
                result["blocked"] = "disabled"
            elif not complete:
                result["blocked"] = "scan_incomplete"
            elif busy:
                result["blocked"] = "active_task"
            else:
                delete_deadline = time.monotonic() + SCAN_SECONDS
                for row in items:
                    if not row["eligible"]:
                        continue
                    if result["deleted_files"] >= MAX_DELETIONS or time.monotonic() > delete_deadline:
                        result["more_pending"] = True
                        break
                    if generation_busy() or not self._unchanged(signatures):
                        result["blocked"] = "state_changed"
                        break
                    path = self.root / row["path"]
                    try:
                        stat = path.stat()
                        if not self._relative(path) or stat.st_size != row["size"] or stat.st_mtime_ns != row["mtime_ns"] or not self._original_unchanged(row):
                            continue
                        # Cross-process touches/pins must win over this snapshot.
                        db.execute("BEGIN IMMEDIATE") if not db.in_transaction else None
                        current = db.execute("SELECT used,pinned FROM assets WHERE path=?", (row["path"],)).fetchone()
                        if current is None or current["used"] != row["used"] or current["pinned"]:
                            continue
                        path.unlink()
                        db.execute("DELETE FROM assets WHERE path=?", (row["path"],))
                        result["deleted_files"] += 1
                        result["deleted_bytes"] += row["size"]
                    except OSError:
                        continue
                    finally:
                        db.commit()
            db.execute("INSERT OR REPLACE INTO settings VALUES ('last_cleanup',?)", (json.dumps(result),))
            if policy["enabled"] and (result["more_pending"] or result["index_pending"]):
                schedule(self, 60)
            return result

    def check_capacity(self, incoming=0):
        # The budget never evicts an asset before its retention period. Existing
        # jobs may finish; new uploads/generations wait until space is available.
        with self.lock, self._db() as db:
            policy = self.policy(db)
            if not policy["max_gb"]:
                return
            stamp = db.execute("SELECT value FROM settings WHERE key='inventory_complete_at'").fetchone()
            pending = db.execute("SELECT value FROM settings WHERE key='inventory_pending'").fetchone()
            recent = stamp and time.time() - float(stamp[0]) < 3600 and (not pending or pending[0] == "0")
            if not recent and not self._inventory(db, time.time(), time.monotonic() + SCAN_SECONDS):
                db.commit()
                raise StorageLimitError("asset_storage_scan_incomplete")
            used = db.execute("SELECT COALESCE(SUM(size),0) FROM assets").fetchone()[0]
            if used + incoming > policy["max_gb"] * GIB:
                db.commit()
                raise StorageLimitError("asset_storage_limit")
