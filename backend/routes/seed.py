import random
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query

from database import db
from models import (
    BarTab, Category, Currency, Customer, Expense,
    Order, OrderItem, Outlet, PaymentType, Product,
    Stock, Supplier, Table, User,
)
router = APIRouter(prefix="/api")


# ── TEMPORARY RESET ENDPOINT — remove after use ───────────────────────────────
@router.get("/admin-reset")
async def reset_admin_pin(secret: str = Query(...), pin: str = Query("123456")):
    import hashlib, traceback
    if secret != "posx-reset-marvellatech":
        return {"ok": False, "error": "Invalid secret"}
    try:
        h = hashlib.sha256(f"posx-pin-v2-salt:{pin}".encode()).hexdigest()
        hashed = f"v2:{h}"
        # List all users so we can see what's in the DB
        users = await db.users.find({}, {"_id": 0, "id": 1, "name": 1, "role": 1}).to_list(100)
        result = await db.users.update_one({"role": "admin"}, {"$set": {"pincode": hashed}})
        return {
            "ok": result.matched_count > 0,
            "matched": result.matched_count,
            "modified": result.modified_count,
            "users_found": users,
            "hash_set": hashed[:20] + "...",
            "message": f"PIN reset to {pin}" if result.matched_count > 0 else "No admin user found",
        }
    except Exception as e:
        return {"ok": False, "error": str(e), "trace": traceback.format_exc()}
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/db-test")
async def test_db_connection():
    import traceback
    try:
        result = await db.command("ping")
        return {"ok": True, "ping": str(result)}
    except Exception as e:
        return {"ok": False, "error": str(e), "trace": traceback.format_exc()}


# Pre-computed bcrypt hashes — no runtime hashing needed (each hash takes 3-5s on shared hosting)
_H = {
    "123456": "$2b$12$T8ULFAbLU4KVsydmQhDNXuBkXebZe.LN0z/vqiRtK4RRAUNxTinf.",
    "9999":   "$2b$12$qmwbKEG9zb5/I7Mft8Pnk.bTAEPaRJXQA99.bFmq8dMte1ZfLqXxK",
    "1111":   "$2b$12$XVkQM69rM2AogKAr8Oma6ebUwJg.lx8yPrK/e4JPvLC/YgHtuAT7O",
    "2222":   "$2b$12$w5IpJkSLTQF8GNzKHG6Ydu2B/uTU6WOfb0Fj6e5ccu1mMbg6oaMO2",
    "3333":   "$2b$12$ahaR4Tkn4QRpCkX.R7bH..i5DMv26mQ.kgH4tvMbnBK.V8N/KiEjq",
    "4444":   "$2b$12$9bYe6vIRsNCywbRiHkbjqu4daLpjYOWluEM8dnKT0EEUBqOTTEQkW",
}

rng = random.Random(42)   # deterministic so re-runs produce same data


def _dt(days_back: float, hour: int = 12, minute: int = 0) -> str:
    t = datetime.now(timezone.utc) - timedelta(days=days_back)
    return t.replace(hour=hour, minute=minute, second=0, microsecond=0).isoformat()


def _insert(doc):
    """Serialize datetimes before inserting."""
    for k, v in doc.items():
        if isinstance(v, datetime):
            doc[k] = v.isoformat()
    return doc


CLEARABLE = [
    "users", "outlets", "tables", "bar_tabs", "payment_types", "currencies",
    "categories", "products", "stock", "customers", "suppliers", "expenses",
    "orders", "settings",
]

