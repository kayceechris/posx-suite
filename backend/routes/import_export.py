from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.responses import StreamingResponse
from datetime import datetime, timezone
from typing import Optional
import csv
import io
import uuid

from database import db
from models import User
from auth import get_current_user

router = APIRouter(prefix="/api")


@router.get("/products/import/template/csv")
async def product_import_template_csv(current_user: User = Depends(get_current_user)):
    """Download a sample/example CSV with all supported columns + 3 example rows."""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    # Use real entity names if any exist, so the user can copy-paste
    cat = await db.categories.find_one({}, {"_id": 0})
    brand = await db.brands.find_one({}, {"_id": 0})
    unit = await db.units.find_one({}, {"_id": 0})
    outlet = await db.outlets.find_one({"type": "outlet"}, {"_id": 0}) or await db.outlets.find_one({}, {"_id": 0})
    terminal = await db.terminals.find_one({}, {"_id": 0})

    cat_name = cat["name"] if cat else "Burgers"
    brand_name = brand["name"] if brand else "House Brand"
    unit_name = unit["name"] if unit else "pcs"
    outlet_name = outlet["name"] if outlet else "Main Outlet"
    terminal_name = terminal["name"] if terminal else "POS-1"

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Category", "Brand", "Unit", "Outlet", "Terminal",
                     "Cost Price", "Markup %", "Price", "Barcode", "Description", "Active"])
    # Example rows
    writer.writerow(["Cheese Burger", cat_name, brand_name, unit_name, outlet_name, terminal_name,
                     "3.50", "60", "5.60", "1234567890123", "Classic cheese burger with fries", "Yes"])
    writer.writerow(["Cappuccino", cat_name, brand_name, unit_name, outlet_name, terminal_name,
                     "0.80", "150", "2.00", "", "200ml cup", "Yes"])
    writer.writerow(["Caesar Salad", cat_name, "", "", outlet_name, "",
                     "2.10", "100", "4.20", "", "Romaine, parmesan, croutons", "Yes"])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=products_import_template.csv"}
    )


@router.get("/stock/import/template/csv")
async def stock_import_template_csv(current_user: User = Depends(get_current_user)):
    """Download a sample/example CSV for stock import."""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    outlet = await db.outlets.find_one({"type": "outlet"}, {"_id": 0}) or await db.outlets.find_one({}, {"_id": 0})
    outlet_name = outlet["name"] if outlet else "Main Outlet"

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Barcode", "Quantity", "Min Quantity", "Outlet"])
    writer.writerow(["Cheese Burger", "1234567890123", "50", "5", outlet_name])
    writer.writerow(["Cappuccino", "", "100", "10", outlet_name])
    writer.writerow(["Caesar Salad", "", "20", "3", outlet_name])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=stock_import_template.csv"}
    )


@router.get("/products/export/csv")
async def export_products_csv(current_user: User = Depends(get_current_user)):
    """Export all products as CSV"""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    products = await db.products.find({}, {"_id": 0}).to_list(10000)
    categories = await db.categories.find({}, {"_id": 0}).to_list(1000)
    brands = await db.brands.find({}, {"_id": 0}).to_list(1000)
    units = await db.units.find({}, {"_id": 0}).to_list(1000)
    outlets = await db.outlets.find({}, {"_id": 0}).to_list(1000)
    terminals = await db.terminals.find({}, {"_id": 0}).to_list(1000)

    cat_map = {c["id"]: c["name"] for c in categories}
    brand_map = {b["id"]: b["name"] for b in brands}
    unit_map = {u["id"]: u["name"] for u in units}
    outlet_map = {o["id"]: o["name"] for o in outlets}
    terminal_map = {t["id"]: t["name"] for t in terminals}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Category", "Brand", "Unit", "Outlet", "Terminal", "Cost Price", "Markup %", "Price", "Barcode", "Description", "Active"])

    for p in products:
        writer.writerow([
            p.get("name", ""),
            cat_map.get(p.get("category_id", ""), ""),
            brand_map.get(p.get("brand_id", ""), ""),
            unit_map.get(p.get("unit_id", ""), ""),
            outlet_map.get(p.get("outlet_id", ""), ""),
            terminal_map.get(p.get("terminal_id", ""), ""),
            p.get("cost_price", 0),
            p.get("markup_percentage", 0),
            p.get("price", 0),
            p.get("barcode", ""),
            p.get("description", ""),
            "Yes" if p.get("active", True) else "No"
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=products_export_{datetime.now().strftime('%Y%m%d')}.csv"}
    )


@router.get("/products/export/pdf")
async def export_products_pdf(current_user: User = Depends(get_current_user)):
    """Export all products as PDF"""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
        from reportlab.lib.styles import getSampleStyleSheet
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="reportlab is not installed on the server. Run: pip install reportlab"
        )

    products = await db.products.find({}, {"_id": 0}).to_list(10000)
    categories = await db.categories.find({}, {"_id": 0}).to_list(1000)
    cat_map = {c["id"]: c["name"] for c in categories}

    settings = await db.settings.find_one({"id": "business_settings"}, {"_id": 0})
    business_name = settings.get("business_name", "POSx Suite") if settings else "POSx Suite"

    buffer = io.BytesIO()
    doc = SimpleDocTemplate(buffer, pagesize=A4)
    styles = getSampleStyleSheet()
    elements = []

    # Title
    elements.append(Paragraph(f"<b>{business_name}</b>", styles['Title']))
    elements.append(Paragraph("Product List", styles['Heading2']))
    elements.append(Paragraph(f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles['Normal']))
    elements.append(Spacer(1, 20))

    # Table
    data = [["#", "Name", "Category", "Cost", "Price", "Barcode", "Status"]]
    for i, p in enumerate(products, 1):
        data.append([
            str(i),
            p.get("name", ""),
            cat_map.get(p.get("category_id", ""), "N/A"),
            f"{p.get('cost_price', 0):.2f}",
            f"{p.get('price', 0):.2f}",
            p.get("barcode", "") or "-",
            "Active" if p.get("active", True) else "Inactive"
        ])

    table = Table(data, repeatRows=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1E293B')),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 0), 9),
        ('FONTSIZE', (0, 1), (-1, -1), 8),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#E2E8F0')),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#F8FAFC')]),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    elements.append(table)

    doc.build(elements)
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/pdf",
        headers={"Content-Disposition": f"attachment; filename=products_{datetime.now().strftime('%Y%m%d')}.pdf"}
    )


