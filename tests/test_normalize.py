import pytest

from pricewatch.db.linking import reconcile_specs
from pricewatch.models import Category
from pricewatch.normalize import extract


@pytest.mark.parametrize(
    ("title", "model", "brand", "vram"),
    [
        (
            "VGA (การ์ดแสดงผล) INNO3D GEFORCE RTX 5070 TI X3 OC - 16GB GDDR7 (N507T3-16D7X-176068N)",
            "GeForce RTX 5070 Ti 16GB",
            "Inno3D",
            16,
        ),
        (
            "VGA(การ์ดจอ) GIGABYTE GEFORCE RTX 5060 TI WINDFORCE MAX OC 8G - 8GB GDDR7 (3Y)",
            "GeForce RTX 5060 Ti 8GB",
            "Gigabyte",
            8,
        ),
        (
            "การ์ดจอ Gigabyte Radeon RX 9070 XT Gaming OC 16G GDDR6 256-bit",
            "Radeon RX 9070 XT 16GB",
            "Gigabyte",
            16,
        ),
        (
            "การ์ดจอ PowerColor Reaper AMD Radeon RX 9060 XT 8GB GDDR6",
            "Radeon RX 9060 XT 8GB",
            "PowerColor",
            8,
        ),
    ],
)
def test_gpu_titles_from_three_stores(title: str, model: str, brand: str, vram: int) -> None:
    ex = extract(Category.GPU, title)
    assert (ex.model, ex.brand, ex.specs["vram_gb"]) == (model, brand, vram)


def test_workstation_gpus_are_not_linked() -> None:
    assert extract(Category.GPU, "การ์ดจอ LEADTEK NVIDIA Ampere RTX A1000 8GB GDDR6").model is None


@pytest.mark.parametrize(
    ("title", "model", "cores", "clock"),
    [
        ("CPU (ซีพียู) AMD AM5 RYZEN 7 9800X3D 4.7GHz 8C 16T (TRAY) (3Y)", "Ryzen 7 9800X3D", 8, 4.7),
        ("ซีพียู Intel Core i9-14900KS 3.20GHz 24C/32T LGA-1700", "Core i9-14900KS", 24, 3.2),
        ("ซีพียู AMD Ryzen 5 7500F 3.7-5.0MHz 6C/12T AM5", "Ryzen 5 7500F", 6, 3.7),
        ("CPU (ซีพียู) AMD RYZEN 5 5600 3.5 GHz (SOCKET AM4)", "Ryzen 5 5600", None, 3.5),
    ],
)
def test_cpu_titles(title: str, model: str, cores: int | None, clock: float) -> None:
    ex = extract(Category.CPU, title)
    assert ex.model == model
    assert ex.specs.get("cores") == cores
    assert ex.specs["base_clock_ghz"] == pytest.approx(clock)


@pytest.mark.parametrize(
    ("title", "model"),
    [
        (
            "32GB (16GBx2) DDR5 6000 MHz RAM (หน่วยความจำ) CORSAIR VENGEANCE RGB RS DDR5",
            "Corsair DDR5 32GB (2x16GB) 6000MHz",
        ),
        (
            "RAM (แรม) KINGBANK KJXS 16GB (16x1) DDR5 6000MHz SILVER (K5.01.FP05ED7201) (LT)",
            "Kingbank DDR5 16GB (1x16GB) 6000MHz",
        ),
        (
            "แรมพีซี Patriot Viper DDR5 16GB/5600MHz.CL40 (2x8GB) VENOM UDIMM KIT",
            "Patriot DDR5 16GB (2x8GB) 5600MHz",
        ),
    ],
)
def test_ram_kit_layouts_normalise(title: str, model: str) -> None:
    assert extract(Category.RAM, title).model == model


@pytest.mark.parametrize(
    ("title", "model", "nvme"),
    [
        (
            "2 TB SSD (เอสเอสดี) WD BLACK SN850X WITH HEATSINK - PCIe 4x4/NVMe M.2 2280",
            "WD SN850X 2TB",
            True,
        ),
        (
            "M.2 (เอสเอสดี) KINGSTON NV3 1TB PCIe 4/NVMe M.2 2280 (SNV3S/1000G) (5Y)",
            "Kingston NV3 1TB",
            True,
        ),
        (
            "1TB SSD (เอสเอสดี) CRUCIAL MX500 3D NAND SATA 2.5 INCH (CT1000MX500SSD)",
            "Crucial MX500 1TB",
            False,
        ),
        (
            "การ์ดเอสเอสดี ADATA 500GB Legend 860 SSD M.2 R5000MB/s W3000MB/s",
            "ADATA LEGEND 860 500GB",
            True,
        ),
    ],
)
def test_ssd_titles(title: str, model: str, nvme: bool) -> None:
    ex = extract(Category.SSD, title)
    assert ex.model == model
    assert ex.specs["nvme"] is nvme


def test_reconcile_specs_takes_median_and_fills_gaps() -> None:
    merged = reconcile_specs(
        [
            {"cores": 8, "base_clock_ghz": 4.7, "socket": "AM5"},
            {"base_clock_ghz": 4.2, "socket": "AM5"},
            {"cores": 8, "base_clock_ghz": 4.7, "socket": None},
        ]
    )
    assert merged == {"cores": 8, "base_clock_ghz": 4.7, "socket": "AM5"}
