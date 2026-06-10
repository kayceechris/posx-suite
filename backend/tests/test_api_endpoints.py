"""
Backend API Tests for POSx Suite
Tests: Suppliers CRUD, Expenses CRUD, Accounts Summary, Reports Sales, Users CRUD, Products with cost/markup
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://posx-suite.preview.emergentagent.com')

class TestAuth:
    """Authentication tests"""
    token = None
    
    def test_login_admin(self):
        """Test admin login with pincode 123456"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "123456"})
        assert response.status_code == 200, f"Login failed: {response.text}"
        data = response.json()
        assert "token" in data, "No token in response"
        assert "user" in data, "No user in response"
        assert data["user"]["role"] == "admin", f"Expected admin role, got {data['user']['role']}"
        TestAuth.token = data["token"]
        print(f"✓ Admin login successful, role: {data['user']['role']}")
        return data["token"]


@pytest.fixture(scope="module")
def auth_token():
    """Get auth token for all tests"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "123456"})
    if response.status_code == 200:
        return response.json()["token"]
    pytest.skip("Authentication failed")


@pytest.fixture
def auth_headers(auth_token):
    """Headers with auth token"""
    return {"Authorization": f"Bearer {auth_token}", "Content-Type": "application/json"}


# ==================== SUPPLIERS TESTS ====================
class TestSuppliers:
    """Supplier CRUD tests"""
    created_supplier_id = None
    
    def test_create_supplier(self, auth_headers):
        """POST /api/suppliers - Create supplier"""
        payload = {
            "name": "TEST_Supplier_ABC",
            "contact_name": "John Doe",
            "phone": "555-1234",
            "email": "test@supplier.com",
            "address": "123 Test Street"
        }
        response = requests.post(f"{BASE_URL}/api/suppliers", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create supplier failed: {response.text}"
        data = response.json()
        assert data["name"] == payload["name"], "Name mismatch"
        assert data["contact_name"] == payload["contact_name"], "Contact name mismatch"
        assert data["phone"] == payload["phone"], "Phone mismatch"
        assert data["email"] == payload["email"], "Email mismatch"
        assert "id" in data, "No ID returned"
        TestSuppliers.created_supplier_id = data["id"]
        print(f"✓ Supplier created: {data['name']} (ID: {data['id']})")
    
    def test_get_suppliers(self, auth_headers):
        """GET /api/suppliers - List suppliers"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        assert response.status_code == 200, f"Get suppliers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of suppliers"
        print(f"✓ Got {len(data)} suppliers")
    
    def test_update_supplier(self, auth_headers):
        """PUT /api/suppliers/{id} - Update supplier"""
        if not TestSuppliers.created_supplier_id:
            pytest.skip("No supplier created")
        
        payload = {"name": "TEST_Supplier_Updated", "phone": "555-9999"}
        response = requests.put(
            f"{BASE_URL}/api/suppliers/{TestSuppliers.created_supplier_id}",
            json=payload, headers=auth_headers
        )
        assert response.status_code == 200, f"Update supplier failed: {response.text}"
        data = response.json()
        assert data["name"] == payload["name"], "Name not updated"
        assert data["phone"] == payload["phone"], "Phone not updated"
        print(f"✓ Supplier updated: {data['name']}")
    
    def test_delete_supplier(self, auth_headers):
        """DELETE /api/suppliers/{id} - Delete supplier"""
        if not TestSuppliers.created_supplier_id:
            pytest.skip("No supplier created")
        
        response = requests.delete(
            f"{BASE_URL}/api/suppliers/{TestSuppliers.created_supplier_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete supplier failed: {response.text}"
        print(f"✓ Supplier deleted: {TestSuppliers.created_supplier_id}")


# ==================== EXPENSES TESTS ====================
class TestExpenses:
    """Expense CRUD tests"""
    created_expense_id = None
    
    def test_create_expense(self, auth_headers):
        """POST /api/expenses - Create expense"""
        payload = {
            "category": "supplies",
            "description": "TEST_Office supplies",
            "amount": 99.99,
            "date": "2026-01-15"
        }
        response = requests.post(f"{BASE_URL}/api/expenses", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create expense failed: {response.text}"
        data = response.json()
        assert data["category"] == payload["category"], "Category mismatch"
        assert data["description"] == payload["description"], "Description mismatch"
        assert data["amount"] == payload["amount"], "Amount mismatch"
        assert data["date"] == payload["date"], "Date mismatch"
        assert "id" in data, "No ID returned"
        TestExpenses.created_expense_id = data["id"]
        print(f"✓ Expense created: {data['description']} (${data['amount']})")
    
    def test_get_expenses(self, auth_headers):
        """GET /api/expenses - List expenses"""
        response = requests.get(f"{BASE_URL}/api/expenses", headers=auth_headers)
        assert response.status_code == 200, f"Get expenses failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of expenses"
        print(f"✓ Got {len(data)} expenses")
    
    def test_delete_expense(self, auth_headers):
        """DELETE /api/expenses/{id} - Delete expense"""
        if not TestExpenses.created_expense_id:
            pytest.skip("No expense created")
        
        response = requests.delete(
            f"{BASE_URL}/api/expenses/{TestExpenses.created_expense_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete expense failed: {response.text}"
        print(f"✓ Expense deleted: {TestExpenses.created_expense_id}")


# ==================== ACCOUNTS SUMMARY TESTS ====================
class TestAccountsSummary:
    """Accounts summary (P&L) tests"""
    
    def test_get_accounts_summary(self, auth_headers):
        """GET /api/accounts/summary - Get P&L summary"""
        response = requests.get(f"{BASE_URL}/api/accounts/summary", headers=auth_headers)
        assert response.status_code == 200, f"Get accounts summary failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        required_fields = ["total_revenue", "total_cogs", "gross_profit", "total_expenses", "net_profit"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify calculations
        assert data["gross_profit"] == data["total_revenue"] - data["total_cogs"], "Gross profit calculation wrong"
        assert data["net_profit"] == data["gross_profit"] - data["total_expenses"], "Net profit calculation wrong"
        
        print(f"✓ Accounts summary: Revenue=${data['total_revenue']:.2f}, COGS=${data['total_cogs']:.2f}, Net=${data['net_profit']:.2f}")
    
    def test_accounts_summary_with_date_filter(self, auth_headers):
        """GET /api/accounts/summary with date filter"""
        params = {"start_date": "2026-01-01", "end_date": "2026-12-31"}
        response = requests.get(f"{BASE_URL}/api/accounts/summary", params=params, headers=auth_headers)
        assert response.status_code == 200, f"Get accounts summary with filter failed: {response.text}"
        print("✓ Accounts summary with date filter works")


# ==================== REPORTS TESTS ====================
class TestReports:
    """Sales reports tests"""
    
    def test_get_sales_report(self, auth_headers):
        """GET /api/reports/sales - Get sales report"""
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=auth_headers)
        assert response.status_code == 200, f"Get sales report failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        required_fields = ["daily_sales", "top_products", "payment_breakdown", "total_revenue", "total_orders", "avg_order_value"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        assert isinstance(data["daily_sales"], list), "daily_sales should be a list"
        assert isinstance(data["top_products"], list), "top_products should be a list"
        assert isinstance(data["payment_breakdown"], list), "payment_breakdown should be a list"
        
        print(f"✓ Sales report: {data['total_orders']} orders, ${data['total_revenue']:.2f} revenue")
    
    def test_sales_report_with_date_filter(self, auth_headers):
        """GET /api/reports/sales with date filter"""
        params = {"start_date": "2026-01-01", "end_date": "2026-12-31"}
        response = requests.get(f"{BASE_URL}/api/reports/sales", params=params, headers=auth_headers)
        assert response.status_code == 200, f"Get sales report with filter failed: {response.text}"
        print("✓ Sales report with date filter works")


# ==================== USERS TESTS ====================
class TestUsers:
    """User CRUD tests - Bug fix verification"""
    created_user_id = None
    
    def test_create_user(self, auth_headers):
        """POST /api/users - Create user (bug fix test)"""
        payload = {
            "name": "TEST_NewUser",
            "pincode": "9999",
            "role": "cashier"
        }
        response = requests.post(f"{BASE_URL}/api/users", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create user failed: {response.text}"
        data = response.json()
        assert data["name"] == payload["name"], "Name mismatch"
        assert data["role"] == payload["role"], "Role mismatch"
        assert "id" in data, "No ID returned"
        TestUsers.created_user_id = data["id"]
        print(f"✓ User created: {data['name']} (role: {data['role']})")
    
    def test_get_users(self, auth_headers):
        """GET /api/users - List users"""
        response = requests.get(f"{BASE_URL}/api/users", headers=auth_headers)
        assert response.status_code == 200, f"Get users failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of users"
        assert len(data) > 0, "No users found"
        print(f"✓ Got {len(data)} users")
    
    def test_update_user(self, auth_headers):
        """PUT /api/users/{id} - Update user (bug fix test)"""
        if not TestUsers.created_user_id:
            pytest.skip("No user created")
        
        payload = {"name": "TEST_UpdatedUser", "role": "waiter"}
        response = requests.put(
            f"{BASE_URL}/api/users/{TestUsers.created_user_id}",
            json=payload, headers=auth_headers
        )
        assert response.status_code == 200, f"Update user failed: {response.text}"
        data = response.json()
        assert data["name"] == payload["name"], "Name not updated"
        assert data["role"] == payload["role"], "Role not updated"
        print(f"✓ User updated: {data['name']} (role: {data['role']})")
    
    def test_delete_user(self, auth_headers):
        """DELETE /api/users/{id} - Delete user"""
        if not TestUsers.created_user_id:
            pytest.skip("No user created")
        
        response = requests.delete(
            f"{BASE_URL}/api/users/{TestUsers.created_user_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete user failed: {response.text}"
        print(f"✓ User deleted: {TestUsers.created_user_id}")


# ==================== PRODUCTS TESTS ====================
class TestProducts:
    """Product tests with cost price and markup"""
    created_product_id = None
    
    def test_create_product_with_cost_markup(self, auth_headers):
        """POST /api/products - Create product with cost price and markup"""
        # First get a category
        cat_response = requests.get(f"{BASE_URL}/api/categories", headers=auth_headers)
        categories = cat_response.json()
        if not categories:
            pytest.skip("No categories available")
        
        category_id = categories[0]["id"]
        
        payload = {
            "name": "TEST_Product_WithMarkup",
            "category_id": category_id,
            "cost_price": 10.00,
            "markup_percentage": 50.0,
            "price": 15.00  # 10 * 1.5 = 15
        }
        response = requests.post(f"{BASE_URL}/api/products", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create product failed: {response.text}"
        data = response.json()
        assert data["name"] == payload["name"], "Name mismatch"
        assert data["cost_price"] == payload["cost_price"], "Cost price mismatch"
        assert data["markup_percentage"] == payload["markup_percentage"], "Markup mismatch"
        assert data["price"] == payload["price"], "Price mismatch"
        assert "id" in data, "No ID returned"
        TestProducts.created_product_id = data["id"]
        print(f"✓ Product created: {data['name']} (cost: ${data['cost_price']}, markup: {data['markup_percentage']}%, price: ${data['price']})")
    
    def test_get_products(self, auth_headers):
        """GET /api/products - List products"""
        response = requests.get(f"{BASE_URL}/api/products", headers=auth_headers)
        assert response.status_code == 200, f"Get products failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of products"
        print(f"✓ Got {len(data)} products")
    
    def test_update_product_cost_markup(self, auth_headers):
        """PUT /api/products/{id} - Update product cost and markup"""
        if not TestProducts.created_product_id:
            pytest.skip("No product created")
        
        payload = {"cost_price": 12.00, "markup_percentage": 75.0, "price": 21.00}
        response = requests.put(
            f"{BASE_URL}/api/products/{TestProducts.created_product_id}",
            json=payload, headers=auth_headers
        )
        assert response.status_code == 200, f"Update product failed: {response.text}"
        data = response.json()
        assert data["cost_price"] == payload["cost_price"], "Cost price not updated"
        assert data["markup_percentage"] == payload["markup_percentage"], "Markup not updated"
        assert data["price"] == payload["price"], "Price not updated"
        print(f"✓ Product updated: cost=${data['cost_price']}, markup={data['markup_percentage']}%, price=${data['price']}")
    
    def test_delete_product(self, auth_headers):
        """DELETE /api/products/{id} - Delete product"""
        if not TestProducts.created_product_id:
            pytest.skip("No product created")
        
        response = requests.delete(
            f"{BASE_URL}/api/products/{TestProducts.created_product_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete product failed: {response.text}"
        print(f"✓ Product deleted: {TestProducts.created_product_id}")


# ==================== SETTINGS TESTS ====================
class TestSettings:
    """Settings/Company info tests"""
    
    def test_get_settings(self, auth_headers):
        """GET /api/settings - Get business settings"""
        response = requests.get(f"{BASE_URL}/api/settings", headers=auth_headers)
        assert response.status_code == 200, f"Get settings failed: {response.text}"
        data = response.json()
        assert "setup_completed" in data, "Missing setup_completed field"
        print(f"✓ Settings retrieved: business_name={data.get('business_name', 'N/A')}")
    
    def test_update_company_settings(self, auth_headers):
        """PUT /api/settings - Update company info"""
        payload = {
            "company_logo": "https://example.com/logo.png",
            "company_address": "123 Test Street",
            "company_phone": "555-0100",
            "company_email": "test@company.com",
            "tax_id": "TAX-12345"
        }
        response = requests.put(f"{BASE_URL}/api/settings", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Update settings failed: {response.text}"
        data = response.json()
        assert data.get("company_logo") == payload["company_logo"], "Logo not updated"
        assert data.get("company_address") == payload["company_address"], "Address not updated"
        print(f"✓ Company settings updated")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