@router.post("/seed")
async def seed_data(force: bool = Query(False)):
    existing_admin = await db.users.find_one({"role": "admin"})
    if existing_admin and not force:
        return {"message": "Database already seeded"}
    if force:
        for col in CLEARABLE:
            await db[col].delete_many({})

    # ── Settings first — ensures setup wizard is bypassed even if seed times out later ──
    await db.settings.update_one(
        {"id": "business_settings"},
        {"$set": {
            "id": "business_settings",
            "setup_completed": True,
            "currency_symbol": "₦",
            "business_name": "The Grand Bistro",
            "business_type": "restaurant",
            "tax_enabled": True,
            "tax_rate": 7.5,
            "tax_mode": "exclusive",
        }},
        upsert=True,
    )

    # ── Users ────────────────────────────────────────────────────────────────
    admin = User(name="Admin", pincode=_H["123456"], role="admin")
    manager = User(name="Sarah Manager", pincode=_H["9999"], role="manager")
    cashier1 = User(name="James Cashier", pincode=_H["1111"], role="cashier")
    cashier2 = User(name="Linda Cashier", pincode=_H["2222"], role="cashier")
    waiter1 = User(name="Tony Waiter", pincode=_H["3333"], role="waiter")
    waiter2 = User(name="Grace Waiter", pincode=_H["4444"], role="waiter")

    for u in [admin, manager, cashier1, cashier2, waiter1, waiter2]:
        await db.users.insert_one(_insert(u.model_dump()))

    # ── Outlets ──────────────────────────────────────────────────────────────
    outlet_main = Outlet(name="Main Restaurant", type="outlet", address="12 Victoria Island, Lagos", phone="0801-234-5678")
    outlet_bar = Outlet(name="Bar & Lounge", type="outlet", address="12 Victoria Island, Lagos", phone="0801-234-5679")

    for o in [outlet_main, outlet_bar]:
        await db.outlets.insert_one(_insert(o.model_dump()))

    # Assign users to outlets
    for u in [cashier1, cashier2, waiter1, waiter2]:
        await db.users.update_one({"id": u.id}, {"$set": {"outlet_id": outlet_main.id}})

    # ── Tables ───────────────────────────────────────────────────────────────
    tables = []
    for i in range(1, 13):
        t = Table(number=f"T{i}", outlet_id=outlet_main.id, seats=4 if i <= 8 else 6)
        await db.tables.insert_one(_insert(t.model_dump()))
        tables.append(t)

    # ── Bar Tabs ─────────────────────────────────────────────────────────────
    for i in range(1, 7):
        bt = BarTab(number=f"B{i}", outlet_id=outlet_bar.id,
                    tab_type=rng.choice(["regular", "vip", "regular"]))
        await db.bar_tabs.insert_one(_insert(bt.model_dump()))

    # ── Payment Types ────────────────────────────────────────────────────────
    for pt_data in [
        PaymentType(name="Cash", type="cash"),
        PaymentType(name="Card", type="card"),
        PaymentType(name="Mobile Pay", type="digital_wallet"),
        PaymentType(name="Bank Transfer", type="bank_transfer"),
    ]:
        await db.payment_types.insert_one(_insert(pt_data.model_dump()))

    # ── Currency ─────────────────────────────────────────────────────────────
    for curr in [
        Currency(code="NGN", symbol="₦", name="Nigerian Naira", exchange_rate=1.0, is_default=True),
        Currency(code="USD", symbol="$", name="US Dollar", exchange_rate=0.00065),
        Currency(code="GBP", symbol="£", name="British Pound", exchange_rate=0.00052),
    ]:
        await db.currencies.insert_one(_insert(curr.model_dump()))

    # ── Categories & Products ────────────────────────────────────────────────
    cat_starters = Category(name="Starters", color="#F97316")
    cat_mains = Category(name="Main Course", color="#EF4444")
    cat_burgers = Category(name="Burgers", color="#D97706")
    cat_grill = Category(name="Grills", color="#B45309")
    cat_pasta = Category(name="Pasta & Rice", color="#7C3AED")
    cat_drinks = Category(name="Drinks", color="#3B82F6")
    cat_cocktails = Category(name="Cocktails", color="#EC4899")
    cat_desserts = Category(name="Desserts", color="#10B981")

    cats = [cat_starters, cat_mains, cat_burgers, cat_grill, cat_pasta, cat_drinks, cat_cocktails, cat_desserts]
    for c in cats:
        await db.categories.insert_one(_insert(c.model_dump()))

    _U = "https://images.unsplash.com/"
    products_data = [
        # Starters
        ("Spring Rolls (4pcs)", cat_starters, 2500, _U + "photo-1606491956689-2ea866880c84?w=400&h=300&fit=crop&auto=format"),
        ("Peppered Gizzard",    cat_starters, 3500, _U + "photo-1604908176997-125f25cc6f3d?w=400&h=300&fit=crop&auto=format"),
        ("Chicken Wings",       cat_starters, 4500, _U + "photo-1527477396000-e27163b481c2?w=400&h=300&fit=crop&auto=format"),
        ("Calamari",            cat_starters, 3800, _U + "photo-1559847844-5315695dadae?w=400&h=300&fit=crop&auto=format"),
        ("Mozzarella Sticks",   cat_starters, 2800, _U + "photo-1548340748-6d2b7d7da280?w=400&h=300&fit=crop&auto=format"),
        # Mains
        ("Grilled Tilapia",        cat_mains, 7500, _U + "photo-1519708227418-a8d869a5fbf9?w=400&h=300&fit=crop&auto=format"),
        ("Jollof Rice & Chicken",  cat_mains, 5500, _U + "photo-1567620905732-2d1ec7ab7445?w=400&h=300&fit=crop&auto=format"),
        ("Fried Rice & Turkey",    cat_mains, 5800, _U + "photo-1512058564366-18510be2db19?w=400&h=300&fit=crop&auto=format"),
        ("Pepper Soup (Goat)",     cat_mains, 6500, _U + "photo-1547592166-23ac45744acd?w=400&h=300&fit=crop&auto=format"),
        ("Egusi Soup & Eba",       cat_mains, 4500, _U + "photo-1504674900247-0877df9cc836?w=400&h=300&fit=crop&auto=format"),
        ("Ofe Onugbu & Semo",      cat_mains, 4800, _U + "photo-1585937421612-70a008356fbe?w=400&h=300&fit=crop&auto=format"),
        # Burgers
        ("Classic Beef Burger", cat_burgers, 4200, _U + "photo-1568901346375-23c9450c58cd?w=400&h=300&fit=crop&auto=format"),
        ("Double Smash Burger", cat_burgers, 5800, _U + "photo-1594212699903-ec8a3eca50f5?w=400&h=300&fit=crop&auto=format"),
        ("Chicken Burger",      cat_burgers, 4500, _U + "photo-1553979459-d2229ba7433b?w=400&h=300&fit=crop&auto=format"),
        ("Veggie Burger",       cat_burgers, 3800, _U + "photo-1520072959219-c595dc870360?w=400&h=300&fit=crop&auto=format"),
        # Grill
        ("Mixed Grill Platter", cat_grill, 12500, _U + "photo-1544025162-d76694265947?w=400&h=300&fit=crop&auto=format"),
        ("Pork Ribs",           cat_grill,  9500, _U + "photo-1529193591184-b1d58069ecdd?w=400&h=300&fit=crop&auto=format"),
        ("BBQ Chicken",         cat_grill,  7000, _U + "photo-1598103442097-8b74394b95c8?w=400&h=300&fit=crop&auto=format"),
        ("Grilled Prawns",      cat_grill,  9000, _U + "photo-1565680018434-b513d5e5fd47?w=400&h=300&fit=crop&auto=format"),
        # Pasta & Rice
        ("Spaghetti Bolognese", cat_pasta, 4500, _U + "photo-1555949258-eb67b1ef0ceb?w=400&h=300&fit=crop&auto=format"),
        ("Pasta Alfredo",       cat_pasta, 4200, _U + "photo-1621996346565-e3dbc646d9a9?w=400&h=300&fit=crop&auto=format"),
        ("Coconut Rice",        cat_pasta, 3500, _U + "photo-1596560548464-f010549b84d7?w=400&h=300&fit=crop&auto=format"),
        # Drinks
        ("Coca-Cola",          cat_drinks,  500, _U + "photo-1554866585-cd94860890b7?w=400&h=300&fit=crop&auto=format"),
        ("Fanta Orange",       cat_drinks,  500, _U + "photo-1613478223719-2ab802602423?w=400&h=300&fit=crop&auto=format"),
        ("Bottled Water",      cat_drinks,  300, _U + "photo-1548839140-29a749e1cf4d?w=400&h=300&fit=crop&auto=format"),
        ("Fresh Orange Juice", cat_drinks, 1800, _U + "photo-1600271886742-f049cd451bba?w=400&h=300&fit=crop&auto=format"),
        ("Malt Drink",         cat_drinks,  700, _U + "photo-1575367439058-6096bb9cf5e2?w=400&h=300&fit=crop&auto=format"),
        ("Chapman",            cat_drinks, 2000, _U + "photo-1544145945-f90425340c7e?w=400&h=300&fit=crop&auto=format"),
        # Cocktails
        ("Mojito",               cat_cocktails, 4500, _U + "photo-1551538827-9c037cb4f32a?w=400&h=300&fit=crop&auto=format"),
        ("Sex on the Beach",     cat_cocktails, 5000, _U + "photo-1582106245687-1afde369f5d1?w=400&h=300&fit=crop&auto=format"),
        ("Long Island Ice Tea",  cat_cocktails, 5500, _U + "photo-1536935338788-846bb9981813?w=400&h=300&fit=crop&auto=format"),
        ("Pina Colada",          cat_cocktails, 4800, _U + "photo-1607446045875-ef7cd69e1e4c?w=400&h=300&fit=crop&auto=format"),
        # Desserts
        ("Chocolate Lava Cake",  cat_desserts, 3500, _U + "photo-1606313564200-e75d5e30476c?w=400&h=300&fit=crop&auto=format"),
        ("Ice Cream (2 scoops)", cat_desserts, 2500, _U + "photo-1567206563114-c179706f6b3f?w=400&h=300&fit=crop&auto=format"),
        ("Cheesecake",           cat_desserts, 3000, _U + "photo-1533134242443-d4fd215305ad?w=400&h=300&fit=crop&auto=format"),
        ("Fruit Salad",          cat_desserts, 2200, _U + "photo-1568158879083-c42860933ed7?w=400&h=300&fit=crop&auto=format"),
    ]

    products = []
    for name, cat, price, img in products_data:
        p = Product(name=name, category_id=cat.id, price=price, active=True, image=img)
        await db.products.insert_one(_insert(p.model_dump()))
        products.append(p)
        # Stock in both outlets
        for outlet, qty in [(outlet_main, rng.randint(30, 150)), (outlet_bar, rng.randint(10, 60))]:
            s = Stock(product_id=p.id, outlet_id=outlet.id, quantity=qty, min_quantity=10)
            doc = s.model_dump()
            doc["updated_at"] = doc["updated_at"].isoformat()
            await db.stock.insert_one(doc)

    # ── Customers ────────────────────────────────────────────────────────────
    customers_data = [
        ("Emmanuel Okafor", "0803-111-2233", "emma.ok@gmail.com"),
        ("Chidinma Adeyemi", "0805-222-3344", "chidi.ade@gmail.com"),
        ("Babatunde Fashola", "0807-333-4455", "baba.f@yahoo.com"),
        ("Ngozi Okonkwo", "0809-444-5566", "ngozi.ok@gmail.com"),
        ("David Oluwaseun", "0812-555-6677", "david.o@gmail.com"),
        ("Amaka Eze", "0814-666-7788", "amaka.e@gmail.com"),
        ("Chukwuemeka Obi", "0816-777-8899", "emeka.obi@gmail.com"),
        ("Fatima Aliyu", "0818-888-9900", "fatima.a@yahoo.com"),
        ("Olumide Johnson", "0820-999-0011", "olu.j@gmail.com"),
        ("Blessing Nwosu", "0802-101-1122", "blessing.n@gmail.com"),
    ]
    customers = []
    for name, phone, email in customers_data:
        c = Customer(name=name, phone=phone, email=email)
        await db.customers.insert_one(_insert(c.model_dump()))
        customers.append(c)

    # ── Suppliers ────────────────────────────────────────────────────────────
    suppliers_data = [
        ("Lagos Fresh Farms", "Emeka Supplies", "0803-500-0001", "lagfresh@gmail.com", "10 Apapa Road, Lagos"),
        ("Prime Beverages Ltd", "Tunde Olakunle", "0805-600-0002", "primebev@company.ng", "5 Surulere Ave, Lagos"),
        ("Continental Meats", "Adaeze Nwobi", "0807-700-0003", "contmeats@gmail.com", "22 Ojota Market, Lagos"),
        ("Kitchen Essentials NG", "Yusuf Bello", "0809-800-0004", "kitchen.ng@yahoo.com", "8 Ikeja GRA, Lagos"),
    ]
    suppliers = []
    for name, contact, phone, email, address in suppliers_data:
        s = Supplier(name=name, contact_name=contact, phone=phone, email=email, address=address)
        await db.suppliers.insert_one(_insert(s.model_dump()))
        suppliers.append(s)

    # ── Expenses ─────────────────────────────────────────────────────────────
    expense_templates = [
        ("Food & Beverages", "Fresh produce purchase", 45000, suppliers[0]),
        ("Food & Beverages", "Meat and poultry stock", 68000, suppliers[2]),
        ("Food & Beverages", "Beverages and soft drinks", 32000, suppliers[1]),
        ("Food & Beverages", "Seafood delivery", 55000, suppliers[0]),
        ("Utilities", "Electricity bill (EKEDC)", 28000, None),
        ("Utilities", "Water supply invoice", 8000, None),
        ("Utilities", "Gas cylinders refill", 15000, None),
        ("Salaries", "Kitchen staff wages", 180000, None),
        ("Salaries", "Service staff wages", 120000, None),
        ("Maintenance", "A/C servicing and repair", 22000, None),
        ("Maintenance", "Kitchen equipment maintenance", 18000, None),
        ("Marketing", "Social media promotion", 35000, None),
        ("Marketing", "Flyer printing and distribution", 12000, None),
        ("Supplies", "Disposable packaging materials", 9500, suppliers[3]),
        ("Supplies", "Cleaning supplies restock", 7500, suppliers[3]),
        ("Food & Beverages", "Cooking oil and spices", 21000, suppliers[0]),
        ("Food & Beverages", "Bread and bakery items", 14000, None),
        ("Utilities", "Internet and POS terminal subscription", 18500, None),
        ("Maintenance", "Plumbing repair", 12000, None),
        ("Transport", "Delivery logistics fee", 6500, None),
        ("Food & Beverages", "Imported wines and spirits", 95000, suppliers[1]),
        ("Supplies", "Table linen and napkins", 16000, suppliers[3]),
        ("Maintenance", "Generator fuel", 32000, None),
        ("Food & Beverages", "Vegetable and fruit delivery", 19500, suppliers[0]),
        ("Marketing", "Influencer collaboration payment", 50000, None),
    ]

    for i, (cat, desc, amount, supplier) in enumerate(expense_templates):
        days_back = rng.uniform(0, 30)
        exp_date = (datetime.now(timezone.utc) - timedelta(days=days_back)).strftime("%Y-%m-%d")
        e = Expense(
            category=cat,
            description=desc,
            amount=float(amount + rng.randint(-2000, 2000)),
            date=exp_date,
            supplier_id=supplier.id if supplier else None,
            created_by=admin.id,
        )
        await db.expenses.insert_one(_insert(e.model_dump()))

    # ── Orders (historical) ──────────────────────────────────────────────────
    payment_methods = ["cash", "cash", "cash", "card", "card", "mobile"]  # weighted
    staff_pool = [cashier1, cashier2, waiter1, waiter2]
    drink_products = [p for p in products if p.category_id in (cat_drinks.id, cat_cocktails.id)]
    food_products = [p for p in products if p.category_id not in (cat_drinks.id, cat_cocktails.id)]

    order_count = 0
    for day_back in range(7, -1, -1):
        # Reduced to 7 days to keep seed fast on shared hosting
        n_orders = rng.randint(3, 6)
        for _ in range(n_orders):
            order_count += 1
            hour = rng.choices(
                [11, 12, 13, 14, 18, 19, 20, 21, 22],
                weights=[1, 3, 3, 2, 2, 4, 5, 4, 2]
            )[0]
            minute = rng.randint(0, 59)
            created_ts = datetime.now(timezone.utc) - timedelta(days=day_back)
            created_ts = created_ts.replace(hour=hour, minute=minute, second=rng.randint(0, 59), microsecond=0)

            # Pick random products (1–5 items)
            n_food = rng.randint(1, 4)
            n_drinks = rng.randint(0, 2)
            chosen_food = rng.sample(food_products, min(n_food, len(food_products)))
            chosen_drinks = rng.sample(drink_products, min(n_drinks, len(drink_products)))
            chosen = chosen_food + chosen_drinks

            items = []
            subtotal = 0.0
            for prod in chosen:
                qty = rng.randint(1, 3)
                total = prod.price * qty
                subtotal += total
                items.append(OrderItem(
                    product_id=prod.id,
                    product_name=prod.name,
                    quantity=qty,
                    price=prod.price,
                    total=total,
                ))

            tax = round(subtotal * 0.075, 2)
            total = round(subtotal + tax, 2)
            payment = rng.choice(payment_methods)
            staff = rng.choice(staff_pool)

            # 60% of orders have a customer
            customer = rng.choice(customers) if rng.random() < 0.6 else None
            # 40% have a table
            table = rng.choice(tables) if rng.random() < 0.4 else None

            order = Order(
                order_number=f"ORD{order_count:06d}",
                outlet_id=outlet_main.id,
                customer_id=customer.id if customer else None,
                customer_name=customer.name if customer else None,
                table_id=table.id if table else None,
                table_number=table.number if table else None,
                items=items,
                subtotal=subtotal,
                tax=tax,
                total=total,
                payment_method=payment,
                status="completed",
                service_mode="table_service" if table else "quick_service",
                created_by=staff.id,
                created_by_name=staff.name,
                created_by_role=staff.role,
                created_at=created_ts,
            )
            doc = order.model_dump()
            doc["created_at"] = created_ts.isoformat()
            for item in doc["items"]:
                pass  # already serializable
            await db.orders.insert_one(doc)

    # Update customer totals
    for c in customers:
        pipeline = [
            {"$match": {"customer_id": c.id, "status": "completed"}},
            {"$group": {"_id": None, "total_orders": {"$sum": 1}, "total_spent": {"$sum": "$total"}}},
        ]
        async for row in db.orders.aggregate(pipeline):
            await db.customers.update_one(
                {"id": c.id},
                {"$set": {"total_orders": row["total_orders"], "total_spent": row["total_spent"]}},
            )

    return {
        "message": "Demo data seeded successfully",
        "logins": {
            "admin":    "PIN 123456",
            "manager":  "PIN 9999",
            "cashier1": "PIN 1111",
            "cashier2": "PIN 2222",
            "waiter1":  "PIN 3333",
            "waiter2":  "PIN 4444",
        },
        "summary": {
            "outlets": 2,
            "tables": 12,
            "bar_tabs": 6,
            "products": len(products),
            "customers": len(customers),
            "suppliers": len(suppliers),
            "expenses": len(expense_templates),
            "orders": order_count,
        },
    }


