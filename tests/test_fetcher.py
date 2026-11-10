import time

import httpx
import pytest

from pricewatch.scrapers.fetcher import FetchError, PoliteFetcher, _parse_retry_after


def _fetcher(handler, **kwargs) -> PoliteFetcher:
    defaults = {"min_interval": 0, "jitter": 0, "backoff_base": 0}
    return PoliteFetcher(transport=httpx.MockTransport(handler), **{**defaults, **kwargs})


async def test_retries_transient_failures_then_succeeds() -> None:
    statuses = iter([503, 429, 200])
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(next(statuses), text="ok")

    async with _fetcher(handler) as fetcher:
        assert await fetcher.get_text("https://example.test/") == "ok"
    assert calls == 3


async def test_retries_transport_errors() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls == 1:
            raise httpx.ConnectError("boom")
        return httpx.Response(200, text="ok")

    async with _fetcher(handler) as fetcher:
        assert await fetcher.get_text("https://example.test/") == "ok"
    assert calls == 2


async def test_non_retryable_status_fails_immediately() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(404)

    async with _fetcher(handler) as fetcher:
        with pytest.raises(FetchError, match="HTTP 404"):
            await fetcher.get_text("https://example.test/")
    assert calls == 1


async def test_gives_up_after_max_retries() -> None:
    calls = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        return httpx.Response(503)

    async with _fetcher(handler, max_retries=2) as fetcher:
        with pytest.raises(FetchError, match="giving up after 3 attempts"):
            await fetcher.get_text("https://example.test/")
    assert calls == 3


async def test_requests_are_spaced_by_min_interval() -> None:
    starts: list[float] = []

    def handler(request: httpx.Request) -> httpx.Response:
        starts.append(time.monotonic())
        return httpx.Response(200, text="ok")

    async with _fetcher(handler, min_interval=0.15) as fetcher:
        for _ in range(3):
            await fetcher.get_text("https://example.test/")

    gaps = [later - earlier for earlier, later in zip(starts, starts[1:], strict=False)]
    assert all(gap >= 0.15 for gap in gaps), gaps


def test_retry_after_floors_backoff() -> None:
    fetcher = PoliteFetcher(backoff_base=1.0, backoff_cap=60.0)
    assert fetcher._backoff_delay(0, retry_after=10.0) >= 10.0
    assert fetcher._backoff_delay(0, retry_after=500.0) == 60.0
    assert 0.0 <= fetcher._backoff_delay(3, retry_after=None) <= 8.0


@pytest.mark.parametrize(
    ("value", "expected"),
    [(None, None), ("5", 5.0), ("-1", None), ("Wed, 21 Oct 2026 07:28:00 GMT", None)],
)
def test_parse_retry_after(value, expected) -> None:
    assert _parse_retry_after(value) == expected
