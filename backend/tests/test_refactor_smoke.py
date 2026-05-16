"""
Smoke tests after backend refactor (server.py -> modular structure).
Covers all endpoints listed in iteration 8 review request.
"""
import os
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL').rstrip('/')


# ---------- fixtures ----------
@pytest.fixture(scope="module")
def admin_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "123456"}, timeout=15)
    assert r.status_code == 200, f"admin login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def cashier_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "1111"}, timeout=15)
    assert r.status_code == 200, f"cashier login failed: {r.text}"
    return r.json()["token"]


@pytest.fixture(scope="module")
def waiter_token():
    r = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "2222"}, timeout=15)
    assert r.status_code == 200, f"waiter login failed: {r.text}"
    return r.json()["token"]


def H(tok):
    return {"Authorization": f"Bearer {tok}", "Content-Type": "application/json"}


# ---------- auth ----------
class TestAuth:
    def test_admin_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "123456"})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d and "user" in d
        assert d["user"]["role"] == "admin"

    def test_cashier_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "1111"})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d
        assert d["user"]["role"] == "cashier"

    def test_waiter_login(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "2222"})
        assert r.status_code == 200
        d = r.json()
        assert "token" in d
        assert d["user"]["role"] == "waiter"

    def test_invalid_pincode(self):
        r = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "000000"})
        assert r.status_code in (401, 400, 404)


# ---------- settings ----------
class TestSettings:
    def test_get_settings(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/settings", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        assert "business_type" in d, f"missing business_type: {d}"

    def test_put_settings_admin(self, admin_token):
        # round-trip the existing business_type
        cur = requests.get(f"{BASE_URL}/api/settings", headers=H(admin_token)).json()
        bt = cur.get("business_type", "restaurant")
        r = requests.put(f"{BASE_URL}/api/settings", json={"business_type": bt}, headers=H(admin_token))
        assert r.status_code == 200
        assert r.json().get("business_type") == bt

    def test_put_settings_requires_admin(self, cashier_token):
        r = requests.put(f"{BASE_URL}/api/settings",
                         json={"business_type": "restaurant"},
                         headers=H(cashier_token))
        assert r.status_code in (401, 403), f"expected forbidden, got {r.status_code}"


# ---------- users ----------
class TestUsers:
    def test_get_users_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/users", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_users_non_admin(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/users", headers=H(cashier_token))
        assert r.status_code in (401, 403)

    def test_create_user_admin(self, admin_token):
        payload = {"name": "TEST_RefactorUser", "pincode": "9876", "role": "cashier"}
        r = requests.post(f"{BASE_URL}/api/users", json=payload, headers=H(admin_token))
        assert r.status_code == 200, r.text
        uid = r.json()["id"]
        # cleanup
        requests.delete(f"{BASE_URL}/api/users/{uid}", headers=H(admin_token))


# ---------- products / tables / orders ----------
class TestCoreCollections:
    def test_get_products(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/products", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_tables(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/tables", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_orders(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/orders", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_held_orders(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/orders/held/list", headers=H(cashier_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- suppliers / purchase orders / expenses ----------
class TestPurchasing:
    def test_get_suppliers_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/suppliers", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_purchase_orders(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/purchase-orders", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_get_expenses(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/expenses", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------- accounts / reports ----------
class TestReports:
    def test_accounts_summary(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/accounts/summary", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        for f in ["total_revenue", "total_cogs", "gross_profit", "total_expenses", "net_profit"]:
            assert f in d, f"missing {f}"

    def test_sales_report(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/reports/sales", headers=H(admin_token))
        assert r.status_code == 200
        d = r.json()
        for f in ["daily_sales", "top_products", "payment_breakdown", "total_revenue", "total_orders", "avg_order_value"]:
            assert f in d, f"missing {f}"

    def test_cost_report(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/reports/cost", headers=H(admin_token))
        assert r.status_code == 200

    def test_staff_report(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/reports/staff", headers=H(admin_token))
        assert r.status_code == 200

    def test_payment_methods_report(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/reports/payment-methods", headers=H(admin_token))
        assert r.status_code == 200

    def test_analytics_dashboard(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/analytics/dashboard", headers=H(admin_token))
        assert r.status_code == 200


# ---------- display ----------
class TestDisplay:
    def test_display_current(self):
        # public endpoint - secondary display
        r = requests.get(f"{BASE_URL}/api/display/current")
        assert r.status_code == 200, r.text

    def test_display_update(self, cashier_token):
        payload = {"type": "idle", "data": {}}
        r = requests.post(f"{BASE_URL}/api/display/update", json=payload, headers=H(cashier_token))
        assert r.status_code == 200, r.text


# ---------- peripherals / currencies / payment-types / printers ----------
class TestMisc:
    def test_peripherals(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/peripherals", headers=H(admin_token))
        assert r.status_code == 200

    def test_currencies(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/currencies", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_payment_types(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/payment-types", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_printers_admin(self, admin_token):
        r = requests.get(f"{BASE_URL}/api/printers", headers=H(admin_token))
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_printers_assigned(self, cashier_token):
        r = requests.get(f"{BASE_URL}/api/printers/assigned", headers=H(cashier_token))
        assert r.status_code == 200


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
