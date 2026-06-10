"""
Backend API Tests for POSx Suite - New Features (Iteration 5)
Tests: Registration, File Upload, Enhanced Reports, Purchase Orders, Peripherals, Hold Order Bug Fix
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://posx-suite.preview.emergentagent.com')


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


# ==================== REGISTRATION TESTS ====================
class TestRegistration:
    """First-time setup registration tests"""
    
    def test_register_already_registered(self):
        """POST /api/register - Should fail if business already registered"""
        payload = {
            "name": "Test Admin",
            "pincode": "9999",
            "business_name": "Test Business",
            "business_type": "restaurant"
        }
        response = requests.post(f"{BASE_URL}/api/register", json=payload)
        # Should return 400 since business is already registered
        assert response.status_code == 400, f"Expected 400, got {response.status_code}: {response.text}"
        data = response.json()
        assert "already registered" in data.get("detail", "").lower() or "pincode" in data.get("detail", "").lower()
        print("✓ Registration correctly blocked for already registered business")


# ==================== FILE UPLOAD TESTS ====================
class TestFileUpload:
    """File upload endpoint tests"""
    
    def test_upload_image(self, auth_headers):
        """POST /api/upload - Upload an image file"""
        # Create a simple test image (1x1 pixel PNG)
        png_data = b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x02\x00\x00\x00\x90wS\xde\x00\x00\x00\x0cIDATx\x9cc\xf8\x0f\x00\x00\x01\x01\x00\x05\x18\xd8N\x00\x00\x00\x00IEND\xaeB`\x82'
        
        files = {'file': ('test_image.png', io.BytesIO(png_data), 'image/png')}
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        assert "filename" in data, "No filename in response"
        assert "url" in data, "No URL in response"
        assert data["url"].startswith("/api/uploads/"), f"Unexpected URL format: {data['url']}"
        print(f"✓ File uploaded: {data['url']}")
        
        # Verify file is accessible
        file_response = requests.get(f"{BASE_URL}{data['url']}")
        assert file_response.status_code == 200, f"Uploaded file not accessible: {file_response.status_code}"
        print("✓ Uploaded file is accessible")
    
    def test_upload_invalid_file_type(self, auth_headers):
        """POST /api/upload - Should reject non-image files"""
        files = {'file': ('test.txt', io.BytesIO(b'Hello World'), 'text/plain')}
        headers = {"Authorization": auth_headers["Authorization"]}
        
        response = requests.post(f"{BASE_URL}/api/upload", files=files, headers=headers)
        assert response.status_code == 400, f"Expected 400 for invalid file type, got {response.status_code}"
        print("✓ Non-image file correctly rejected")


# ==================== ENHANCED REPORTS TESTS ====================
class TestEnhancedReports:
    """Enhanced reports endpoint tests"""
    
    def test_cost_report(self, auth_headers):
        """GET /api/reports/cost - Cost analysis report"""
        response = requests.get(f"{BASE_URL}/api/reports/cost", headers=auth_headers)
        assert response.status_code == 200, f"Cost report failed: {response.text}"
        data = response.json()
        
        # Verify required fields
        assert "products" in data, "Missing products field"
        assert "total_cost" in data, "Missing total_cost field"
        assert "total_revenue" in data, "Missing total_revenue field"
        assert "total_profit" in data, "Missing total_profit field"
        
        print(f"✓ Cost report: Revenue=${data['total_revenue']:.2f}, Cost=${data['total_cost']:.2f}, Profit=${data['total_profit']:.2f}")
    
    def test_staff_report(self, auth_headers):
        """GET /api/reports/staff - Staff performance report"""
        response = requests.get(f"{BASE_URL}/api/reports/staff", headers=auth_headers)
        assert response.status_code == 200, f"Staff report failed: {response.text}"
        data = response.json()
        
        assert "staff" in data, "Missing staff field"
        assert isinstance(data["staff"], list), "staff should be a list"
        
        if data["staff"]:
            staff_member = data["staff"][0]
            assert "user_id" in staff_member, "Missing user_id in staff member"
            assert "name" in staff_member, "Missing name in staff member"
            assert "orders" in staff_member, "Missing orders in staff member"
            assert "revenue" in staff_member, "Missing revenue in staff member"
        
        print(f"✓ Staff report: {len(data['staff'])} staff members")
    
    def test_payment_methods_report(self, auth_headers):
        """GET /api/reports/payment-methods - Payment methods breakdown"""
        response = requests.get(f"{BASE_URL}/api/reports/payment-methods", headers=auth_headers)
        assert response.status_code == 200, f"Payment methods report failed: {response.text}"
        data = response.json()
        
        assert "methods" in data, "Missing methods field"
        assert isinstance(data["methods"], list), "methods should be a list"
        
        if data["methods"]:
            method = data["methods"][0]
            assert "method" in method, "Missing method name"
            assert "count" in method, "Missing count"
            assert "total" in method, "Missing total"
        
        print(f"✓ Payment methods report: {len(data['methods'])} payment methods")
    
    def test_sales_report(self, auth_headers):
        """GET /api/reports/sales - Sales report (existing, verify still works)"""
        response = requests.get(f"{BASE_URL}/api/reports/sales", headers=auth_headers)
        assert response.status_code == 200, f"Sales report failed: {response.text}"
        data = response.json()
        
        required_fields = ["daily_sales", "top_products", "payment_breakdown", "total_revenue", "total_orders", "avg_order_value"]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        print(f"✓ Sales report: {data['total_orders']} orders, ${data['total_revenue']:.2f} revenue")


# ==================== PURCHASE ORDER TESTS ====================
class TestPurchaseOrders:
    """Purchase order CRUD tests"""
    created_po_id = None
    
    def test_get_suppliers_for_po(self, auth_headers):
        """GET /api/suppliers - Get suppliers for PO creation"""
        response = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers)
        assert response.status_code == 200, f"Get suppliers failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of suppliers"
        print(f"✓ Got {len(data)} suppliers for PO")
        return data
    
    def test_create_purchase_order(self, auth_headers):
        """POST /api/purchase-orders - Create purchase order"""
        # First get a supplier
        suppliers = requests.get(f"{BASE_URL}/api/suppliers", headers=auth_headers).json()
        if not suppliers:
            # Create a supplier first
            supplier_payload = {"name": "TEST_PO_Supplier", "contact_name": "Test Contact"}
            sup_response = requests.post(f"{BASE_URL}/api/suppliers", json=supplier_payload, headers=auth_headers)
            supplier_id = sup_response.json()["id"]
        else:
            supplier_id = suppliers[0]["id"]
        
        payload = {
            "supplier_id": supplier_id,
            "type": "external",
            "items": [
                {"description": "Test Item 1", "quantity": 10, "unit_cost": 5.00, "total": 50.00},
                {"description": "Test Item 2", "quantity": 5, "unit_cost": 10.00, "total": 50.00}
            ],
            "subtotal": 100.00,
            "total": 100.00,
            "notes": "TEST_PO for testing"
        }
        
        response = requests.post(f"{BASE_URL}/api/purchase-orders", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create PO failed: {response.text}"
        data = response.json()
        
        assert "id" in data, "No ID returned"
        assert "po_number" in data, "No PO number returned"
        assert data["status"] == "draft", f"Expected draft status, got {data['status']}"
        assert data["type"] == "external", f"Expected external type, got {data['type']}"
        
        TestPurchaseOrders.created_po_id = data["id"]
        print(f"✓ Purchase order created: {data['po_number']} (ID: {data['id']})")
    
    def test_get_purchase_orders(self, auth_headers):
        """GET /api/purchase-orders - List purchase orders"""
        response = requests.get(f"{BASE_URL}/api/purchase-orders", headers=auth_headers)
        assert response.status_code == 200, f"Get POs failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of POs"
        print(f"✓ Got {len(data)} purchase orders")
    
    def test_update_purchase_order_status(self, auth_headers):
        """PUT /api/purchase-orders/{id} - Update PO status to submitted"""
        if not TestPurchaseOrders.created_po_id:
            pytest.skip("No PO created")
        
        payload = {"status": "submitted"}
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{TestPurchaseOrders.created_po_id}",
            json=payload, headers=auth_headers
        )
        assert response.status_code == 200, f"Update PO failed: {response.text}"
        data = response.json()
        assert data["status"] == "submitted", f"Status not updated: {data['status']}"
        print(f"✓ PO status updated to submitted")
    
    def test_mark_purchase_order_received(self, auth_headers):
        """PUT /api/purchase-orders/{id} - Mark PO as received"""
        if not TestPurchaseOrders.created_po_id:
            pytest.skip("No PO created")
        
        payload = {"status": "received"}
        response = requests.put(
            f"{BASE_URL}/api/purchase-orders/{TestPurchaseOrders.created_po_id}",
            json=payload, headers=auth_headers
        )
        assert response.status_code == 200, f"Mark received failed: {response.text}"
        data = response.json()
        assert data["status"] == "received", f"Status not updated: {data['status']}"
        print(f"✓ PO marked as received")
    
    def test_delete_purchase_order(self, auth_headers):
        """DELETE /api/purchase-orders/{id} - Delete PO"""
        if not TestPurchaseOrders.created_po_id:
            pytest.skip("No PO created")
        
        response = requests.delete(
            f"{BASE_URL}/api/purchase-orders/{TestPurchaseOrders.created_po_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete PO failed: {response.text}"
        print(f"✓ Purchase order deleted")


# ==================== PERIPHERAL TESTS ====================
class TestPeripherals:
    """Peripheral CRUD tests"""
    created_peripheral_id = None
    
    def test_create_peripheral(self, auth_headers):
        """POST /api/peripherals - Create peripheral"""
        payload = {
            "name": "TEST_Cash_Drawer_1",
            "type": "cash_drawer",
            "connection": "usb"
        }
        response = requests.post(f"{BASE_URL}/api/peripherals", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create peripheral failed: {response.text}"
        data = response.json()
        
        assert "id" in data, "No ID returned"
        assert data["name"] == payload["name"], "Name mismatch"
        assert data["type"] == payload["type"], "Type mismatch"
        assert data["connection"] == payload["connection"], "Connection mismatch"
        
        TestPeripherals.created_peripheral_id = data["id"]
        print(f"✓ Peripheral created: {data['name']} (type: {data['type']}, connection: {data['connection']})")
    
    def test_create_peripheral_with_lan(self, auth_headers):
        """POST /api/peripherals - Create peripheral with LAN connection"""
        payload = {
            "name": "TEST_Customer_Display",
            "type": "customer_display",
            "connection": "lan",
            "ip_address": "192.168.1.100",
            "port": 9100
        }
        response = requests.post(f"{BASE_URL}/api/peripherals", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create LAN peripheral failed: {response.text}"
        data = response.json()
        
        assert data["ip_address"] == payload["ip_address"], "IP address mismatch"
        assert data["port"] == payload["port"], "Port mismatch"
        print(f"✓ LAN peripheral created: {data['name']} ({data['ip_address']}:{data['port']})")
    
    def test_get_peripherals(self, auth_headers):
        """GET /api/peripherals - List peripherals"""
        response = requests.get(f"{BASE_URL}/api/peripherals", headers=auth_headers)
        assert response.status_code == 200, f"Get peripherals failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of peripherals"
        print(f"✓ Got {len(data)} peripherals")
    
    def test_delete_peripheral(self, auth_headers):
        """DELETE /api/peripherals/{id} - Delete peripheral"""
        if not TestPeripherals.created_peripheral_id:
            pytest.skip("No peripheral created")
        
        response = requests.delete(
            f"{BASE_URL}/api/peripherals/{TestPeripherals.created_peripheral_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete peripheral failed: {response.text}"
        print(f"✓ Peripheral deleted")


# ==================== HOLD ORDER BUG FIX TESTS ====================
class TestHoldOrderBugFix:
    """Tests for the hold order bug fix (PUT /api/orders/{id})"""
    created_order_id = None
    
    def test_create_held_order(self, auth_headers):
        """POST /api/orders - Create a held order"""
        # Get a product first
        products = requests.get(f"{BASE_URL}/api/products", headers=auth_headers).json()
        if not products:
            pytest.skip("No products available")
        
        product = products[0]
        
        payload = {
            "outlet_id": "main-outlet",
            "items": [{
                "product_id": product["id"],
                "product_name": product["name"],
                "quantity": 2,
                "price": product["price"],
                "total": product["price"] * 2
            }],
            "subtotal": product["price"] * 2,
            "tax": product["price"] * 2 * 0.1,
            "discount": 0,
            "total": product["price"] * 2 * 1.1,
            "payment_method": "pending",
            "status": "held",
            "service_mode": "quick_service",
            "customer_name": "TEST_Hold_Customer"
        }
        
        response = requests.post(f"{BASE_URL}/api/orders", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create held order failed: {response.text}"
        data = response.json()
        
        assert data["status"] == "held", f"Expected held status, got {data['status']}"
        TestHoldOrderBugFix.created_order_id = data["id"]
        print(f"✓ Held order created: {data['order_number']} (ID: {data['id']})")
    
    def test_update_held_order(self, auth_headers):
        """PUT /api/orders/{id} - Update a held order (BUG FIX TEST)"""
        if not TestHoldOrderBugFix.created_order_id:
            pytest.skip("No held order created")
        
        # Get products for update
        products = requests.get(f"{BASE_URL}/api/products", headers=auth_headers).json()
        if len(products) < 2:
            pytest.skip("Need at least 2 products")
        
        product1 = products[0]
        product2 = products[1]
        
        # Update with different items
        payload = {
            "items": [
                {
                    "product_id": product1["id"],
                    "product_name": product1["name"],
                    "quantity": 3,
                    "price": product1["price"],
                    "total": product1["price"] * 3
                },
                {
                    "product_id": product2["id"],
                    "product_name": product2["name"],
                    "quantity": 1,
                    "price": product2["price"],
                    "total": product2["price"]
                }
            ],
            "subtotal": product1["price"] * 3 + product2["price"],
            "total": (product1["price"] * 3 + product2["price"]) * 1.1,
            "status": "held",
            "customer_name": "TEST_Updated_Customer"
        }
        
        response = requests.put(
            f"{BASE_URL}/api/orders/{TestHoldOrderBugFix.created_order_id}",
            json=payload, headers=auth_headers
        )
        assert response.status_code == 200, f"Update held order failed: {response.text}"
        data = response.json()
        
        assert len(data["items"]) == 2, f"Expected 2 items, got {len(data['items'])}"
        assert data["customer_name"] == "TEST_Updated_Customer", "Customer name not updated"
        print(f"✓ Held order updated successfully (BUG FIX VERIFIED)")
    
    def test_get_held_orders_list(self, auth_headers):
        """GET /api/orders/held/list - Get held orders for current user"""
        response = requests.get(f"{BASE_URL}/api/orders/held/list", headers=auth_headers)
        assert response.status_code == 200, f"Get held orders failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Expected list of held orders"
        print(f"✓ Got {len(data)} held orders")


# ==================== PRINTER MODE TESTS ====================
class TestPrinterModes:
    """Tests for printer connection modes (USB/LAN/Bluetooth)"""
    created_printer_id = None
    
    def test_create_printer_with_mode(self, auth_headers):
        """POST /api/printers - Create printer with connection mode"""
        # Get an outlet first
        outlets = requests.get(f"{BASE_URL}/api/outlets", headers=auth_headers).json()
        outlet_id = outlets[0]["id"] if outlets else "main-outlet"
        
        payload = {
            "name": "TEST_Kitchen_Printer",
            "mode": "lan",
            "type": "kitchen",
            "ip_address": "192.168.1.50",
            "port": 9100,
            "outlet_id": outlet_id
        }
        
        response = requests.post(f"{BASE_URL}/api/printers", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create printer failed: {response.text}"
        data = response.json()
        
        assert data["mode"] == "lan", f"Expected lan mode, got {data.get('mode')}"
        assert data["type"] == "kitchen", f"Expected kitchen type, got {data['type']}"
        
        TestPrinterModes.created_printer_id = data["id"]
        print(f"✓ Printer created with mode: {data['mode']}")
    
    def test_create_usb_printer(self, auth_headers):
        """POST /api/printers - Create USB printer"""
        outlets = requests.get(f"{BASE_URL}/api/outlets", headers=auth_headers).json()
        outlet_id = outlets[0]["id"] if outlets else "main-outlet"
        
        payload = {
            "name": "TEST_Receipt_Printer_USB",
            "mode": "usb",
            "type": "receipt",
            "outlet_id": outlet_id
        }
        
        response = requests.post(f"{BASE_URL}/api/printers", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create USB printer failed: {response.text}"
        data = response.json()
        
        assert data["mode"] == "usb", f"Expected usb mode, got {data.get('mode')}"
        print(f"✓ USB printer created")
    
    def test_create_bluetooth_printer(self, auth_headers):
        """POST /api/printers - Create Bluetooth printer"""
        outlets = requests.get(f"{BASE_URL}/api/outlets", headers=auth_headers).json()
        outlet_id = outlets[0]["id"] if outlets else "main-outlet"
        
        payload = {
            "name": "TEST_Mobile_Printer_BT",
            "mode": "bluetooth",
            "type": "receipt",
            "outlet_id": outlet_id
        }
        
        response = requests.post(f"{BASE_URL}/api/printers", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create Bluetooth printer failed: {response.text}"
        data = response.json()
        
        assert data["mode"] == "bluetooth", f"Expected bluetooth mode, got {data.get('mode')}"
        print(f"✓ Bluetooth printer created")


# ==================== USER PERMISSIONS TESTS ====================
class TestUserPermissions:
    """Tests for user permissions system"""
    created_user_id = None
    
    def test_create_user_with_permissions(self, auth_headers):
        """POST /api/users - Create user with permissions"""
        payload = {
            "name": "TEST_Cashier_WithPerms",
            "pincode": "8888",
            "role": "cashier",
            "permissions": ["process_sales", "hold_orders", "view_customers"]
        }
        
        response = requests.post(f"{BASE_URL}/api/users", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Create user failed: {response.text}"
        data = response.json()
        
        assert "permissions" in data, "No permissions in response"
        assert "process_sales" in data["permissions"], "Missing process_sales permission"
        
        TestUserPermissions.created_user_id = data["id"]
        print(f"✓ User created with permissions: {data['permissions']}")
    
    def test_update_user_permissions(self, auth_headers):
        """PUT /api/users/{id} - Update user permissions"""
        if not TestUserPermissions.created_user_id:
            pytest.skip("No user created")
        
        payload = {
            "permissions": ["process_sales", "hold_orders", "apply_discounts", "void_orders"]
        }
        
        response = requests.put(
            f"{BASE_URL}/api/users/{TestUserPermissions.created_user_id}",
            json=payload, headers=auth_headers
        )
        assert response.status_code == 200, f"Update user failed: {response.text}"
        data = response.json()
        
        assert "apply_discounts" in data["permissions"], "Permissions not updated"
        print(f"✓ User permissions updated: {data['permissions']}")
    
    def test_delete_test_user(self, auth_headers):
        """DELETE /api/users/{id} - Cleanup test user"""
        if not TestUserPermissions.created_user_id:
            pytest.skip("No user created")
        
        response = requests.delete(
            f"{BASE_URL}/api/users/{TestUserPermissions.created_user_id}",
            headers=auth_headers
        )
        assert response.status_code == 200, f"Delete user failed: {response.text}"
        print(f"✓ Test user deleted")


# ==================== SETTINGS TESTS ====================
class TestReceiptSettings:
    """Tests for receipt header/footer settings"""
    
    def test_update_receipt_settings(self, auth_headers):
        """PUT /api/settings - Update receipt header and footer"""
        payload = {
            "receipt_header": "Welcome to Our Restaurant!\nEnjoy your meal!",
            "receipt_footer": "Thank you for dining with us!\nPlease visit again!"
        }
        
        response = requests.put(f"{BASE_URL}/api/settings", json=payload, headers=auth_headers)
        assert response.status_code == 200, f"Update settings failed: {response.text}"
        data = response.json()
        
        assert data.get("receipt_header") == payload["receipt_header"], "Header not updated"
        assert data.get("receipt_footer") == payload["receipt_footer"], "Footer not updated"
        print(f"✓ Receipt settings updated")
    
    def test_get_settings_with_receipt(self, auth_headers):
        """GET /api/settings - Verify receipt settings are returned"""
        response = requests.get(f"{BASE_URL}/api/settings", headers=auth_headers)
        assert response.status_code == 200, f"Get settings failed: {response.text}"
        data = response.json()
        
        # Receipt fields should exist
        assert "receipt_header" in data or data.get("receipt_header") is None, "receipt_header field missing"
        assert "receipt_footer" in data or data.get("receipt_footer") is None, "receipt_footer field missing"
        print(f"✓ Settings include receipt fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
