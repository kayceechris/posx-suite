"""
Test cases for Business Type settings and table service functionality
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://posx-suite.preview.emergentagent.com')

# Test credentials
ADMIN_PINCODE = "123456"
WAITER_PINCODE = "2222"
CASHIER_PINCODE = "1111"


class TestSettingsAPI:
    """Test GET and PUT /api/settings endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": ADMIN_PINCODE})
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        self.admin_token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_get_settings_returns_business_type(self):
        """GET /api/settings should return business_type field"""
        response = requests.get(f"{BASE_URL}/api/settings")
        assert response.status_code == 200
        data = response.json()
        assert "business_type" in data, "business_type field missing from settings"
        assert data["business_type"] in ["restaurant", "cafe", "bar", "nightclub", "supermarket", "retail"]
        print(f"Current business_type: {data['business_type']}")
    
    def test_update_business_type_to_supermarket(self):
        """PUT /api/settings with business_type='supermarket' should update"""
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "supermarket"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["business_type"] == "supermarket"
        print("Successfully updated business_type to supermarket")
    
    def test_update_business_type_to_restaurant(self):
        """PUT /api/settings with business_type='restaurant' should update"""
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "restaurant"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["business_type"] == "restaurant"
        print("Successfully updated business_type to restaurant")
    
    def test_update_business_type_to_cafe(self):
        """PUT /api/settings with business_type='cafe' should update"""
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "cafe"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["business_type"] == "cafe"
        print("Successfully updated business_type to cafe")
    
    def test_update_business_type_to_bar(self):
        """PUT /api/settings with business_type='bar' should update"""
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "bar"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["business_type"] == "bar"
        print("Successfully updated business_type to bar")
    
    def test_update_business_type_to_nightclub(self):
        """PUT /api/settings with business_type='nightclub' should update"""
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "nightclub"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["business_type"] == "nightclub"
        print("Successfully updated business_type to nightclub")
    
    def test_update_business_type_to_retail(self):
        """PUT /api/settings with business_type='retail' should update"""
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "retail"},
            headers=self.headers
        )
        assert response.status_code == 200
        data = response.json()
        assert data["business_type"] == "retail"
        print("Successfully updated business_type to retail")
    
    def test_settings_update_requires_auth(self):
        """PUT /api/settings without auth should fail"""
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "supermarket"}
        )
        assert response.status_code in [401, 403], "Settings update should require authentication"
        print("Settings update correctly requires authentication")
    
    def test_settings_update_requires_admin_role(self):
        """PUT /api/settings with non-admin user should fail"""
        # Login as cashier
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": CASHIER_PINCODE})
        assert login_response.status_code == 200
        cashier_token = login_response.json()["token"]
        
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "supermarket"},
            headers={"Authorization": f"Bearer {cashier_token}"}
        )
        assert response.status_code == 403, "Settings update should require admin role"
        print("Settings update correctly requires admin role")


class TestTableServiceTypes:
    """Test that table service types are correctly identified"""
    
    TABLE_SERVICE_TYPES = ["restaurant", "nightclub", "bar", "cafe"]
    QUICK_SERVICE_TYPES = ["supermarket", "retail"]
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": ADMIN_PINCODE})
        assert response.status_code == 200
        self.admin_token = response.json()["token"]
        self.headers = {"Authorization": f"Bearer {self.admin_token}"}
    
    def test_restaurant_has_table_service(self):
        """Restaurant should have table service enabled"""
        assert "restaurant" in self.TABLE_SERVICE_TYPES
        print("Restaurant correctly identified as table service type")
    
    def test_cafe_has_table_service(self):
        """Cafe should have table service enabled"""
        assert "cafe" in self.TABLE_SERVICE_TYPES
        print("Cafe correctly identified as table service type")
    
    def test_bar_has_table_service(self):
        """Bar should have table service enabled"""
        assert "bar" in self.TABLE_SERVICE_TYPES
        print("Bar correctly identified as table service type")
    
    def test_nightclub_has_table_service(self):
        """Nightclub should have table service enabled"""
        assert "nightclub" in self.TABLE_SERVICE_TYPES
        print("Nightclub correctly identified as table service type")
    
    def test_supermarket_no_table_service(self):
        """Supermarket should NOT have table service"""
        assert "supermarket" in self.QUICK_SERVICE_TYPES
        assert "supermarket" not in self.TABLE_SERVICE_TYPES
        print("Supermarket correctly identified as quick service type")
    
    def test_retail_no_table_service(self):
        """Retail should NOT have table service"""
        assert "retail" in self.QUICK_SERVICE_TYPES
        assert "retail" not in self.TABLE_SERVICE_TYPES
        print("Retail correctly identified as quick service type")


class TestCleanup:
    """Restore settings to restaurant after tests"""
    
    def test_restore_restaurant_type(self):
        """Restore business_type to restaurant"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": ADMIN_PINCODE})
        assert response.status_code == 200
        token = response.json()["token"]
        
        response = requests.put(
            f"{BASE_URL}/api/settings",
            json={"business_type": "restaurant"},
            headers={"Authorization": f"Bearer {token}"}
        )
        assert response.status_code == 200
        assert response.json()["business_type"] == "restaurant"
        print("Restored business_type to restaurant")
