import csv
import re
from collections import defaultdict
from pathlib import Path


SRC = Path("/Users/priyansh/Projects/JalaSai/parts_catalog_seed_v2.csv")
OUT_ALL = Path("/Users/priyansh/Projects/JalaSai/final_catalogue.csv")
OUT_SAFE = Path("/Users/priyansh/Projects/JalaSai/safe_final_sku_candidates.csv")
OUT_REVIEW = Path("/Users/priyansh/Projects/JalaSai/manual_sku_review_queue.csv")
REPORT = Path("/Users/priyansh/Projects/JalaSai/final_catalogue_report.txt")


FAMILY_CODES = {
    "ACCESS": "ACC",
    "ACTIVA": "ACT",
    "ATHER": "ATH",
    "AVIATOR": "AVI",
    "BAJAJ": "BAJ",
    "BOXER": "BOX",
    "BULLET": "BLT",
    "BURGMAN": "BRG",
    "CALIBER": "CAL",
    "CBR": "CBR",
    "CBZ": "CBZ",
    "CDDAWN": "CDD",
    "CDDELUXE": "CDD",
    "DIO": "DIO",
    "DISCOVER": "DSC",
    "DREAMYUGA": "DRY",
    "EV": "EV",
    "FAZER": "FAZ",
    "FZ": "FZ",
    "GLAMOUR": "GLM",
    "HERO": "HER",
    "HFDLX": "HFD",
    "HONDA": "HON",
    "HUNK": "HNK",
    "INTRUDER": "INT",
    "JUPITER": "JUP",
    "KARIZMA": "KRZ",
    "KB100": "KB1",
    "KB4S": "KB4",
    "MAESTRO": "MAE",
    "NTORQ": "NTQ",
    "OLA": "OLA",
    "PASSION": "PAS",
    "PLATINA": "PLT",
    "PLEASURE": "PLS",
    "PULSAR": "PUL",
    "R15": "R15",
    "RAY": "RAY",
    "RONIN": "RON",
    "ROYALENFIELD": "REF",
    "RX100": "RX1",
    "RX135": "RX135",
    "SAMURAI": "SAM",
    "SHINE": "SHI",
    "SPLENDOR": "SPL",
    "STARCITY": "STC",
    "SUZUKI": "SUZ",
    "SWISH": "SWS",
    "THUNDERBIRD": "THB",
    "TVS": "TVS",
    "TWISTER": "TWS",
    "UNICORN": "UNI",
    "UNIVERSAL": "UNI",
    "VESPA": "VSP",
    "WEGO": "WEG",
    "XBLADE": "XBD",
    "XTREME": "XTR",
    "YAMAHA": "YAM",
}


PART_CODES = {
    "Accelerator Cable": "ACCB",
    "Air Filter": "AIRF",
    "Anabond": "ANAB",
    "Ball Bearings": "BEAR",
    "Blinker Assembly": "BLNK",
    "Brake Shoe": "BSHO",
    "Brake Side Lever": "BRLV",
    "Brake Switch": "BRSW",
    "CDI Unit": "CDI",
    "Center Stand": "CNST",
    "Chain Cover": "CHCV",
    "Chain Kit": "CHKT",
    "Choke Cable": "CHKC",
    "Clutch Roller Bush Kit": "CRBK",
    "Clutch Side Lever": "CLLV",
    "Clutch Switch": "CLSW",
    "Cover Muffler": "CVMF",
    "Disc Pad": "DPAD",
    "Dipper Button": "DPBT",
    "Drive Belt": "BELT",
    "Engine Oil": "ENGO",
    "Flasher": "FLSH",
    "Fog Light": "FOGL",
    "Fork Seal": "FKSL",
    "Front Brake Cable": "FBRC",
    "Gear Oil": "GROI",
    "Grease": "GRSE",
    "Handle Bar Switch": "HBSW",
    "Handle Lever": "HDLV",
    "Head Light Assembly": "HLAS",
    "Head Light Unit": "HLUN",
    "Horn Button": "HRBT",
    "Ignition Coil": "IGNC",
    "Ignition Switch": "IGSW",
    "Indicator Button": "INDB",
    "Lock Set": "LOCK",
    "Lucas Self Carbon": "LSCB",
    "Main Tube": "MTUB",
    "Mirror": "MIRR",
    "Mudguard": "MUDG",
    "Petrol Tap": "PTAP",
    "Rear Brake Cable": "RBRC",
    "Rear Brake Drum": "RBDR",
    "RR Unit": "RRUN",
    "Seal": "SEAL",
    "Seal Kit": "SKIT",
    "Self Bendex": "BNDX",
    "Self Button": "SLFB",
    "Self Motor": "SLFM",
    "Self Relay": "SLFR",
    "Shocker": "SHKR",
    "Shocker Oil": "SHKO",
    "Side Stand": "SDST",
    "Side Stand Assembly": "SSAS",
    "Spark Plug": "SPLG",
    "Speedometer Cable": "SPDC",
    "Steering Ball Racer": "STBR",
    "Tail Lens": "TLNS",
    "Tail Light Assembly": "TLAS",
    "Timing Chain": "TMCH",
    "Timing Chain Kit": "TMCK",
    "Tube": "TUBE",
    "Variator Plate": "VRPL",
    "Wheel Rim": "RIM",
}


