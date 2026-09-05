"""Small dependency-free Python client for Ontology Platform v1."""
from __future__ import annotations
import json
from urllib import request, error
from urllib.parse import quote

class OntologyPlatformError(RuntimeError):
    def __init__(self, payload: dict, status: int):
        self.payload, self.status = payload, status
        super().__init__(payload.get("error", {}).get("message", f"HTTP {status}"))

class OntologyPlatformClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url, self.api_key = base_url.rstrip("/"), api_key
    def resolve_ontology_context(self, payload: dict) -> dict:
        return self._request("/v1/semantic-context:resolve", payload)
    def execute_semantic_query(self, payload: dict) -> dict:
        return self._request("/v1/semantic-query", payload)
    def continue_semantic_query(self, clarification_id: str, selections: dict) -> dict:
        return self._request(f'/v1/semantic-query/clarifications/{quote(clarification_id, safe="")}:continue', {"selections": selections})
    def get_ontology(self, namespace: str, version="latest") -> dict:
        return self._request(f'/v1/namespaces/{quote(namespace, safe="")}/ontology?version={quote(str(version), safe="")}' )
    def _request(self, path: str, payload=None) -> dict:
        data = None if payload is None else json.dumps(payload).encode()
        req = request.Request(self.base_url + path, data=data, headers={"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"})
        try:
            with request.urlopen(req, timeout=60) as response:
                return json.load(response)
        except error.HTTPError as exc:
            raise OntologyPlatformError(json.load(exc), exc.code) from exc
