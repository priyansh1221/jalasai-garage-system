import csv
import re
from pathlib import Path


SRC = Path("/Users/priyansh/Projects/JalaSai/parts_catalog_reviewed.csv")
OUT = Path("/Users/priyansh/Projects/JalaSai/parts_catalog_seed_v2.csv")
REPORT = Path("/Users/priyansh/Projects/JalaSai/parts_catalog_seed_v2_report.txt")


MODEL_ALIASES = [
    ("ACTIVA 6G", "Activa 6G", "ACTIVA"),
    ("ACTIVA 5G", "Activa 5G", "ACTIVA"),
    ("ACTIVA 4G", "Activa 4G", "ACTIVA"),
    ("ACTIVA 3G", "Activa 3G", "ACTIVA"),
    ("ACTIVA BS6", "Activa BS6", "ACTIVA"),
    ("ACTIVA HET", "Activa HET", "ACTIVA"),
    ("ACTIVA 125", "Activa 125", "ACTIVA"),
    ("ACTIVA 110", "Activa 110", "ACTIVA"),
    ("ACTIVA N/M", "Activa New Model", "ACTIVA"),
    ("ACTIVA O/M", "Activa Old Model", "ACTIVA"),
    ("ACTIVA", "Activa", "ACTIVA"),
    ("ACCESS 125", "Access 125", "ACCESS"),
    ("ACCESS BS6", "Access BS6", "ACCESS"),
    ("ACCESS N/M", "Access New Model", "ACCESS"),
    ("ACCESS O/M", "Access Old Model", "ACCESS"),
    ("ACCESS", "Access", "ACCESS"),
    ("AVIATOR N/M", "Aviator New Model", "AVIATOR"),
    ("AVIATOR", "Aviator", "AVIATOR"),
    ("BURGMAN STREET", "Burgman Street", "BURGMAN"),
    ("BURGMAN", "Burgman", "BURGMAN"),
    ("CB SHINE", "CB Shine", "SHINE"),
    ("CBR 150", "CBR 150", "CBR"),
    ("CBZ XTREEME", "CBZ Xtreme", "CBZ"),
    ("CBZ XTR", "CBZ Xtreme", "CBZ"),
    ("CD DLX", "CD Deluxe", "CDDELUXE"),
    ("CD DAWN", "CD Dawn", "CDDAWN"),
    ("DIO N/M", "Dio New Model", "DIO"),
    ("DIO O/M", "Dio Old Model", "DIO"),
    ("DIO", "Dio", "DIO"),
    ("DISCOVER", "Discover", "DISCOVER"),
    ("DREAM YUGA", "Dream Yuga", "DREAMYUGA"),
    ("FAZER", "Fazer", "FAZER"),
    ("FZ-16", "FZ-16", "FZ"),
    ("FZ16", "FZ-16", "FZ"),
    ("FZ", "FZ", "FZ"),
    ("GLAMOUR BS6", "Glamour BS6", "GLAMOUR"),
    ("GLAMOUR", "Glamour", "GLAMOUR"),
    ("HF DLX", "HF Deluxe", "HFDLX"),
    ("HF DELUXE", "HF Deluxe", "HFDLX"),
    ("HUNK", "Hunk", "HUNK"),
    ("I SMART", "Splendor iSmart", "SPLENDOR"),
    ("INTRUDER", "Intruder", "INTRUDER"),
    ("JUPITER CLASSIC", "Jupiter Classic", "JUPITER"),
    ("JUPITER 125", "Jupiter 125", "JUPITER"),
    ("JUPITER BS6", "Jupiter BS6", "JUPITER"),
    ("JUPITER", "Jupiter", "JUPITER"),
    ("KARIZMA", "Karizma", "KARIZMA"),
    ("KB100", "KB100", "KB100"),
    ("KB4S", "KB4S", "KB4S"),
    ("MAESTRO EDGE", "Maestro Edge", "MAESTRO"),
    ("MAESTRO", "Maestro", "MAESTRO"),
    ("NTORQ", "Ntorq", "NTORQ"),
    ("OLA S1 PRO", "Ola S1 Pro", "OLA"),
    ("OLA ELECTRIC", "Ola Electric", "OLA"),
    ("OLA", "Ola", "OLA"),
    ("PASSION PRO", "Passion Pro", "PASSION"),
    ("PASS PRO", "Passion Pro", "PASSION"),
    ("PASSION PLUS", "Passion Plus", "PASSION"),
    ("PASSION +", "Passion Plus", "PASSION"),
    ("PASSION", "Passion", "PASSION"),
    ("PLATINA", "Platina", "PLATINA"),
    ("PLEASURE", "Pleasure", "PLEASURE"),
    ("PULSAR 220", "Pulsar 220", "PULSAR"),
    ("PULSAR 180", "Pulsar 180", "PULSAR"),
    ("PULSAR N 160", "Pulsar N160", "PULSAR"),
    ("PULSAR", "Pulsar", "PULSAR"),
    ("R15 V3", "R15 V3", "R15"),
    ("RAY", "Ray", "RAY"),
    ("RONIN", "Ronin", "RONIN"),
    ("RX 100", "RX 100", "RX100"),
    ("RX 135", "RX 135", "RX135"),
    ("SAMURAI", "Samurai", "SAMURAI"),
    ("SHINE BS6", "Shine BS6", "SHINE"),
    ("SHINE", "Shine", "SHINE"),
    ("SPL I SMART", "Splendor iSmart", "SPLENDOR"),
    ("SPL IS", "Splendor iSmart", "SPLENDOR"),
    ("SPL PRO", "Splendor Pro", "SPLENDOR"),
    ("SPL+", "Splendor Plus", "SPLENDOR"),
    ("SPL +", "Splendor Plus", "SPLENDOR"),
    ("SPLDR PLUS", "Splendor Plus", "SPLENDOR"),
    ("SPLENDOR PLUS", "Splendor Plus", "SPLENDOR"),
    ("SPLENDOR", "Splendor", "SPLENDOR"),
    ("STAR CITY", "Star City", "STARCITY"),
    ("SUP SPL", "Super Splendor", "SPLENDOR"),
    ("SUPER SPLENDOR", "Super Splendor", "SPLENDOR"),
    ("SWISH 125", "Swish 125", "SWISH"),
    ("SWISS 125", "Swish 125", "SWISH"),
    ("THUNDERBIRD", "Thunderbird", "THUNDERBIRD"),
    ("TWISTER", "Twister", "TWISTER"),
    ("UNICORN", "Unicorn", "UNICORN"),
    ("VESPA", "Vespa", "VESPA"),
    ("WEGO", "Wego", "WEGO"),
    ("X-BLADE", "X-Blade", "XBLADE"),
    ("XTREME", "Xtreme", "XTREME"),
    ("YUGA", "Dream Yuga", "DREAMYUGA"),
]


