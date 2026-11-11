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


@pytest.mark.parametrize(
    ("category", "title", "model"),
    [
        # IT City writes kits as "(module GB x count / speed)".
        (
            Category.RAM,
            "CORSAIR VENGEANCE LPX 16GB(16X1/3200) DDR4 BK (CMK16GX4M1E3200C16)",
            "Corsair DDR4 16GB (1x16GB) 3200MHz",
        ),
        (
            Category.RAM,
            "KINGSTON FURY BEAST 32GB (2x16/5600) DDR5 (KF556C40BBK2-32) Ram",
            "Kingston DDR5 32GB (2x16GB) 5600MHz",
        ),
        (
            Category.RAM,
            "APACER NOX WHITE DDR4 16GB 3200 (16x1) AH4U16G32C28YMWAA-1 Ram",
            "Apacer DDR4 16GB (1x16GB) 3200MHz",
        ),
        (Category.GPU, "ASUS DUAL GEFORCE RTX 5060 O8G GDDR7 GPU", "GeForce RTX 5060 8GB"),
        (
            Category.GPU,
            "ASUS TUF Gaming GeForce RTX™ 5070 Ti OC Edition 16GB GDDR7 (3Y) GPU",
            "GeForce RTX 5070 Ti 16GB",
        ),
        (Category.CPU, "AMD RYZEN 7 AI 8700G (8Cores/16Threads) AM5 (3Y) CPU", "Ryzen 7 8700G"),
        (
            Category.SSD,
            "HIKSEMI FUTURE 512G M.2 NVMe PCIE4 : HS-SSD-FUTURE 512G (5Y)",
            "Hiksemi FUTURE 512GB",
        ),
    ],
)
def test_itcity_title_conventions(category: Category, title: str, model: str) -> None:
    assert extract(category, title).model == model


@pytest.mark.parametrize(
    ("category", "title"),
    [
        (Category.GPU, "VGA (การ์ดแสดงผล) LEADTEK NVIDIA RTX PRO 6000 BLACKWELL - 96GB GDDR7"),
        (Category.GPU, "VGA (การ์ดแสดงผล) SAPPHIRE AMD RADEON AI PRO R9700 32GB GDDR6"),
        (Category.GPU, "VGA (การ์ดแสดงผล) INTEL ARC PRO B70 - 32GB GDDR6"),
        (Category.GPU, "VGA (การ์ดแสดงผล) LEADTEK NVIDIA T400 4GB - 4GB GDDR6"),
        (Category.GPU, "การ์ดจอ AMD VGA RADEON PRO WX2100 2GB GDDR5 64-bit"),
        (Category.RAM, "RAM NOTEBOOK (แรมโน้ตบุ๊ค) CRUCIAL 16GB DDR5-4800 SODIMM CL40"),
        (Category.RAM, "8GB (8GBx1) DDR3L 1600MHz RAM (หน่วยความจำ) KINGSTON VALUE RAM"),
        (Category.RAM, "2 GB RAM PC DDR2/800 KINGMAX"),
    ],
)
def test_out_of_scope_listings_are_marked_excluded(category: Category, title: str) -> None:
    ex = extract(category, title)
    assert ex.excluded and ex.model is None


def test_consumer_parts_are_not_excluded() -> None:
    assert not extract(Category.GPU, "ASUS DUAL RTX 5060 8GB GDDR7").excluded
    assert not extract(Category.RAM, "CORSAIR 32GB (16GBx2) DDR5 6000MHz").excluded


def test_ssd_line_spacing_is_canonical() -> None:
    a = extract(Category.SSD, "SANDISK OPTIMUS GX 7100 1TB M.2 PCIe 4 NVMe").model
    b = extract(Category.SSD, "SANDISK OPTIMUS GX7100 1TB M.2 PCIe 4 NVMe").model
    assert a == b == "SanDisk OPTIMUS GX7100 1TB"


def test_ssd_line_keeps_words_before_digits_apart() -> None:
    ex = extract(Category.SSD, "SANDISK OPTIMUS GX PRO 850X 8TB M.2 PCIe 4 NVMe")
    assert ex.model == "SanDisk OPTIMUS GX PRO 850X 8TB"
