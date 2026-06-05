#!/usr/bin/env python3
"""
Build a reusable legacy import bundle from:
- Khatabook customer balances
- Money Manager income/expense export

No external Python packages required.
"""

from __future__ import annotations

import argparse
import json
import re
from collections import Counter
from datetime import datetime, timedelta
from pathlib import Path
from zipfile import ZipFile
import xml.etree.ElementTree as ET


NS = {
    "a": "http://schemas.openxmlformats.org/spreadsheetml/2006/main",
    "r": "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
}

OPENING_DATE = "2025-01-01"


def read_xlsx_rows(path: Path) -> list[dict[str, str]]:
    with ZipFile(path) as zf:
        shared = []
        if "xl/sharedStrings.xml" in zf.namelist():
            root = ET.fromstring(zf.read("xl/sharedStrings.xml"))
            for si in root.findall("a:si", NS):
                shared.append("".join(si.itertext()))

        workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        rel_root = ET.fromstring(zf.read("xl/_rels/workbook.xml.rels"))
        rels = {
            rel.attrib["Id"]: rel.attrib["Target"]
            for rel in rel_root.findall("{http://schemas.openxmlformats.org/package/2006/relationships}Relationship")
        }

        first_sheet = workbook.find("a:sheets", NS)[0]
        rid = first_sheet.attrib["{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"]
        target = rels[rid]
        if not target.startswith("xl/"):
            target = "xl/" + target.lstrip("/")

        sheet = ET.fromstring(zf.read(target))
        rows = []
        for row in sheet.findall(".//a:sheetData/a:row", NS):
            values = {}
            for cell in row.findall("a:c", NS):
                ref = "".join(ch for ch in cell.attrib.get("r", "") if ch.isalpha())
                cell_type = cell.attrib.get("t")
                v = cell.find("a:v", NS)
                if cell_type == "s" and v is not None:
                    values[ref] = shared[int(v.text)]
                elif cell_type == "inlineStr":
                    inline = cell.find("a:is", NS)
                    values[ref] = "".join(inline.itertext()) if inline is not None else ""
                else:
                    values[ref] = v.text if v is not None else ""
            rows.append(values)
        return rows


def excel_serial_to_iso(value: str) -> tuple[str, str]:
    try:
        base = datetime(1899, 12, 30)
        dt = base + timedelta(days=float(value))
        return dt.strftime("%Y-%m-%d"), dt.isoformat(timespec="seconds")
    except Exception:
        return "", ""


def slug(text: str) -> str:
    text = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return text or "item"


def norm_name(name: str) -> str:
    return re.sub(r"\s+", " ", (name or "").strip())


def norm_phone(phone: str) -> str:
    digits = re.sub(r"\D+", "", phone or "")
    if len(digits) > 10:
        digits = digits[-10:]
    return digits


def parse_amount(value: str) -> float:
    try:
        return round(float(value or 0), 2)
    except Exception:
        return 0.0


def infer_vehicle_from_name(name: str) -> str:
    lower = (name or "").lower()
    for key in ["ola", "activa", "shine", "spl", "dio", "jupiter", "ather", "iq", "tvs", "ktm", "jawa"]:
        if key in lower:
            return name
    return "Opening Balance"


def income_mapping(category: str) -> tuple[str, str]:
    raw = (category or "").strip().lower()
    if raw == "regular 😀":
        return "invoice_payment", "Invoice Payment"
    if raw == "borrowed 🥲":
        return "due_collection", "Due Collection"
    if raw == "borrowed regular mix":
        return "mixed_collection", "Mixed Collection"
    if raw == "advance 🥳":
        return "advance", "Advance"
    if raw == "other":
        return "misc_income", "Misc Income"
    if raw == "running":
        return "misc_income", "Miscellaneous"
    if raw == "paytm exchange":
        return "adjustment", "Adjustment"
    return "misc_income", "Misc Income"


def expense_mapping(category: str, subcategory: str) -> tuple[str, str]:
    raw = (category or "").strip().lower()
    sub = norm_name(subcategory)
    if raw == "parts":
        return "Parts", sub
    if raw == "other":
        return "Miscellaneous", sub
    if raw in {"nilesh bhai", "nileshbhai"}:
        return "Parts", "Nilesh Bhai"
    if raw == "jatin":
        return "Parts", "Jatin"
    if raw in {"colour", "color"}:
        return "Colour Work", sub
    if raw == "tyre":
        return "Tyre", sub
    if raw == "welding":
        return "Welding", sub
    if raw == "jumper":
        return "Jumper Repair", sub
    if "patrol" in raw:
        return "Fuel", sub or norm_name(category)
    if raw == "salary":
        return "Salary", sub
    if raw == "seat":
        return "Seat Work", sub
    if raw == "meeter":
        return "Meter Work", sub
    if raw == "belt":
        return "Belt", sub
    if raw == "crome":
        return "Chrome Work", sub
    if raw == "bhajiya":
        return "Snacks", sub
    if raw == "dharam bhai":
        return "Parts", "Dharam Bhai"
    return "Miscellaneous", sub or norm_name(category)