CATEGORY_PATTERNS = [
    ("DISC PAD", ("Disc Pad", "DISCPAD")),
    ("BRAKE SHOE", ("Brake Shoe", "BRAKESHOE")),
    ("SPEEDOMETER CABLE", ("Speedometer Cable", "SPDCABLE")),
    ("ACCELERATOR CABLE", ("Accelerator Cable", "ACCCABLE")),
    ("REAR BRAKE CABLE", ("Rear Brake Cable", "RBCABLE")),
    ("FRONT BRAKE CABLE", ("Front Brake Cable", "FBCABLE")),
    ("CHOKE CABLE", ("Choke Cable", "CHOKECAB")),
    ("AIR FILTER", ("Air Filter", "AIRFILTER")),
    ("CHAIN KIT", ("Chain Kit", "CHAINKIT")),
    ("CLUTCH ROLLER BUSH KIT", ("Clutch Roller Bush Kit", "ROLLERKIT")),
    ("VARIATOR PLATE", ("Variator Plate", "VARIATOR")),
    ("STEERING BALL RACER", ("Steering Ball Racer", "STEERING")),
    ("PETROL TAP", ("Petrol Tap", "PETROLTAP")),
    ("SELF MOTOR", ("Self Motor", "SELFMOTOR")),
    ("SELF BENDEX", ("Self Bendex", "BENDEX")),
    ("SELF RELAY", ("Self Relay", "SELFRELY")),
    ("RR UNIT", ("RR Unit", "RRUNIT")),
    ("CDI", ("CDI Unit", "CDI")),
    ("IGNITION SWITCH", ("Ignition Switch", "IGSWITCH")),
    ("LOCK SET", ("Lock Set", "LOCKSET")),
    ("IGNITION COIL", ("Ignition Coil", "IGNCOIL")),
    ("SPARK PLUG", ("Spark Plug", "SPARKPLG")),
    ("BELTS", ("Drive Belt", "BELT")),
    ("T.CHAIN KIT", ("Timing Chain Kit", "TCHAINKIT")),
    ("T.CHAIN", ("Timing Chain", "TCHAIN")),
    ("H/L ASSY", ("Head Light Assembly", "HLASSY")),
    ("H/L UNIT", ("Head Light Unit", "HLUNIT")),
    ("HAL UNIT", ("Head Light Unit", "HLUNIT")),
    ("T/L ASSY", ("Tail Light Assembly", "TLASSY")),
    ("TAIL LENS", ("Tail Lens", "TAILLENS")),
    ("B/L ASSY", ("Blinker Assembly", "BLINKER")),
    ("MIRROR", ("Mirror", "MIRROR")),
    ("SHOCKER", ("Shocker", "SHOCKER")),
    ("MAIN TUBE", ("Main Tube", "MAINTUBE")),
    ("SIDE STAND ASSEMBLY", ("Side Stand Assembly", "SIDESTAND")),
    ("SIDE STAND", ("Side Stand", "SIDESTAND")),
    ("CENTER STAND", ("Center Stand", "CENTERSTD")),
    ("CENTRE STAND", ("Center Stand", "CENTERSTD")),
    ("BRAKE SIDE LEVER", ("Brake Side Lever", "BRKLEVER")),
    ("CLUTCH SIDE LEVER", ("Clutch Side Lever", "CLTLEVER")),
    ("HANDLE LEVER", ("Handle Lever", "HANDLELVR")),
    ("FORK SEAL", ("Fork Seal", "FORKSEAL")),
    ("SEAL KIT", ("Seal Kit", "SEALKIT")),
    ("SEAL", ("Seal", "SEAL")),
    ("HORN BUTTON", ("Horn Button", "HORNBTTN")),
    ("SELF BUTTON", ("Self Button", "SELFBTTN")),
    ("INDICATOR BUTTON", ("Indicator Button", "INDIBTTN")),
    ("DIPPER BUTTON", ("Dipper Button", "DIPBTTN")),
    ("BRAKE SWITCH", ("Brake Switch", "BRKSWTCH")),
    ("CLUTCH SWITCH", ("Clutch Switch", "CLTSWTCH")),
    ("HBS", ("Handle Bar Switch", "HBSWITCH")),
    ("CHAIN COVER", ("Chain Cover", "CHAINCVR")),
    ("WHEEL RIM", ("Wheel Rim", "RIM")),
    ("MUDGARD", ("Mudguard", "MUDGRD")),
    ("GEAR OIL", ("Gear Oil", "GEAROIL")),
    ("ENGINE OIL", ("Engine Oil", "ENGOIL")),
    ("SHOCKER OIL", ("Shocker Oil", "SHOCKOIL")),
    ("GREASE", ("Grease", "GREASE")),
    ("ANABOND", ("Anabond", "ANABOND")),
    ("BALL BEARINGS", ("Ball Bearings", "BEARING")),
    ("BEARINGS", ("Ball Bearings", "BEARING")),
    ("FLASHER", ("Flasher", "FLASHER")),
    ("FOG LIGHT", ("Fog Light", "FOGLIGHT")),
    ("TUBE BUTYL", ("Tube", "TUBE")),
]