FITMENT_TOKEN_MAP = {
    "Access Old Model": "OM",
    "Access New Model": "NM",
    "Access 125": "125",
    "Access BS6": "BS6",
    "Activa Old Model": "OM",
    "Activa New Model": "NM",
    "Activa HET": "HET",
    "Activa 110": "110",
    "Activa 125": "125",
    "Activa 3G": "3G",
    "Activa 4G": "4G",
    "Activa 5G": "5G",
    "Activa 6G": "6G",
    "Activa BS6": "BS6",
    "Aviator New Model": "NM",
    "Burgman": "BRG",
    "CB Shine": "CBSH",
    "Dio Old Model": "OM",
    "Dio New Model": "NM",
    "Jupiter BS6": "BS6",
    "Jupiter 125": "125",
    "Passion Pro": "PRO",
    "Passion Plus": "PLUS",
    "Shine BS6": "BS6",
    "Splendor Pro": "PRO",
    "Splendor Plus": "PLUS",
    "Splendor iSmart": "ISM",
    "Super Splendor": "SUP",
}


RAW_VARIANT_RULES = [
    (" FOAM ", "FOAM"),
    (" WHITE BOX", "WBX"),
    (" DIGITAL", "DIG"),
    (" COMBI", "CMB"),
    (" LOCKABL", "LCK"),
    (" HEAVY", "HVY"),
    (" PARKING", "PRK"),
    (" 4 PIN", "4P"),
    (" 5 PIN", "5P"),
    (" SILVER", "SLV"),
    (" BLACK", "BLK"),
    (" WHITE", "WHT"),
    (" GREY", "GRY"),
    (" BLUE", "BLU"),
    (" RED", "RED"),
    (" SHORT PLATE", "SPLT"),
]


def fitment_family(label: str) -> str:
    upper = label.upper()
    if upper.startswith("ACTIVA"):
        return "ACTIVA"
    if upper.startswith("ACCESS"):
        return "ACCESS"
    if upper.startswith("AVIATOR"):
        return "AVIATOR"
    if upper.startswith("BURGMAN"):
        return "BURGMAN"
    if upper.startswith("CB SHINE"):
        return "SHINE"
    if upper.startswith("DIO"):
        return "DIO"
    if upper.startswith("JUPITER"):
        return "JUPITER"
    if upper.startswith("PASSION"):
        return "PASSION"
    if upper.startswith("PLEASURE"):
        return "PLEASURE"
    if upper.startswith("SHINE"):
        return "SHINE"
    if upper.startswith("SPLENDOR"):
        return "SPLENDOR"
    if upper.startswith("SUPER SPLENDOR"):
        return "SPLENDOR"
    return upper.split()[0] if upper else ""


def family_code(family: str) -> str:
    return FAMILY_CODES.get(family, re.sub(r"[^A-Z0-9]", "", family.upper())[:3] or "GEN")


def part_code(name: str) -> str:
    return PART_CODES.get(name, re.sub(r"[^A-Z0-9]", "", name.upper())[:4] or "PART")