def customer_key(name: str, phone: str) -> str:
    phone = norm_phone(phone)
    if phone:
        return f"phone:{phone}"
    return f"name:{norm_name(name).lower()}"


def build_bundle(khatabook_path: Path, money_path: Path, all_customers_path: Path | None = None) -> tuple[dict, dict]:
    customers = []
    jobs = []
    expenses = []
    income_entries = []
    review_items = []
    import_batches = []
    customer_index: dict[str, dict] = {}

    kb_rows = read_xlsx_rows(khatabook_path)
    mm_rows = read_xlsx_rows(money_path)
    all_customer_rows = read_xlsx_rows(all_customers_path) if all_customers_path else []

    kb_due_total = 0.0
    kb_review_total = 0.0
    kb_zero_total = 0

    for idx, row in enumerate(kb_rows[1:], start=2):
        name = norm_name(row.get("A", ""))
        phone = norm_phone(row.get("B", ""))
        net_balance = parse_amount(row.get("E", "0"))
        if not name:
            continue

        if net_balance >= 0:
            cust_id = f"kb-customer-{idx:04d}-{slug(name)[:24]}"
            customer = {
                "id": cust_id,
                "name": name,
                "phone": phone,
                "email": "",
                "address": "",
                "vehicles": [],
                "notes": "Imported opening due from Khatabook",
                "createdAt": OPENING_DATE,
                "importSource": "khatabook",
            }
            customers.append(customer)
            customer_index[customer_key(name, phone)] = customer
            if net_balance > 0:
                job_id = f"KBJ{idx:04d}"
                invoice_no = f"KB-{idx:04d}"
                kb_due_total += net_balance
                jobs.append({
                    "id": job_id,
                    "date": OPENING_DATE,
                    "time": "09:00",
                    "custId": cust_id,
                    "cust": name,
                    "phone": phone,
                    "veh": infer_vehicle_from_name(name),
                    "vno": "",
                    "odo": "",
                    "prob": "Opening balance imported from Khatabook",
                    "mechId": "",
                    "mech": "",
                    "pri": "normal",
                    "status": "done",
                    "lab": net_balance,
                    "prt": 0,
                    "discount": 0,
                    "payment": 0,
                    "payMethod": "",
                    "payments": [],
                    "partsUsed": [],
                    "notes": f"Khatabook opening due imported from row {idx}",
                    "delivery": "",
                    "photo": "",
                    "collectedBy": "",
                    "invoiceNo": invoice_no,
                    "doneAt": f"{OPENING_DATE}T09:00:00",
                    "importSource": "khatabook",
                })
            else:
                kb_zero_total += 1
        elif abs(net_balance) >= 100:
            kb_review_total += abs(net_balance)
            review_items.append({
                "id": f"kb-review-{idx:04d}",
                "source": "khatabook",
                "severity": "review",
                "reason": "Negative balance above ignore threshold",
                "name": name,
                "phone": phone,
                "netBalance": net_balance,
                "rowNumber": idx,
            })

    imported_zero_customers = 0
    if all_customer_rows:
        for idx, row in enumerate(all_customer_rows[1:], start=2):
            name = norm_name(row.get("B", ""))
            phone = norm_phone(row.get("C", ""))
            if not name:
                continue
            key = customer_key(name, phone)
            existing = customer_index.get(key)
            if existing:
                if not existing.get("phone") and phone:
                    existing["phone"] = phone
                continue
            customer = {
                "id": f"book2-customer-{idx:05d}-{slug(name)[:24]}",
                "name": name,
                "phone": phone,
                "email": "",
                "address": "",
                "vehicles": [],
                "notes": "Imported from full customer master",
                "createdAt": OPENING_DATE,
                "importSource": "book2",
            }
            customers.append(customer)
            customer_index[key] = customer
            imported_zero_customers += 1

    income_total = 0.0
    expense_total = 0.0
    expense_categories = Counter()
    income_categories = Counter()

    for idx, row in enumerate(mm_rows[1:], start=2):
        date, timestamp = excel_serial_to_iso(row.get("A", ""))
        if not date:
            continue
        category = norm_name(row.get("C", ""))
        subcategory = norm_name(row.get("D", ""))
        note = norm_name(row.get("E", ""))
        direction = norm_name(row.get("G", ""))
        description = norm_name(row.get("H", ""))
        amount = parse_amount(row.get("I", "0"))
        account = norm_name(row.get("B", ""))

        if amount <= 0:
            continue

        if direction.lower() == "income":
            kind, normalized = income_mapping(category)
            income_categories[normalized] += 1
            income_total += amount
            income_entries.append({
                "id": f"mm-income-{idx:05d}",
                "date": date,
                "timestamp": timestamp,
                "amount": amount,
                "category": normalized,
                "kind": kind,
                "method": account,
                "note": note,
                "description": description,
                "customer": "",
                "phone": "",
                "invoiceNo": note if re.fullmatch(r"[A-Za-z0-9-]+", note or "") else "",
                "originalCategory": category,
                "originalSubcategory": subcategory,
                "importSource": "money-manager",
            })
        elif direction.lower() == "expense":
            normalized, paid_to = expense_mapping(category, subcategory)
            expense_categories[normalized] += 1
            expense_total += amount
            expenses.append({
                "id": f"mm-expense-{idx:05d}",
                "date": date,
                "cat": normalized,
                "desc": description or note or f"Imported from Money Manager: {category}",
                "amount": amount,
                "paidTo": paid_to,
                "receipt": "",
                "timestamp": timestamp,
                "originalCategory": category,
                "originalSubcategory": subcategory,
                "importSource": "money-manager",
            })

    import_batches = [
        {
            "id": "khatabook-import",
            "source": "khatabook",
            "rowCount": max(0, len(kb_rows) - 1),
            "customerCount": len(customers),
            "jobCount": len(jobs),
            "reviewCount": len([r for r in review_items if r["source"] == "khatabook"]),
            "importedAt": datetime.utcnow().isoformat(timespec="seconds"),
        },
        {
            "id": "money-manager-import",
            "source": "money-manager",
            "rowCount": max(0, len(mm_rows) - 1),
            "incomeCount": len(income_entries),
            "expenseCount": len(expenses),
            "importedAt": datetime.utcnow().isoformat(timespec="seconds"),
        },
    ]
    if all_customer_rows:
        import_batches.append({
            "id": "customer-master-import",
            "source": "book2",
            "rowCount": max(0, len(all_customer_rows) - 1),
            "customerCount": imported_zero_customers,
            "importedAt": datetime.utcnow().isoformat(timespec="seconds"),
        })

    summary = {
        "khatabook": {
            "rows": max(0, len(kb_rows) - 1),
            "importedCustomers": len(customers),
            "importedDueJobs": len(jobs),
            "zeroDueCustomers": kb_zero_total,
            "dueTotal": kb_due_total,
            "reviewCount": len([r for r in review_items if r["source"] == "khatabook"]),
            "reviewTotal": kb_review_total,
        },
        "customerMaster": {
            "rows": max(0, len(all_customer_rows) - 1) if all_customer_rows else 0,
            "newCustomersImported": imported_zero_customers,
            "totalCustomersInBundle": len(customers),
        },
        "moneyManager": {
            "rows": max(0, len(mm_rows) - 1),
            "incomeEntries": len(income_entries),
            "incomeTotal": income_total,
            "expenseEntries": len(expenses),
            "expenseTotal": expense_total,
            "incomeCategories": dict(sorted(income_categories.items())),
            "expenseCategories": dict(sorted(expense_categories.items())),
        },
    }

    bundle = {
        "version": 1,
        "createdAt": datetime.utcnow().isoformat(timespec="seconds"),
        "customers": customers,
        "jobs": jobs,
        "expenses": expenses,
        "incomeEntries": income_entries,
        "reviewItems": review_items,
        "importBatches": import_batches,
        "partsLog": [],
        "meta": {
            "jobCtr": len(jobs) + 1,
            "invoiceCtr": len(jobs) + 1,
            "sourceFiles": {
                "khatabook": str(khatabook_path),
                "moneyManager": str(money_path),
                "allCustomers": str(all_customers_path) if all_customers_path else "",
            },
        },
        "summary": summary,
    }
    return bundle, summary


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--khatabook", default="/Users/priyansh/Projects/JalaSai/Khatabook.xlsx")
    parser.add_argument("--money-manager", default="/Users/priyansh/Downloads/Money Manager_30-03-2026.xlsx")
    parser.add_argument("--all-customers", default="/Users/priyansh/Projects/JalaSai/Book2.xlsx")
    parser.add_argument("--out-dir", default="/Users/priyansh/Projects/JalaSai/legacy-import")
    args = parser.parse_args()

    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    all_customers_path = Path(args.all_customers) if args.all_customers else None
    bundle, summary = build_bundle(Path(args.khatabook), Path(args.money_manager), all_customers_path)
    bundle_path = out_dir / "legacy-import-bundle.json"
    summary_path = out_dir / "legacy-import-summary.json"

    bundle_path.write_text(json.dumps(bundle, indent=2, ensure_ascii=True))
    summary_path.write_text(json.dumps(summary, indent=2, ensure_ascii=True))

    print(f"Wrote {bundle_path}")
    print(f"Wrote {summary_path}")
    print(json.dumps(summary, indent=2, ensure_ascii=True))


if __name__ == "__main__":
    main()