SIDE_PATTERNS = [
    ("LHS+RHS", "SET"),
    ("LHS", "LHS"),
    ("RHS", "RHS"),
    ("LEFT", "LHS"),
    ("RIGHT", "RHS"),
    ("FRONT", "FRONT"),
    ("REAR", "REAR"),
]


GENERIC_FAMILY_NAMES = {
    "HERO": "HERO",
    "HONDA": "HONDA",
    "SUZUKI": "SUZUKI",
    "TVS": "TVS",
    "BAJAJ": "BAJAJ",
    "YAMAHA": "YAMAHA",
    "ROYAL ENFIELD": "ROYALENFIELD",
    "UNIVERSAL/OTHER": "UNIVERSAL",
    "EVS (OLA/ATHER/VESPA)": "EV",
}


def norm(text: str) -> str:
    return re.sub(r"\s+", " ", text.strip().upper())


def clean_brand(brand: str) -> str:
    return GENERIC_FAMILY_NAMES.get(brand.strip().upper(), re.sub(r"[^A-Z0-9]", "", brand.upper())[:12] or "GEN")


def supplier_family(code: str) -> str:
    for prefix in [
        "CWRSETTP", "CSPSETTP", "CSBKITF", "FCCHACT", "FCCBHESPL", "FCCBHEPLE",
        "FCCHCBS", "FCCHESPL", "HTAKIT", "ASKDBP", "ASKTC", "ASKBS", "ASKSC",
        "ASKNABS", "ASKRBD", "ASKRB", "ASKRBN", "F1SM", "F1SS", "F1CSA",
        "F1CCS", "F1BS", "F1CS", "F1LTH", "CCV-", "FMDTP", "SSHL", "SSSP",
        "SSTP", "SSFM", "SLD", "END", "SW", "AR", "RT-", "GENUINE", "ANABOND",
        "HTA"
    ]:
        if code.startswith(prefix):
            return prefix.rstrip("-")
    if code.startswith("ASK"):
        return "ASK"
    if code.startswith("F1"):
        return "F1"
    match = re.match(r"^([A-Z]+)", code)
    return match.group(1) if match else "NUMERIC"


