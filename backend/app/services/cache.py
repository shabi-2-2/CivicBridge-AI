"""Bounded in-memory cache for analyzed civic complaints.

PROCESS-LOCAL AND RESETS ON RESTART.
Thread-safe LRU cache storing completed analysis responses for identical
normalized requests, partitioned by text, location_hint, model, and prompt_version.
Raw request text is never logged.
"""

from collections import OrderedDict
import hashlib
import logging
from threading import Lock

from app.schemas.analysis import AnalysisResponse

logger = logging.getLogger(__name__)

DEFAULT_CACHE_MAX_ENTRIES = 128


class AnalysisCache:
    """Thread-safe bounded LRU cache for identical normalized requests."""

    def __init__(self, max_entries: int = DEFAULT_CACHE_MAX_ENTRIES) -> None:
        if max_entries < 1:
            raise ValueError("max_entries must be at least 1")
        self._max_entries = max_entries
        self._cache: OrderedDict[str, AnalysisResponse] = OrderedDict()
        self._lock = Lock()

    @staticmethod
    def compute_key(
        text: str,
        location_hint: str | None,
        model: str,
        prompt_version: str,
    ) -> str:
        """Compute a SHA-256 hash of normalized inputs to prevent mixing."""
        norm_text = " ".join(text.split()).strip()
        norm_hint = " ".join((location_hint or "").split()).strip()
        composite = f"{norm_text}|{norm_hint}|{model}|{prompt_version}"
        return hashlib.sha256(composite.encode("utf-8")).hexdigest()

    def get(self, key: str) -> AnalysisResponse | None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
                return self._cache[key].model_copy(deep=True)
            return None

    def put(self, key: str, response: AnalysisResponse) -> None:
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = response.model_copy(deep=True)
            while len(self._cache) > self._max_entries:
                self._cache.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._cache.clear()

    def __len__(self) -> int:
        with self._lock:
            return len(self._cache)


__all__ = ["AnalysisCache", "DEFAULT_CACHE_MAX_ENTRIES"]
