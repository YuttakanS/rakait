"""Pydantic schemas shared by the scraping and persistence layers."""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from enum import Enum

from pydantic import BaseModel, ConfigDict, Field, HttpUrl


class Category(str, Enum):
    """Hardware categories tracked by the platform."""

    GPU = "gpu"
    CPU = "cpu"
    RAM = "ram"
    SSD = "ssd"


class ScrapedListing(BaseModel):
    """One merchant product card as observed during a single scrape.

    Attributes:
        merchant: Merchant slug, matching ``merchants.slug``.
        merchant_sku: The merchant's own stable product identifier.
        category: Hardware category the listing was scraped from.
        title: Raw product title as shown by the merchant.
        url: Product page URL.
        spec_text: Raw spec bullet text, newline separated, if shown.
        price: Listed price in THB, or ``None`` when the merchant shows none.
        view_count: Cumulative page views reported by the merchant.
        sold_count: Cumulative units sold reported by the merchant.
        in_stock: Whether the listing can currently be bought.
        scraped_at: Timezone-aware observation timestamp.
    """

    model_config = ConfigDict(frozen=True)

    merchant: str
    merchant_sku: str = Field(min_length=1)
    category: Category
    title: str = Field(min_length=1)
    url: HttpUrl
    spec_text: str | None = None
    price: Decimal | None = Field(default=None, ge=0)
    view_count: int | None = Field(default=None, ge=0)
    sold_count: int | None = Field(default=None, ge=0)
    in_stock: bool
    scraped_at: datetime