def extract_fitments(desc: str):
    text = norm(desc)
    explicit = []

    series_patterns = [
        (r"ACTIVA\s+3G/4G/5G", [("Activa 3G", "ACTIVA"), ("Activa 4G", "ACTIVA"), ("Activa 5G", "ACTIVA")]),
        (r"ACTIVA\s+3G/5G", [("Activa 3G", "ACTIVA"), ("Activa 5G", "ACTIVA")]),
        (r"ACTIVA\s+HET/3G/4G", [("Activa HET", "ACTIVA"), ("Activa 3G", "ACTIVA"), ("Activa 4G", "ACTIVA")]),
        (r"ACTIVA\s+110\s+NM/125/3G/4G/ACCESS", [("Activa 110", "ACTIVA"), ("Activa 125", "ACTIVA"), ("Activa 3G", "ACTIVA"), ("Activa 4G", "ACTIVA"), ("Access", "ACCESS")]),
        (r"ACTIVA\s+N/M/3G/4G/MAESTRO", [("Activa New Model", "ACTIVA"), ("Activa 3G", "ACTIVA"), ("Activa 4G", "ACTIVA"), ("Maestro", "MAESTRO")]),
        (r"ACTIVA\s+N/M/3G/4G/5G", [("Activa New Model", "ACTIVA"), ("Activa 3G", "ACTIVA"), ("Activa 4G", "ACTIVA"), ("Activa 5G", "ACTIVA")]),
        (r"ACTIVA\s+O/M/N/M", [("Activa Old Model", "ACTIVA"), ("Activa New Model", "ACTIVA")]),
        (r"ACCESS\s+O/M/N/M", [("Access Old Model", "ACCESS"), ("Access New Model", "ACCESS")]),
        (r"ACCESS\s*/\s*ACCESS\s+N/M", [("Access", "ACCESS"), ("Access New Model", "ACCESS")]),
        (r"ACTIVA\s+O/M/DIO\s+O/M", [("Activa Old Model", "ACTIVA"), ("Dio Old Model", "DIO")]),
        (r"ACTIVA/PLEASURE/DIO", [("Activa", "ACTIVA"), ("Pleasure", "PLEASURE"), ("Dio", "DIO")]),
        (r"ACTIVA/ACTIVA\s+3G", [("Activa", "ACTIVA"), ("Activa 3G", "ACTIVA")]),
        (r"WEGO/JUPITER", [("Wego", "WEGO"), ("Jupiter", "JUPITER")]),
        (r"ACCESS\s+125\s+N/M\s*/\s*BURGMAN", [("Access 125", "ACCESS"), ("Burgman", "BURGMAN")]),
        (r"ACCESS\s+BS6/BURGMAN", [("Access BS6", "ACCESS"), ("Burgman", "BURGMAN")]),
        (r"SPL PRO/PASS PRO", [("Splendor Pro", "SPLENDOR"), ("Passion Pro", "PASSION")]),
        (r"SPL\+/PAS\+", [("Splendor Plus", "SPLENDOR"), ("Passion Plus", "PASSION")]),
    ]
    for pattern, values in series_patterns:
        if re.search(pattern, text):
            explicit.extend(values)

    matches = []
    for pattern, label, family in MODEL_ALIASES:
        if pattern in text:
            matches.append((label, family))

    deduped = []
    seen_labels = set()
    for label, family in explicit + matches:
        if label in seen_labels:
            continue
        seen_labels.add(label)
        deduped.append((label, family))

    specific_labels = {label for label, _family in deduped if " " in label or any(ch.isdigit() for ch in label)}
    filtered = []
    for label, family in deduped:
        generic = label in {"Activa", "Access", "Dio", "Jupiter", "Shine", "Splendor", "Passion"}
        if generic and any(item.startswith(label + " ") for item in specific_labels):
            continue
        filtered.append((label, family))
    return filtered


