"""Explicit JSON charset for clients including Windows PowerShell 5.1."""
from starlette.responses import JSONResponse


class AgentJSONResponse(JSONResponse):
    media_type = "application/json; charset=utf-8"
