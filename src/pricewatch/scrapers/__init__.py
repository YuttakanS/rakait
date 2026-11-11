"""Store scrapers and the registry mapping merchant slugs to them."""

from __future__ import annotations

from pricewatch.scrapers.banana import BananaScraper
from pricewatch.scrapers.base import StoreScraper
from pricewatch.scrapers.fetcher import FetchError, PoliteFetcher
from pricewatch.scrapers.ihavecpu import IhavecpuScraper
from pricewatch.scrapers.itcity import ItcityScraper
from pricewatch.scrapers.jib import JibScraper

SCRAPERS: dict[str, type[StoreScraper]] = {
    JibScraper.merchant: JibScraper,
    IhavecpuScraper.merchant: IhavecpuScraper,
    BananaScraper.merchant: BananaScraper,
    ItcityScraper.merchant: ItcityScraper,
}

__all__ = [
    "SCRAPERS",
    "BananaScraper",
    "FetchError",
    "IhavecpuScraper",
    "ItcityScraper",
    "JibScraper",
    "PoliteFetcher",
    "StoreScraper",
]
