from pathlib import Path

import pytest

from pricewatch.db.migrate import (
    DEFAULT_MIGRATIONS_DIR,
    MigrationError,
    _checksum,
    discover_migrations,
)


def test_repository_migrations_are_discovered() -> None:
    migrations = discover_migrations(DEFAULT_MIGRATIONS_DIR)
    assert migrations[0][0] == "0001"
    assert migrations[0][1].name == "0001_initial_schema.sql"


def test_migrations_are_ordered_by_version(tmp_path: Path) -> None:
    for name in ("0002_b.sql", "0010_c.sql", "0001_a.sql"):
        (tmp_path / name).write_text("SELECT 1;")
    assert [version for version, _ in discover_migrations(tmp_path)] == ["0001", "0002", "0010"]


def test_misnamed_migration_is_rejected(tmp_path: Path) -> None:
    (tmp_path / "add_table.sql").write_text("SELECT 1;")
    with pytest.raises(MigrationError, match="NNNN_name.sql"):
        discover_migrations(tmp_path)


def test_duplicate_version_is_rejected(tmp_path: Path) -> None:
    (tmp_path / "0001_a.sql").write_text("SELECT 1;")
    (tmp_path / "0001_b.sql").write_text("SELECT 1;")
    with pytest.raises(MigrationError, match="duplicate migration version 0001"):
        discover_migrations(tmp_path)


def test_checksum_ignores_line_endings() -> None:
    assert _checksum("a\nb\n") == _checksum("a\r\nb\r\n")
    assert _checksum("a\nb\n") != _checksum("a\nc\n")