def tokenize_fitments(raw_fitments: str):
    labels = [item.strip() for item in raw_fitments.split("|") if item.strip()]
    tokens = []
    for label in labels:
        token = FITMENT_TOKEN_MAP.get(label)
        if token:
            tokens.append(token)
    ordered = []
    for token in tokens:
        if token not in ordered:
            ordered.append(token)
    return labels, ordered


def variant_tokens(row):
    text = f" {row['raw_description'].upper()} "
    found = []
    if row["supplier_part_number"].endswith("A") and "(A)" in text:
        found.append("A")
    if row["supplier_part_number"].endswith("B") and "(B)" in text:
        found.append("B")
    for needle, token in RAW_VARIANT_RULES:
        if needle in text and token not in found:
            found.append(token)
    return found


def build_internal_sku(row):
    fam = family_code(row["primary_family"])
    part = part_code(row["normalized_part_name"])
    _labels, fit_tokens = tokenize_fitments(row["fitment_models"])
    variants = variant_tokens(row)
    pieces = [fam, part]
    if fit_tokens:
        pieces.append("".join(fit_tokens)[:8])
    if variants:
        pieces.append("".join(variants)[:8])
    if row["side"]:
        pieces.append(row["side"])
    return "-".join(piece for piece in pieces if piece)


def needs_manual_review(row):
    reasons = [reason for reason in row["review_reason"].split("|") if reason]
    text = row["raw_description"].upper()
    fit_labels = [item for item in row["fitment_models"].split("|") if item]
    fit_families = {fitment_family(label) for label in fit_labels}
    if row["review_flag"] == "yes":
        return True, reasons
    if len(fit_families) > 1:
        reasons.append("mixed_fitment_families")
    if any(token in text for token in ["KTM", "BULE", " ALL MODEL", "ALL/"]):
        reasons.append("ambiguous_fitment_text")
    if "CB " in text and row["primary_family"] not in {"SHINE", "CBR", "CBZ"}:
        reasons.append("cb_family_review")
    return bool(reasons), reasons


rows = list(csv.DictReader(SRC.open(newline="", encoding="utf-8")))
final_rows = []

for row in rows:
    review, reasons = needs_manual_review(row)
    internal_sku = build_internal_sku(row)
    final_rows.append({
        "internal_sku": internal_sku,
        "catalog_status": "review" if review else "safe",
        "review_reason": "|".join(dict.fromkeys(reasons)),
        **row,
    })


# Mark collisions as review when the same internal SKU still maps to different item shapes.
sku_groups = defaultdict(list)
for row in final_rows:
    sku_groups[row["internal_sku"]].append(row)

for sku, group in sku_groups.items():
    if len(group) <= 1:
        continue
    signatures = {
        (
            row["normalized_part_name"],
            row["side"],
            row["fitment_models"],
            row["variant_tokens"],
        )
        for row in group
    }
    if len(signatures) <= 1:
        continue
    for row in group:
        reasons = [item for item in row["review_reason"].split("|") if item]
        if "sku_collision" not in reasons:
            reasons.append("sku_collision")
        row["review_reason"] = "|".join(reasons)
        row["catalog_status"] = "review"


safe_rows = [row for row in final_rows if row["catalog_status"] == "safe"]
review_rows = [row for row in final_rows if row["catalog_status"] == "review"]

fieldnames = [
    "internal_sku",
    "catalog_status",
    "review_reason",
    "review_flag",
    "supplier_part_number",
    "supplier_code_family",
    "raw_description",
    "normalized_part_name",
    "brand_bike",
    "primary_family",
    "fitment_models",
    "variant_tokens",
    "side",
    "net_rate_rs",
    "sku_seed",
]

for path, data in [(OUT_ALL, final_rows), (OUT_SAFE, safe_rows), (OUT_REVIEW, review_rows)]:
    with path.open("w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(data)

with REPORT.open("w", encoding="utf-8") as file:
    file.write("Final catalogue report\n")
    file.write("=====================\n")
    file.write(f"Total rows: {len(final_rows)}\n")
    file.write(f"Safe rows: {len(safe_rows)}\n")
    file.write(f"Review rows: {len(review_rows)}\n")
    file.write("\nGenerated files:\n")
    file.write(f"- {OUT_ALL.name}\n")
    file.write(f"- {OUT_SAFE.name}\n")
    file.write(f"- {OUT_REVIEW.name}\n")
