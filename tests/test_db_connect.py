import pytest

from pricewatch import db


@pytest.mark.parametrize(
    ("url", "cache_size"),
    [
        ("postgresql://u:p@aws-0-x.pooler.supabase.com:6543/postgres", 0),
        ("postgresql://u:p@aws-0-x.pooler.supabase.com:5432/postgres", 100),
        ("postgresql://u:p@localhost/pricewatch", 100),
    ],
)
async def test_statement_cache_disabled_only_behind_transaction_pooler(
    monkeypatch: pytest.MonkeyPatch, url: str, cache_size: int
) -> None:
    seen: dict[str, object] = {}

    async def fake_connect(dsn: str, **kwargs: object) -> str:
        seen.update(kwargs)
        return "conn"

    monkeypatch.setattr(db.asyncpg, "connect", fake_connect)
    assert await db.connect(url) == "conn"
    assert seen["statement_cache_size"] == cache_size
