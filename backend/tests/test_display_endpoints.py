"""
Test Customer-Facing Display (CDS) API endpoints
Tests: GET /api/display/current, POST /api/display/update, POST /api/display/clear
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDisplayEndpoints:
    """Customer-Facing Display API tests"""
    
    def test_get_display_current_default_terminal(self):
        """GET /api/display/current - returns welcome state when no active order"""
        response = requests.get(f"{BASE_URL}/api/display/current?terminal_id=default")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        # Verify response structure
        assert "terminal_id" in data
        assert "status" in data
        assert "items" in data
        assert "subtotal" in data
        assert "tax" in data
        assert "total" in data
        
        # When no active order, should be welcome state
        assert data["status"] in ["welcome", "idle", "paid"], f"Unexpected status: {data['status']}"
        print(f"Display current state: {data['status']}")
    
    def test_post_display_update_with_items(self):
        """POST /api/display/update - pushes cart items to display"""
        payload = {
            "terminal_id": "default",
            "items": [
                {"product_name": "Test Burger", "quantity": 2, "price": 9.99, "total": 19.98},
                {"product_name": "Test Fries", "quantity": 1, "price": 4.99, "total": 4.99}
            ],
            "subtotal": 24.97,
            "tax": 2.50,
            "total": 27.47,
            "status": "active",
            "message": ""
        }
        
        response = requests.post(f"{BASE_URL}/api/display/update", json=payload)
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, f"Expected ok=True, got {data}"
        print("Display update successful")
    
    def test_get_display_current_after_update(self):
        """GET /api/display/current - returns active order after update"""
        # First push an update
        payload = {
            "terminal_id": "default",
            "items": [
                {"product_name": "Test Pizza", "quantity": 1, "price": 15.99, "total": 15.99}
            ],
            "subtotal": 15.99,
            "tax": 1.60,
            "total": 17.59,
            "status": "active",
            "message": "Order in progress"
        }
        
        update_response = requests.post(f"{BASE_URL}/api/display/update", json=payload)
        assert update_response.status_code == 200
        
        # Now get the display
        response = requests.get(f"{BASE_URL}/api/display/current?terminal_id=default")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "active", f"Expected active status, got {data['status']}"
        assert len(data["items"]) == 1, f"Expected 1 item, got {len(data['items'])}"
        assert data["items"][0]["product_name"] == "Test Pizza"
        assert data["subtotal"] == 15.99
        assert data["tax"] == 1.60
        assert data["total"] == 17.59
        print(f"Display shows active order with {len(data['items'])} items, total: ${data['total']}")
    
    def test_post_display_clear(self):
        """POST /api/display/clear - clears display and sets paid/thank you state"""
        response = requests.post(f"{BASE_URL}/api/display/clear?terminal_id=default")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        data = response.json()
        assert data.get("ok") == True, f"Expected ok=True, got {data}"
        print("Display cleared successfully")
    
    def test_get_display_current_after_clear(self):
        """GET /api/display/current - returns paid/thank you state after clear"""
        # First clear the display
        clear_response = requests.post(f"{BASE_URL}/api/display/clear?terminal_id=default")
        assert clear_response.status_code == 200
        
        # Now get the display
        response = requests.get(f"{BASE_URL}/api/display/current?terminal_id=default")
        assert response.status_code == 200
        
        data = response.json()
        assert data["status"] == "paid", f"Expected paid status, got {data['status']}"
        assert data["message"] == "Thank you!", f"Expected 'Thank you!' message, got {data['message']}"
        assert len(data["items"]) == 0, f"Expected 0 items after clear, got {len(data['items'])}"
        print(f"Display shows paid state with message: {data['message']}")
    
    def test_display_update_empty_cart(self):
        """POST /api/display/update - handles empty cart (idle state)"""
        payload = {
            "terminal_id": "default",
            "items": [],
            "subtotal": 0,
            "tax": 0,
            "total": 0,
            "status": "idle",
            "message": "Welcome!"
        }
        
        response = requests.post(f"{BASE_URL}/api/display/update", json=payload)
        assert response.status_code == 200
        
        # Verify the state
        get_response = requests.get(f"{BASE_URL}/api/display/current?terminal_id=default")
        assert get_response.status_code == 200
        
        data = get_response.json()
        assert data["status"] == "idle"
        assert len(data["items"]) == 0
        print("Empty cart update successful - idle state")
    
    def test_display_multiple_terminals(self):
        """Test that different terminals have independent display states"""
        # Update terminal 1
        payload1 = {
            "terminal_id": "terminal_1",
            "items": [{"product_name": "Item A", "quantity": 1, "price": 10.00, "total": 10.00}],
            "subtotal": 10.00,
            "tax": 1.00,
            "total": 11.00,
            "status": "active"
        }
        
        # Update terminal 2
        payload2 = {
            "terminal_id": "terminal_2",
            "items": [{"product_name": "Item B", "quantity": 2, "price": 5.00, "total": 10.00}],
            "subtotal": 10.00,
            "tax": 1.00,
            "total": 11.00,
            "status": "active"
        }
        
        requests.post(f"{BASE_URL}/api/display/update", json=payload1)
        requests.post(f"{BASE_URL}/api/display/update", json=payload2)
        
        # Verify terminal 1
        resp1 = requests.get(f"{BASE_URL}/api/display/current?terminal_id=terminal_1")
        data1 = resp1.json()
        assert data1["items"][0]["product_name"] == "Item A"
        
        # Verify terminal 2
        resp2 = requests.get(f"{BASE_URL}/api/display/current?terminal_id=terminal_2")
        data2 = resp2.json()
        assert data2["items"][0]["product_name"] == "Item B"
        
        print("Multiple terminals have independent display states")


class TestPrinterManagerCode:
    """Code inspection tests for printerManager.js features"""
    
    def test_printer_manager_file_exists(self):
        """Verify printerManager.js exists"""
        import os
        path = "/app/frontend/src/utils/printerManager.js"
        assert os.path.exists(path), f"printerManager.js not found at {path}"
        print("printerManager.js exists")
    
    def test_image_to_escpos_method_exists(self):
        """Verify imageToEscPos() method exists in printerManager.js"""
        with open("/app/frontend/src/utils/printerManager.js", "r") as f:
            content = f.read()
        
        assert "imageToEscPos" in content, "imageToEscPos method not found"
        assert "GS v 0" in content or "\\x1D\\x76\\x30" in content, "GS v 0 raster command not found"
        print("imageToEscPos() method found with GS v 0 command")
    
    def test_print_receipt_accepts_settings(self):
        """Verify printReceipt() accepts settings object with logo, header, footer"""
        with open("/app/frontend/src/utils/printerManager.js", "r") as f:
            content = f.read()
        
        # Check printReceipt signature
        assert "printReceipt(order, settings" in content, "printReceipt should accept settings parameter"
        assert "company_logo" in content, "company_logo not found in printReceipt"
        assert "receipt_header" in content, "receipt_header not found in printReceipt"
        assert "receipt_footer" in content, "receipt_footer not found in printReceipt"
        print("printReceipt() accepts settings with company_logo, receipt_header, receipt_footer")
    
    def test_print_via_bluetooth_method_exists(self):
        """Verify printViaBluetooth() method exists"""
        with open("/app/frontend/src/utils/printerManager.js", "r") as f:
            content = f.read()
        
        assert "printViaBluetooth" in content, "printViaBluetooth method not found"
        assert "navigator.bluetooth" in content, "Web Bluetooth API usage not found"
        print("printViaBluetooth() method found with Web Bluetooth API")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