@router.post("/products/import/csv")
async def import_products_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """Import products from CSV. Creates new or updates existing by name."""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    categories = await db.categories.find({}, {"_id": 0}).to_list(1000)
    brands = await db.brands.find({}, {"_id": 0}).to_list(1000)
    units = await db.units.find({}, {"_id": 0}).to_list(1000)
    outlets = await db.outlets.find({}, {"_id": 0}).to_list(1000)
    terminals = await db.terminals.find({}, {"_id": 0}).to_list(1000)
    cat_name_map = {c["name"].lower(): c["id"] for c in categories}
    brand_name_map = {b["name"].lower(): b["id"] for b in brands}
    unit_name_map = {u["name"].lower(): u["id"] for u in units}
    outlet_name_map = {o["name"].lower(): o["id"] for o in outlets}
    terminal_name_map = {t["name"].lower(): t["id"] for t in terminals}
    # IDs are also accepted as-is
    brand_ids = {b["id"] for b in brands}
    unit_ids = {u["id"] for u in units}
    outlet_ids = {o["id"] for o in outlets}
    terminal_ids = {t["id"] for t in terminals}

    def resolve(value, name_map, id_set):
        v = (value or "").strip()
        if not v:
            return ""
        if v in id_set:
            return v
        return name_map.get(v.lower(), "")

    created = 0
    updated = 0
    errors = []

    for row_num, row in enumerate(reader, 2):
        name = row.get("Name", "").strip()
        if not name:
            errors.append(f"Row {row_num}: Missing product name")
            continue

        category_name = row.get("Category", "").strip().lower()
        category_id = cat_name_map.get(category_name, "")
        brand_id = resolve(row.get("Brand", ""), brand_name_map, brand_ids)
        unit_id = resolve(row.get("Unit", ""), unit_name_map, unit_ids)
        outlet_id = resolve(row.get("Outlet", ""), outlet_name_map, outlet_ids)
        terminal_id = resolve(row.get("Terminal", ""), terminal_name_map, terminal_ids)

        try:
            price = float(row.get("Price", 0) or 0)
            cost_price = float(row.get("Cost Price", 0) or 0)
            markup = float(row.get("Markup %", 0) or 0)
        except ValueError:
            errors.append(f"Row {row_num}: Invalid number for price/cost")
            continue

        existing = await db.products.find_one({"name": name}, {"_id": 0})
        if existing:
            update_data = {"price": price, "cost_price": cost_price, "markup_percentage": markup}
            if category_id:
                update_data["category_id"] = category_id
            if brand_id:
                update_data["brand_id"] = brand_id
            if unit_id:
                update_data["unit_id"] = unit_id
            if outlet_id:
                update_data["outlet_id"] = outlet_id
            if terminal_id:
                update_data["terminal_id"] = terminal_id
            if row.get("Barcode"):
                update_data["barcode"] = row["Barcode"].strip()
            if row.get("Description"):
                update_data["description"] = row["Description"].strip()
            await db.products.update_one({"name": name}, {"$set": update_data})
            updated += 1
        else:
            product = {
                "id": str(uuid.uuid4()),
                "name": name,
                "category_id": category_id,
                "brand_id": brand_id or None,
                "unit_id": unit_id or None,
                "outlet_id": outlet_id or None,
                "terminal_id": terminal_id or None,
                "cost_price": cost_price,
                "markup_percentage": markup,
                "price": price,
                "barcode": row.get("Barcode", "").strip() or None,
                "description": row.get("Description", "").strip() or None,
                "image": None,
                "active": True,
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await db.products.insert_one(product)
            created += 1

    return {
        "message": f"Import complete. {created} created, {updated} updated.",
        "created": created,
        "updated": updated,
        "errors": errors
    }


@router.post("/stock/import/csv")
async def import_stock_csv(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    """Import stock quantities from CSV. Updates quantity for matching products."""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    # Get all products for name->id lookup
    products = await db.products.find({}, {"_id": 0}).to_list(10000)
    product_name_map = {p["name"].lower(): p["id"] for p in products}
    product_barcode_map = {p["barcode"]: p["id"] for p in products if p.get("barcode")}

    # Get all outlets for name->id lookup
    all_outlets = await db.outlets.find({}, {"_id": 0}).to_list(1000)
    outlet_name_map = {o["name"].lower(): o["id"] for o in all_outlets}
    outlet_id_set = {o["id"] for o in all_outlets}

    # Default outlet for blank rows
    default_outlets = [o for o in all_outlets if o.get("type") == "outlet"]
    default_outlet_id = default_outlets[0]["id"] if default_outlets else (all_outlets[0]["id"] if all_outlets else "main-outlet")

    updated = 0
    errors = []

    for row_num, row in enumerate(reader, 2):
        name = row.get("Name", "").strip()
        barcode = row.get("Barcode", "").strip()
        outlet_raw = (row.get("Outlet") or row.get("Outlet ID") or "").strip()
        if not outlet_raw:
            outlet_id = default_outlet_id
        elif outlet_raw in outlet_id_set:
            outlet_id = outlet_raw
        else:
            outlet_id = outlet_name_map.get(outlet_raw.lower(), default_outlet_id)

        # Find product by barcode first, then by name
        product_id = None
        if barcode and barcode in product_barcode_map:
            product_id = product_barcode_map[barcode]
        elif name and name.lower() in product_name_map:
            product_id = product_name_map[name.lower()]

        if not product_id:
            errors.append(f"Row {row_num}: Product not found - '{name or barcode}'")
            continue

        try:
            quantity = int(float(row.get("Quantity", 0) or 0))
        except ValueError:
            errors.append(f"Row {row_num}: Invalid quantity")
            continue

        min_qty = 10
        try:
            min_qty = int(float(row.get("Min Quantity", 10) or 10))
        except ValueError:
            pass

        existing = await db.stock.find_one({"product_id": product_id, "outlet_id": outlet_id})
        if existing:
            await db.stock.update_one(
                {"product_id": product_id, "outlet_id": outlet_id},
                {"$set": {"quantity": quantity, "min_quantity": min_qty, "updated_at": datetime.now(timezone.utc).isoformat()}}
            )
        else:
            await db.stock.insert_one({
                "id": str(uuid.uuid4()),
                "product_id": product_id,
                "outlet_id": outlet_id,
                "quantity": quantity,
                "min_quantity": min_qty,
                "updated_at": datetime.now(timezone.utc).isoformat()
            })
        updated += 1

    return {
        "message": f"Stock import complete. {updated} products updated.",
        "updated": updated,
        "errors": errors
    }


@router.get("/stock/export/csv")
async def export_stock_csv(current_user: User = Depends(get_current_user)):
    """Export stock quantities as CSV for re-import"""
    if current_user.role not in ["admin", "manager"]:
        raise HTTPException(status_code=403, detail="Not authorized")

    stocks = await db.stock.find({}, {"_id": 0}).to_list(10000)
    products = await db.products.find({}, {"_id": 0}).to_list(10000)
    outlets = await db.outlets.find({}, {"_id": 0}).to_list(1000)
    prod_map = {p["id"]: p for p in products}
    outlet_map = {o["id"]: o["name"] for o in outlets}

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Name", "Barcode", "Quantity", "Min Quantity", "Outlet"])

    for s in stocks:
        prod = prod_map.get(s.get("product_id", ""), {})
        writer.writerow([
            prod.get("name", "Unknown"),
            prod.get("barcode", ""),
            s.get("quantity", 0),
            s.get("min_quantity", 10),
            outlet_map.get(s.get("outlet_id", ""), s.get("outlet_id", ""))
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename=stock_export_{datetime.now().strftime('%Y%m%d')}.csv"}
    )
