"""File diagnostics and compact console output for the integrated Forge process."""

import copy
import json
import logging
import re
import sys
from datetime import datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path


_file_handler = None
_console_file = None
_failed = False


class DiagnosticFileHandler(RotatingFileHandler):
    def handleError(self, record):
        global _failed
        if not _failed:
            _failed = True
            sys.__stderr__.write("Forge diagnostic log write failed; detailed console logging restored.\n")


class ConsoleFilter(logging.Filter):
    def filter(self, record):
        if _failed or record.levelno >= logging.WARNING:
            return True
        message = record.getMessage()
        return record.name != "source_backend" and not (
            message.startswith("[Forge source]") and
            ("stage=" in message or "tensor=" in message or "synchronous model transfer" in message)
        )


class SummaryFilter(logging.Filter):
    def filter(self, record):
        if _failed or record.levelno >= logging.WARNING:
            return False
        message = record.getMessage()
        match = re.search(r"\btensor=(sampling_output|vae\.raw_encode|vae\.raw_decode|final_image_uint8)\b", message)
        if not match:
            return False
        fields = re.findall(r"\b(?:nan|inf|mean|std|image_index|batch_start)=\S+", message)
        summary = copy.copy(record)
        summary.msg = f"[Forge trace] {match[1]} " + " ".join(fields)
        summary.args = ()
        return summary


def attach(logger):
    if _file_handler is None:
        return
    if _file_handler not in logger.handlers:
        for handler in logger.handlers:
            handler.addFilter(ConsoleFilter())
        logger.addHandler(_file_handler)
        if logger.name == "source_backend":
            summary = logging.StreamHandler(sys.stdout)
            summary.addFilter(SummaryFilter())
            summary.setFormatter(logging.Formatter("%(message)s"))
            logger.addHandler(summary)


def _redact_media(value):
    if isinstance(value, dict):
        return {
            key: "<media omitted>" if key in {"images", "current_image", "image", "preview"} else _redact_media(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [_redact_media(item) for item in value]
    return value


class ConsoleTee:
    def __init__(self, stream):
        self.stream = stream
        self.pending = ""

    def __getattr__(self, name):
        return getattr(self.stream, name)

    def write(self, text):
        result = self.stream.write(text)
        self.pending += text
        while "\n" in self.pending:
            line, self.pending = self.pending.split("\n", 1)
            self._record(line)
        return result

    def _record(self, line):
        for prefix in ("__FORGE_NEO_SOURCE_EVENT__ ", "__FORGE_NEO_SOURCE_RESULT__ "):
            if line.startswith(prefix):
                try:
                    line = prefix + json.dumps(_redact_media(json.loads(line[len(prefix):])), ensure_ascii=False)
                except (ValueError, TypeError):
                    line = prefix + "<unparseable protocol record>"
                break
        record = logging.LogRecord("console", logging.INFO, "", 0, line, (), None)
        _console_file.handle(record)

    def flush(self):
        self.stream.flush()
        if self.pending:
            self._record(self.pending)
            self.pending = ""
        _console_file.flush()


def configure(app_root, *, job_id=None):
    global _file_handler, _console_file
    if _file_handler is not None:
        return
    import os

    directory = Path(app_root) / "logs" / "forge_neo" / f"{datetime.now():%Y-%m-%d_%H-%M-%S}_{os.getpid()}"
    try:
        directory.mkdir(parents=True, exist_ok=True)
        formatter = logging.Formatter("%(asctime)s %(levelname)s job=%(job_id)s %(name)s %(message)s")
        def add_job(record):
            record.job_id = (job_id() if job_id else "") or "-"
            return True

        handlers = []
        for name in ("details.log", "console.log"):
            handler = DiagnosticFileHandler(directory / name, maxBytes=64 * 1024 * 1024, backupCount=7, encoding="utf-8")
            handler.setFormatter(formatter)
            handler.addFilter(add_job)
            handlers.append(handler)
        _file_handler, _console_file = handlers
    except OSError as error:
        for handler in locals().get("handlers", []):
            handler.close()
        print(f"Forge diagnostic file unavailable; retaining console logs: {error}", file=sys.stderr, flush=True)
        return
    sys.stdout = ConsoleTee(sys.stdout)
    sys.stderr = ConsoleTee(sys.stderr)
    for logger in list(logging.Logger.manager.loggerDict.values()):
        if isinstance(logger, logging.Logger) and logger.handlers:
            attach(logger)
    print(f"[Forge source] Diagnostic logs: {directory}", flush=True)
