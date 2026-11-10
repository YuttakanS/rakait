"""Polite asynchronous HTTP fetcher shared by all store scrapers."""

from __future__ import annotations

import asyncio
import logging
import random
import time
from types import TracebackType

import httpx

logger = logging.getLogger(__name__)

USER_AGENTS: tuple[str, ...] = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/130.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) "
    "Version/17.6 Safari/605.1.15",
    "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
)

_RETRYABLE_STATUS: frozenset[int] = frozenset({408, 425, 429, 500, 502, 503, 504})


class FetchError(Exception):
    """Raised when a URL could not be fetched after all retries."""


class PoliteFetcher:
    """HTTP client that rate-limits itself and backs off on failure.

    Requests through one instance are serialised: each waits until at least
    ``min_interval`` (plus random jitter) has passed since the previous request
    started. Use one instance per merchant host so stores are throttled
    independently while still running concurrently with each other.

    Retryable failures (transport errors, 408/425/429/5xx) are retried with
    full-jitter exponential backoff, honouring ``Retry-After`` when present.

    Args:
        min_interval: Minimum seconds between request starts.
        jitter: Upper bound of the uniform random delay added to the interval.
        max_retries: Retries after the first attempt before giving up.
        backoff_base: First backoff ceiling in seconds; doubles per retry.
        backoff_cap: Upper bound on any single backoff sleep.
        timeout: Per-request timeout in seconds.
        transport: Optional httpx transport, used to stub the network in tests.
    """

    def __init__(
        self,
        *,
        min_interval: float = 2.0,
        jitter: float = 1.0,
        max_retries: int = 4,
        backoff_base: float = 1.0,
        backoff_cap: float = 60.0,
        timeout: float = 30.0,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        """Create the fetcher; see the class docstring for arguments."""
        self._min_interval = min_interval
        self._jitter = jitter
        self._max_retries = max_retries
        self._backoff_base = backoff_base
        self._backoff_cap = backoff_cap
        self._client = httpx.AsyncClient(
            timeout=timeout,
            follow_redirects=True,
            transport=transport,
            headers={"Accept-Language": "th-TH,th;q=0.9,en;q=0.8"},
        )
        self._lock = asyncio.Lock()
        self._next_allowed = 0.0

    async def __aenter__(self) -> PoliteFetcher:
        """Enter the async context."""
        return self

    async def __aexit__(
        self,
        exc_type: type[BaseException] | None,
        exc: BaseException | None,
        tb: TracebackType | None,
    ) -> None:
        """Close the underlying connection pool."""
        await self.aclose()

    async def aclose(self) -> None:
        """Close the underlying connection pool."""
        await self._client.aclose()

    async def get_text(self, url: str) -> str:
        """Fetch ``url`` and return the decoded response body.

        Args:
            url: Absolute URL to fetch.

        Returns:
            The response body decoded as text.

        Raises:
            FetchError: If every attempt failed or a non-retryable status was
                returned.
        """
        last_error = "no attempt made"
        for attempt in range(self._max_retries + 1):
            await self._throttle()
            retry_after: float | None = None
            try:
                response = await self._client.get(
                    url, headers={"User-Agent": random.choice(USER_AGENTS)}
                )
            except httpx.TransportError as exc:
                last_error = f"{type(exc).__name__}: {exc}"
            else:
                if response.status_code < 400:
                    return response.text
                last_error = f"HTTP {response.status_code}"
                if response.status_code not in _RETRYABLE_STATUS:
                    raise FetchError(f"{url}: {last_error}")
                retry_after = _parse_retry_after(response.headers.get("Retry-After"))

            if attempt == self._max_retries:
                break
            delay = self._backoff_delay(attempt, retry_after)
            logger.warning(
                "fetch failed (%s), retry %d/%d in %.1fs: %s",
                last_error,
                attempt + 1,
                self._max_retries,
                delay,
                url,
            )
            await asyncio.sleep(delay)

        raise FetchError(f"{url}: giving up after {self._max_retries + 1} attempts ({last_error})")

    async def _throttle(self) -> None:
        """Sleep until this instance's next request slot, then reserve the following one."""
        async with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                await asyncio.sleep(wait)
                now = time.monotonic()
            self._next_allowed = now + self._min_interval + random.uniform(0.0, self._jitter)

    def _backoff_delay(self, attempt: int, retry_after: float | None) -> float:
        """Return the sleep before retry number ``attempt + 1``.

        Full jitter (uniform over ``[0, base * 2**attempt]``) decorrelates
        clients that failed together; a server-supplied ``Retry-After`` acts as
        a floor.
        """
        ceiling = min(self._backoff_cap, self._backoff_base * (2**attempt))
        delay = random.uniform(0.0, ceiling)
        if retry_after is not None:
            delay = max(delay, min(retry_after, self._backoff_cap))
        return delay


def _parse_retry_after(value: str | None) -> float | None:
    """Parse a delta-seconds ``Retry-After`` header; HTTP-date forms are ignored."""
    if value is None:
        return None
    try:
        seconds = float(value)
    except ValueError:
        return None
    return seconds if seconds >= 0 else None