@router.post("/quickseed")
async def quick_seed():
    """Minimal seed: writes setup_completed + admin user only. Completes in ~2s.
    Safe to run at any time — will not overwrite existing data."""
    # Write settings immediately
    await db.settings.update_one(
        {"id": "business_settings"},
        {"$set": {
            "id": "business_settings",
            "setup_completed": True,
            "currency_symbol": "₦",
            "business_name": "The Grand Bistro",
            "business_type": "restaurant",
            "tax_enabled": True,
            "tax_rate": 7.5,
            "tax_mode": "exclusive",
        }},
        upsert=True,
    )

    # Create admin user only if none exists
    existing_admin = await db.users.find_one({"role": "admin"})
    if not existing_admin:
        admin = User(name="Admin", pincode=_H["123456"], role="admin")
        manager = User(name="Sarah Manager", pincode=_H["9999"], role="manager")
        cashier1 = User(name="James Cashier", pincode=_H["1111"], role="cashier")
        waiter1 = User(name="Tony Waiter", pincode=_H["3333"], role="waiter")
        for u in [admin, manager, cashier1, waiter1]:
            await db.users.insert_one(_insert(u.model_dump()))

        # Payment types
        for pt_data in [
            PaymentType(name="Cash", type="cash"),
            PaymentType(name="Card", type="card"),
            PaymentType(name="Mobile Pay", type="digital_wallet"),
        ]:
            await db.payment_types.insert_one(_insert(pt_data.model_dump()))

        # Currency
        await db.currencies.insert_one(
            _insert(Currency(code="NGN", symbol="₦", name="Nigerian Naira",
                             exchange_rate=1.0, is_default=True).model_dump())
        )

    return {
        "message": "Quick setup complete — app will show PIN login",
        "logins": {
            "admin":   "PIN 123456",
            "manager": "PIN 9999",
            "cashier": "PIN 1111",
            "waiter":  "PIN 3333",
        },
    }