def category_info(desc: str):
    text = norm(desc)
    for needle, result in CATEGORY_PATTERNS:
        if needle in text:
            return result
    plain = re.sub(r"\([^)]*\)", " ", text)
    plain = re.sub(r"[^A-Z0-9/ +.-]", " ", plain)
    plain = re.sub(r"\s+", " ", plain).strip(" /-")
    words = [w for w in plain.split() if len(w) > 1][:3]
    if not words:
        return desc.title(), "PART"
    pretty = " ".join(word.title() for word in words)
    code = re.sub(r"[^A-Z0-9]", "", "".join(words))[:8] or "PART"
    return pretty, code


def extract_side(desc: str) -> str:
    text = norm(desc)
    for needle, side in SIDE_PATTERNS:
        if needle in text:
            return side
    return ""


def variant_tokens(desc: str):
    text = norm(desc)
    found = []
    for token in ["N/M", "O/M", "BS6", "HET", "3G", "4G", "5G", "110", "125", "COMBI", "DIGITAL", "4 PIN", "5 PIN"]:
        if token in text:
            found.append(token)
    return "|".join(found)


def primary_family(brand_bike: str, fitments):
    if fitments:
        family_counts = {}
        first_order = []
        for _label, family in fitments:
            family_counts[family] = family_counts.get(family, 0) + 1
            if family not in first_order:
                first_order.append(family)
        best_count = max(family_counts.values())
        best = [family for family in first_order if family_counts[family] == best_count]
        return best[0]
    return clean_brand(brand_bike)


def sku_seed(family: str, cat_code: str, side: str):
    parts = [family or "GEN", cat_code or "PART"]
    if side in {"LHS", "RHS", "SET", "FRONT", "REAR"}:
        parts.append(side)
    return "-".join(parts)[:36]


def review_reason(fitments, family: str, brand_bike: str, raw_description: str):
    reasons = []
    families = {fit_family for _label, fit_family in fitments}
    if len(families) > 1:
        reasons.append("mixed_fitment_families")
    if len(fitments) >= 4:
        reasons.append("many_fitments")
    fitment_like_slash = re.search(r"(ACTIVA|ACCESS|SHINE|UNICORN|PASS|SPL|JUPITER|WEGO|DIO|PLEASURE|PULSAR|OLA|ATHER|VESPA|BURGMAN).*/", norm(raw_description))
    if fitment_like_slash and not fitments:
        reasons.append("slash_fitment_unclear")
    if family in {"UNIVERSAL", "EV"}:
        reasons.append("primary_family_review")
    if brand_bike == "UNIVERSAL/OTHER" and not fitments:
        reasons.append("generic_brand_only")
    return reasons


rows = list(csv.DictReader(SRC.open(newline="", encoding="utf-8")))
out_rows = []
flagged = 0

for row in rows:
    fitments = extract_fitments(row["description"])
    fitment_labels = [label for label, _family in fitments]
    family = primary_family(row["brand_bike"], fitments)
    part_name, category_code = category_info(row["description"])
    side = extract_side(row["description"])
    reasons = review_reason(fitments, family, row["brand_bike"], row["description"])
    flagged += 1 if reasons else 0
    out_rows.append({
        "supplier_part_number": row["part_number"],
        "supplier_code_family": supplier_family(row["part_number"]),
        "raw_description": row["description"],
        "normalized_part_name": part_name,
        "brand_bike": row["brand_bike"],
        "primary_family": family,
        "fitment_models": "|".join(fitment_labels),
        "variant_tokens": variant_tokens(row["description"]),
        "side": side,
        "net_rate_rs": row["net_rate_rs"],
        "sku_seed": sku_seed(family, category_code, side),
        "review_flag": "yes" if reasons else "no",
        "review_reason": "|".join(reasons),
    })


with OUT.open("w", newline="", encoding="utf-8") as file:
    writer = csv.DictWriter(file, fieldnames=list(out_rows[0].keys()))
    writer.writeheader()
    writer.writerows(out_rows)


examples = [
    "239TLA3G", "CWRSETTP003", "26261568", "54063",
    "ASKDBP0531", "ASKBS0212", "CWRSETTP002", "239SVM110BS6"
]

with REPORT.open("w", encoding="utf-8") as file:
    file.write("Parts catalog seed v2 report\n")
    file.write("==========================\n")
    file.write(f"Total rows: {len(out_rows)}\n")
    file.write(f"Review flagged rows: {flagged}\n")
    file.write("\nSample rows:\n")
    sample_map = {row["supplier_part_number"]: row for row in out_rows}
    for code in examples:
        row = sample_map.get(code)
        if not row:
            continue
        file.write(f"{code} | {row['fitment_models']} | {row['sku_seed']} | {row['review_flag']} | {row['review_reason']}\n")
