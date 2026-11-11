"""Rule-based spec extraction and record linkage to canonical silicon models.

Merchant titles differ in language, order and abbreviation ("VGA(การ์ดจอ) MSI
GEFORCE RTX 5060 TI ... 8GB GDDR7" vs "การ์ดจอ ASUS Dual GeForce RTX 5060 Ti
8GB"). Each extractor pulls normalised attributes from the title and spec text
with category-specific regular expressions and derives a canonical key:

* GPU: GPU chip + VRAM (board partners are interchangeable silicon).
* CPU: exact processor model.
* RAM: DDR generation + kit layout + speed (plus module brand).
* SSD: brand + product line + capacity.

All extractors are O(len(title)) regex scans; linking n listings is O(n).
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any

from pricewatch.models import Category

_BRANDS: tuple[tuple[str, str], ...] = (
    # (pattern, display name); longer / more specific patterns first.
    (r"POWER\s*COLOR", "PowerColor"),
    (r"WESTERN\s*DIGITAL|\bWD\b", "WD"),
    (r"G\.?\s*SKILL", "G.Skill"),
    (r"T-?FORCE|TEAM\s*GROUP|\bTEAM\b", "TeamGroup"),
    (r"SILICON\s*POWER", "Silicon Power"),
    (r"V-?COLOR", "v-color"),
    (r"\bXPG\b|\bADATA\b", "ADATA"),
    (r"\bASUS\b|\bROG\b", "ASUS"),
    (r"\bMSI\b", "MSI"),
    (r"GIGABYTE|\bAORUS\b", "Gigabyte"),
    (r"\bZOTAC\b", "Zotac"),
    (r"\bGALAX\b", "Galax"),
    (r"\bINNO3D\b", "Inno3D"),
    (r"\bPALIT\b", "Palit"),
    (r"\bCOLORFUL\b", "Colorful"),
    (r"\bPNY\b", "PNY"),
    (r"\bSAPPHIRE\b", "Sapphire"),
    (r"\bASROCK\b", "ASRock"),
    (r"\bXFX\b", "XFX"),
    (r"\bMANLI\b", "Manli"),
    (r"\bLEADTEK\b", "Leadtek"),
    (r"\bARKTEK\b", "Arktek"),
    (r"\bGAINWARD\b", "Gainward"),
    (r"\bPELADN\b", "Peladn"),
    (r"\bYESTON\b", "Yeston"),
    (r"\bBIOSTAR\b", "Biostar"),
    (r"\bCORSAIR\b", "Corsair"),
    (r"\bKINGSTON\b|\bFURY\b", "Kingston"),
    (r"\bPATRIOT\b|\bVIPER\b", "Patriot"),
    (r"\bCRUCIAL\b", "Crucial"),
    (r"\bLEXAR\b", "Lexar"),
    (r"\bHIKSEMI\b", "Hiksemi"),
    (r"\bKINGBANK\b", "Kingbank"),
    (r"\bAPACER\b", "Apacer"),
    (r"\bSAMSUNG\b", "Samsung"),
    (r"\bSANDISK\b", "SanDisk"),
    (r"\bSEAGATE\b", "Seagate"),
    (r"\bPREDATOR\b|\bACER\b", "Acer"),
    (r"\bKLEVV\b", "Klevv"),
    (r"\bTRANSCEND\b", "Transcend"),
    (r"\bHP\b", "HP"),
    (r"\bBLACKBERRY\b", "Blackberry"),
    (r"\bNETAC\b", "Netac"),
    (r"\bMUSHKIN\b", "Mushkin"),
    (r"\bHIKVISION\b", "Hikvision"),
    (r"\bADDLINK\b", "Addlink"),
    (r"\bSOLIDIGM\b", "Solidigm"),
    (r"\bSYNOLOGY\b", "Synology"),
)
_BRAND_RES = tuple((re.compile(pattern, re.IGNORECASE), name) for pattern, name in _BRANDS)


@dataclass(frozen=True)
class Extracted:
    """Attributes parsed from one merchant listing.

    Attributes:
        brand: Product brand (board partner for GPUs), if recognised.
        manufacturer: Silicon maker for GPUs/CPUs, module brand for RAM/SSD.
        model: Canonical model name; listings sharing it are the same product
            for comparison purposes. ``None`` when the title is not understood.
        specs: Numeric/categorical attributes for the ML feature matrix.
        excluded: The listing is deliberately out of scope (workstation GPU,
            notebook RAM), as opposed to merely not understood: neither rules
            nor similarity matching may link it.
    """

    brand: str | None
    manufacturer: str | None
    model: str | None
    specs: dict[str, Any] = field(default_factory=dict)
    excluded: bool = False


def find_brand(text: str) -> str | None:
    """Return the first known brand mentioned in ``text``.

    Brands are searched after stripping the leading category word so that
    e.g. "การ์ดจอ" never shadows the real brand.
    """
    best: tuple[int, str] | None = None
    for regex, name in _BRAND_RES:
        match = regex.search(text)
        if match and (best is None or match.start() < best[0]):
            best = (match.start(), name)
    return best[1] if best else None


def _num(text: str) -> float:
    return float(text.replace(",", ""))


# --------------------------------------------------------------------- GPU --

_NVIDIA_RE = re.compile(
    r"\b(RTX|GTX|GT)\s*-?\s*(\d{3,4})\s*(TI\s*SUPER|TI|SUPER)?\b", re.IGNORECASE
)
_AMD_GPU_RE = re.compile(r"\bRX\s*-?\s*(\d{4})\s*(XTX|XT|GRE)?\b", re.IGNORECASE)
_INTEL_GPU_RE = re.compile(r"\bARC\s*([AB]\d{3})\b", re.IGNORECASE)
_VRAM_RE = re.compile(r"\b(\d{1,2})\s*G(?:B)?\s*(?:GDDR|-?\s*GDDR)", re.IGNORECASE)
# ASUS part-number style "O8G" / "O16G" (factory OC, 8 GB): "DUAL-RTX5060-O8G".
_VRAM_ASUS_RE = re.compile(r"\bO(\d{1,2})G\b", re.IGNORECASE)
_VRAM_FALLBACK_RE = re.compile(r"\b(\d{1,2})\s*GB?\b", re.IGNORECASE)
_MEMTYPE_RE = re.compile(r"\b(GDDR\dX?)\b", re.IGNORECASE)
_BUS_RE = re.compile(r"\b(\d{2,3})\s*-?\s*BIT\b", re.IGNORECASE)
_CUDA_RE = re.compile(r"(?:CUDA|Stream)[^:\n]*:\s*([\d,]{3,6})", re.IGNORECASE)
_BOOST_RE = re.compile(r"Boost(?:\s*Clock)?\s*:?\s*(\d{3,4})\s*MHz", re.IGNORECASE)
# Workstation / pro cards: priced for certification and support, not specs, so
# they would distort the consumer fair-value model. Explicitly excluded.
_WORKSTATION_RE = re.compile(
    r"QUADRO|RADEON\s*(?:AI\s*)?PRO|\bWX\s*\d{3,4}\b|\bW\d{4}\b|\bRTX\s*(?:PRO|A\d{3,4})\b"
    r"|\bARC\s*PRO\b|\bNVIDIA\s+(?:A\d{3,4}|T\d{3,4}|P\d{4})\b",
    re.IGNORECASE,
)


def extract_gpu(title: str, spec_text: str | None = None) -> Extracted:
    """Parse a graphics card listing into chip, VRAM and board attributes."""
    text = f"{title}\n{spec_text or ''}"
    brand = find_brand(title)
    specs: dict[str, Any] = {}
    if (bus := _BUS_RE.search(text)) is not None:
        specs["bus_width_bit"] = int(bus.group(1))
    if (cuda := _CUDA_RE.search(text)) is not None:
        specs["shader_cores"] = int(_num(cuda.group(1)))
    if (boost := _BOOST_RE.search(text)) is not None:
        specs["boost_clock_mhz"] = int(boost.group(1))
    if (mem := _MEMTYPE_RE.search(text)) is not None:
        specs["memory_type"] = mem.group(1).upper()
    vram = _VRAM_RE.search(text) or _VRAM_ASUS_RE.search(title) or _VRAM_FALLBACK_RE.search(title)
    if vram is not None and 1 <= int(vram.group(1)) <= 48:
        specs["vram_gb"] = int(vram.group(1))

    if _WORKSTATION_RE.search(title):
        return Extracted(brand, None, None, specs, excluded=True)

    chip: str | None = None
    maker: str | None = None
    if (m := _NVIDIA_RE.search(title)) is not None:
        suffix = re.sub(r"\s+", " ", (m.group(3) or "").title()).replace("Ti Super", "Ti Super")
        chip = f"GeForce {m.group(1).upper()} {m.group(2)}" + (f" {suffix}" if suffix else "")
        maker = "NVIDIA"
        specs["tier"] = int(m.group(2))
    elif (m := _AMD_GPU_RE.search(title)) is not None:
        chip = f"Radeon RX {m.group(1)}" + (f" {m.group(2).upper()}" if m.group(2) else "")
        maker = "AMD"
        specs["tier"] = int(m.group(1))
    elif (m := _INTEL_GPU_RE.search(title)) is not None:
        chip = f"Arc {m.group(1).upper()}"
        maker = "Intel"
    if chip is None:
        return Extracted(brand, None, None, specs)
    specs["chip"] = chip
    model = f"{chip} {specs['vram_gb']}GB" if "vram_gb" in specs else None
    return Extracted(brand, maker, model, specs)


# --------------------------------------------------------------------- CPU --

_INTEL_CORE_RE = re.compile(r"\bCORE\s*I([3579])\s*-?\s*(\d{4,5}[A-Z]{0,3})\b", re.IGNORECASE)
_INTEL_ULTRA_RE = re.compile(r"\bCORE\s*ULTRA\s*([3579])\s*-?\s*(\d{3}[A-Z]{0,3})\b", re.IGNORECASE)
_INTEL_OTHER_RE = re.compile(r"\b(PENTIUM|CELERON)\s*(?:GOLD\s*)?(G?\d{4}[A-Z]?)\b", re.IGNORECASE)
_RYZEN_RE = re.compile(
    # "RYZEN 7 AI 8700G" (IT City) names the desktop 8700G; the "AI" is marketing.
    r"\bRYZEN\s*(THREADRIPPER\s*(?:PRO\s*)?|[3579]\s*(?:PRO\s*)?)?(?:AI\s*)?(\d{4}[A-Z0-9]{0,4})\b",
    re.IGNORECASE,
)
_CORES_THREADS_RE = re.compile(r"\b(\d{1,3})\s*C\s*[/\s]\s*(\d{1,3})\s*T\b", re.IGNORECASE)
_CLOCK_RE = re.compile(r"(\d{1,2}(?:\.\d{1,2})?)\s*(?:-\s*\d{1,2}(?:\.\d{1,2})?\s*)?(G|M)HZ", re.I)
_SOCKET_RE = re.compile(r"\b(AM[45]|LGA\s*-?\s*1[78]\d{2}|1700|1851|STR5|sTR5)\b", re.IGNORECASE)
_CACHE_RE = re.compile(r"\b(\d{2,3})\s*MB\b", re.IGNORECASE)


def extract_cpu(title: str, spec_text: str | None = None) -> Extracted:
    """Parse a processor listing into model, cores, threads and base clock."""
    text = f"{title}\n{spec_text or ''}"
    specs: dict[str, Any] = {}
    if (ct := _CORES_THREADS_RE.search(text)) is not None:
        specs["cores"], specs["threads"] = int(ct.group(1)), int(ct.group(2))
    if (clock := _CLOCK_RE.search(title)) is not None:
        value = float(clock.group(1))
        # Merchants occasionally write "3.7-5.0MHz"; a value under 10 is GHz.
        specs["base_clock_ghz"] = value if value < 10 else value / 1000
    if (socket := _SOCKET_RE.search(text)) is not None:
        raw = re.sub(r"[\s-]", "", socket.group(1).upper())
        specs["socket"] = f"LGA{raw}" if raw.isdigit() else raw
    if (cache := _CACHE_RE.search(title)) is not None:
        specs["cache_mb"] = int(cache.group(1))

    model: str | None = None
    maker: str | None = None
    if (m := _INTEL_ULTRA_RE.search(title)) is not None:
        model, maker = f"Core Ultra {m.group(1)} {m.group(2).upper()}", "Intel"
    elif (m := _INTEL_CORE_RE.search(title)) is not None:
        model, maker = f"Core i{m.group(1)}-{m.group(2).upper()}", "Intel"
        specs["generation"] = int(m.group(2)[:2]) if len(m.group(2)) >= 5 else int(m.group(2)[0])
    elif (m := _INTEL_OTHER_RE.search(title)) is not None:
        model, maker = f"{m.group(1).title()} {m.group(2).upper()}", "Intel"
    elif (m := _RYZEN_RE.search(title)) is not None:
        family = re.sub(r"\s+", " ", (m.group(1) or "").strip().title())
        number = m.group(2).upper()
        if family.startswith("Threadripper"):
            model = f"Ryzen {family} {number}"
        else:
            tier = family.split()[0] if family else ""
            model = f"Ryzen {tier} {number}".replace("  ", " ")
        maker = "AMD"
        specs["generation"] = int(number[0])
    if model is not None:
        specs["x3d"] = "X3D" in model
        specs["unlocked"] = bool(re.search(r"\d(K|KF|KS|X|X3D)\b", model))
        specs["has_igpu"] = not bool(re.search(r"\d+F\b|KF\b", model)) and (
            maker == "Intel" or bool(re.search(r"\d+G\b|GT\b", model)) or specs["generation"] >= 7
        )
    return Extracted(maker, maker, model, specs)


# --------------------------------------------------------------------- RAM --

_DDR_RE = re.compile(r"\bDDR([345])\b", re.IGNORECASE)
# "(2x8GB)", "(16GBx2)" and IT City's "(8X2/3200)" (module GB x count / speed).
_KIT_RE = re.compile(
    r"\(\s*(\d{1,3})\s*(?:GB)?\s*[xX×]\s*(\d{1,3})\s*(?:GB)?\s*(?:/\s*\d{4}\s*)?\)"
)
_TOTAL_GB_RE = re.compile(r"\b(\d{1,3})\s*GB\b", re.IGNORECASE)
_SPEED_RE = re.compile(r"\b(\d{4})\s*(?:MHz|MT/?s|Mbps)", re.IGNORECASE)
_SPEED_SLASH_RE = re.compile(r"/\s*(\d{4})\b")
# A bare JEDEC/XMP data rate ("DDR4 16GB 3200 (16x1)"); restricted to the
# standard bins so model codes and capacities are never mistaken for a speed.
_SPEED_BARE_RE = re.compile(
    r"\b(2133|2400|2666|2933|3000|3200|3600|4000|4800|5200|5600|6000|6400|6800|7200|7600|8000)\b"
)
_CL_RE = re.compile(r"\bCL\s*(\d{2})\b", re.IGNORECASE)
# Laptop modules and pre-DDR4 generations are out of scope: desktop kits only.
_RAM_OUT_OF_SCOPE_RE = re.compile(
    r"SO-?DIMM|NOTEBOOK|โน้ตบุ๊ค|โน้ตบุ๊ก|\bNB\b|\bDDR[12]\b|\bDDR3L?\b", re.IGNORECASE
)


def extract_ram(title: str, spec_text: str | None = None) -> Extracted:
    """Parse a memory kit listing into DDR generation, layout and speed."""
    text = f"{title}\n{spec_text or ''}"
    brand = find_brand(title)
    if _RAM_OUT_OF_SCOPE_RE.search(title):
        return Extracted(brand, brand, None, {}, excluded=True)
    specs: dict[str, Any] = {}
    ddr = _DDR_RE.search(text)
    total = _TOTAL_GB_RE.search(title)
    speed = _SPEED_RE.search(title) or _SPEED_SLASH_RE.search(title) or _SPEED_BARE_RE.search(title)
    if ddr is not None:
        specs["ddr"] = int(ddr.group(1))
    if speed is not None:
        specs["speed_mhz"] = int(speed.group(1))
    if (cl := _CL_RE.search(text)) is not None:
        specs["cas_latency"] = int(cl.group(1))
    total_gb = int(total.group(1)) if total else None
    kit = _KIT_RE.search(title)
    if kit is not None:
        a, b = int(kit.group(1)), int(kit.group(2))
        # "(16GBx2)" and "(2x8GB)" both occur: the module count is the smaller
        # factor whose product matches the stated total.
        count, size = (min(a, b), max(a, b)) if a * b == (total_gb or a * b) else (b, a)
        if total_gb is None:
            total_gb = count * size
        specs["modules"], specs["module_gb"] = count, size
    if total_gb is not None:
        specs["capacity_gb"] = total_gb
        specs.setdefault("modules", 1)
        specs.setdefault("module_gb", total_gb)
    if not {"ddr", "capacity_gb", "speed_mhz"} <= specs.keys():
        return Extracted(brand, brand, None, specs)
    layout = f"{specs['modules']}x{specs['module_gb']}GB"
    model = f"DDR{specs['ddr']} {specs['capacity_gb']}GB ({layout}) {specs['speed_mhz']}MHz"
    if brand:
        model = f"{brand} {model}"
    return Extracted(brand, brand, model, specs)


# --------------------------------------------------------------------- SSD --

# "512G" / "1T" without the B occur too (HIKSEMI on IT City).
_CAPACITY_RE = re.compile(r"\b(\d+(?:\.\d+)?)\s*(TB?|GB?)\b", re.IGNORECASE)
_PCIE_GEN_RE = re.compile(
    r"(?:GEN\s*|PCI\s*-?\s*e\s*(?:GEN\s*)?)([345])(?:\.0)?(?:\s*x\s*\d)?", re.I
)
_READ_RE = re.compile(r"\b(?:R|Read)\s*:?\s*(\d{3,5})\s*MB", re.IGNORECASE)
_SSD_LINE_RE = re.compile(
    r"\b(SN\d{3,4}X?|9[89]0\s*PRO(?:\s*PLUS)?|9[89]0\s*EVO(?:\s*PLUS)?|870\s*EVO|870\s*QVO|"
    r"NV[1-3]|KC3000|A2000|RENEGADE(?:\s*G5)?|MP\d{3,4}|P\d{3}|NM\d{3,4}|NQ\d{3,4}|"
    r"LEGEND\s*\d{3}|GAMMIX\s*S\d{2}|SU\d{3}|S\d{2}|GM\d{1,2}|AS\d{3}|T500|T700|P3\s*PLUS|P3|P5\s*PLUS|"
    r"OPTIMUS\s*(?:GX\s*)?(?:PRO\s*)?\d{3,4}[MX]?|BLUE\s*SN\d{4}|FX\d{3}|CC\d{3}|A\d{3,4}|"
    r"BX500|MX500|SA510|9100\s*PRO|FUTURE(?:\s*LITE|\s*ECO)?|WAVE(?:\s*PRO)?|E\d{3,4}|"
    r"SP\d{3}|XD\d{3}|SL\d{3}|SX\d{4}(?:\s*LITE)?|MARS\s*\d{3}|KC3000D?|S9\d|CN\d{3}|"
    r"C910G?|SPATIUM\s*M\d{3}|AORUS\s*GEN\d)\b",
    re.IGNORECASE,
)
# Fallback product code: the first token after the brand mixing letters and
# digits that is not a capacity, interface, form-factor or throughput figure.
_SSD_CODE_RE = re.compile(r"\b(?=[A-Z0-9]*[A-Z])(?=[A-Z0-9]*\d)[A-Z0-9]{3,12}\b", re.IGNORECASE)
_SSD_CODE_STOP = re.compile(
    r"^(?:\d+(?:GB|TB|G|T)|GEN\d.*|PCIE\d*|PCLE\d*|NVME|M2|SATA\d*|R\d+MB|W\d+MB|"
    r"\d+Y(?:EAR)?|\d+X\d+|X\d|2280|2230|2242|3D|TLC|QLC)$",
    re.IGNORECASE,
)


def _ssd_line(title: str, brand: str) -> str | None:
    """Return the product line: a known name, else the first plausible code."""
    if (line := _SSD_LINE_RE.search(title)) is not None:
        name = re.sub(r"\s+", " ", line.group(1).upper())
        # "OPTIMUS GX 7100" and "OPTIMUS GX7100" are one line (found by the
        # similarity duplicate report): glue short letter prefixes to digits.
        return re.sub(r"\b([A-Z]{1,3}) (\d)", r"\1\2", name)
    brand_end = 0
    for regex, name in _BRAND_RES:
        if name == brand and (match := regex.search(title)) is not None:
            brand_end = match.end()
            break
    for token in _SSD_CODE_RE.finditer(title[brand_end:]):
        if not _SSD_CODE_STOP.match(token.group(0)):
            return token.group(0).upper()
    return None


def _capacity_gb(text: str) -> float | None:
    for match in _CAPACITY_RE.finditer(text):
        value = _num(match.group(1)) * (1000 if match.group(2).upper().startswith("T") else 1)
        if 120 <= value <= 16000:  # Ignores "R5000MB/s" style throughput figures.
            return value
    return None


def extract_ssd(title: str, spec_text: str | None = None) -> Extracted:
    """Parse a solid-state drive listing into capacity, interface and line."""
    text = f"{title}\n{spec_text or ''}"
    brand = find_brand(title)
    specs: dict[str, Any] = {}
    capacity = _capacity_gb(title)
    if capacity is not None:
        specs["capacity_gb"] = int(capacity)
    upper = text.upper()
    if (read := _READ_RE.search(text)) is not None:
        specs["read_mbps"] = int(read.group(1))
    # SATA III tops out near 560 MB/s, so a faster drive must be NVMe even
    # when the title only states throughput.
    specs["nvme"] = (
        "NVME" in upper or "PCIE" in upper or "PCLE" in upper or specs.get("read_mbps", 0) > 600
    )
    specs["form_factor"] = "M.2" if ("M.2" in upper or "การ์ดเอสเอสดี" in text) else "2.5"
    if (gen := _PCIE_GEN_RE.search(text)) is not None and specs["nvme"]:
        specs["pcie_gen"] = int(gen.group(1))
    elif specs["nvme"]:
        specs["pcie_gen"] = None
    line_name = _ssd_line(title, brand) if brand is not None else None
    if brand is None or line_name is None or capacity is None:
        return Extracted(brand, brand, None, specs)
    size = f"{int(capacity // 1000)}TB" if capacity >= 1000 else f"{int(capacity)}GB"
    return Extracted(brand, brand, f"{brand} {line_name} {size}", specs)


_TRADEMARKS_RE = re.compile(r"[™®©]")

EXTRACTORS = {
    Category.GPU: extract_gpu,
    Category.CPU: extract_cpu,
    Category.RAM: extract_ram,
    Category.SSD: extract_ssd,
}


def extract(category: Category, title: str, spec_text: str | None = None) -> Extracted:
    """Dispatch to the extractor for ``category``.

    Trademark signs are dropped first: "GeForce RTX™ 5070" must read as
    "RTX 5070" for the chip patterns' word boundaries to hold.
    """
    return EXTRACTORS[category](_TRADEMARKS_RE.sub("", title), spec_text)
