import requests
import sys
import json
from datetime import datetime

class POSSystemTester:
    def __init__(self, base_url="https://posx-suite.preview.emergentagent.com"):
        self.base_url = base_url
        self.admin_token = None
        self.cashier_token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.admin_user = None
        self.cashier_user = None
        self.test_outlet_id = None
        self.test_product_id = None
        self.test_customer_id = None

    def run_test(self, name, method, endpoint, expected_status, data=None, token=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        if token:
            headers['Authorization'] = f'Bearer {token}'

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return success, response.json()
                except:
                    return success, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    print(f"Response: {response.text}")
                except:
                    pass
                return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_seed_database(self):
        """Seed the database with initial data"""
        print("\n🌱 Seeding database...")
        success, response = self.run_test(
            "Seed Database",
            "POST",
            "seed",
            200
        )
        return success

    def test_admin_login(self):
        """Test admin login"""
        success, response = self.run_test(
            "Admin Login",
            "POST",
            "auth/login",
            200,
            data={"pincode": "123456"}
        )
        if success and 'token' in response:
            self.admin_token = response['token']
            self.admin_user = response['user']
            print(f"Admin user: {self.admin_user}")
            return True
        return False

    def test_cashier_login(self):
        """Test cashier login"""
        success, response = self.run_test(
            "Cashier Login",
            "POST",
            "auth/login",
            200,
            data={"pincode": "1111"}
        )
        if success and 'token' in response:
            self.cashier_token = response['token']
            self.cashier_user = response['user']
            print(f"Cashier user: {self.cashier_user}")
            return True
        return False

    def test_invalid_login(self):
        """Test invalid login"""
        success, response = self.run_test(
            "Invalid Login",
            "POST",
            "auth/login",
            401,
            data={"pincode": "999999"}
        )
        return success

    def test_get_me(self):
        """Test get current user"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200,
            token=self.admin_token
        )
        return success

    def test_get_outlets(self):
        """Test get outlets"""
        success, response = self.run_test(
            "Get Outlets",
            "GET",
            "outlets",
            200,
            token=self.admin_token
        )
        if success and response:
            self.test_outlet_id = response[0]['id'] if response else None
            print(f"Found {len(response)} outlets")
        return success

    def test_get_categories(self):
        """Test get categories"""
        success, response = self.run_test(
            "Get Categories",
            "GET",
            "categories",
            200,
            token=self.admin_token
        )
        if success:
            print(f"Found {len(response)} categories")
        return success

    def test_get_products(self):
        """Test get products"""
        success, response = self.run_test(
            "Get Products",
            "GET",
            "products",
            200,
            token=self.admin_token
        )
        if success and response:
            self.test_product_id = response[0]['id'] if response else None
            print(f"Found {len(response)} products")
        return success

    def test_get_stock(self):
        """Test get stock"""
        success, response = self.run_test(
            "Get Stock",
            "GET",
            "stock",
            200,
            token=self.admin_token
        )
        if success:
            print(f"Found {len(response)} stock entries")
        return success

    def test_get_low_stock(self):
        """Test get low stock"""
        success, response = self.run_test(
            "Get Low Stock",
            "GET",
            "stock/low",
            200,
            token=self.admin_token
        )
        if success:
            print(f"Found {len(response)} low stock items")
        return success

    def test_create_customer(self):
        """Test create customer"""
        success, response = self.run_test(
            "Create Customer",
            "POST",
            "customers",
            200,
            data={
                "name": "Test Customer",
                "phone": "555-1234",
                "email": "test@example.com"
            },
            token=self.admin_token
        )
        if success and 'id' in response:
            self.test_customer_id = response['id']
        return success

    def test_get_customers(self):
        """Test get customers"""
        success, response = self.run_test(
            "Get Customers",
            "GET",
            "customers",
            200,
            token=self.admin_token
        )
        if success:
            print(f"Found {len(response)} customers")
        return success

    def test_create_order(self):
        """Test create order"""
        if not self.test_outlet_id or not self.test_product_id:
            print("❌ Cannot test order creation - missing outlet or product")
            return False

        order_data = {
            "outlet_id": self.test_outlet_id,
            "customer_id": self.test_customer_id,
            "customer_name": "Test Customer",
            "items": [
                {
                    "product_id": self.test_product_id,
                    "product_name": "Test Product",
                    "quantity": 2,
                    "price": 10.99,
                    "total": 21.98
                }
            ],
            "subtotal": 21.98,
            "tax": 0.0,
            "discount": 0.0,
            "total": 21.98,
            "payment_method": "cash"
        }

        success, response = self.run_test(
            "Create Order",
            "POST",
            "orders",
            200,
            data=order_data,
            token=self.cashier_token
        )
        return success

    def test_get_orders(self):
        """Test get orders"""
        success, response = self.run_test(
            "Get Orders",
            "GET",
            "orders",
            200,
            token=self.admin_token
        )
        if success:
            print(f"Found {len(response)} orders")
        return success

    def test_dashboard_analytics(self):
        """Test dashboard analytics"""
        success, response = self.run_test(
            "Dashboard Analytics",
            "GET",
            "analytics/dashboard",
            200,
            token=self.admin_token
        )
        if success:
            print(f"Analytics: {response}")
        return success

    def test_user_management(self):
        """Test user management (admin only)"""
        # Get users
        success, response = self.run_test(
            "Get Users",
            "GET",
            "users",
            200,
            token=self.admin_token
        )
        if not success:
            return False

        # Test cashier cannot access users
        success, response = self.run_test(
            "Cashier Get Users (Should Fail)",
            "GET",
            "users",
            403,
            token=self.cashier_token
        )
        return success

    def test_role_based_access(self):
        """Test role-based access control"""
        # Admin should access everything
        admin_tests = [
            ("users", 200),
            ("outlets", 200),
            ("products", 200),
            ("stock", 200),
            ("customers", 200),
            ("orders", 200)
        ]

        for endpoint, expected_status in admin_tests:
            success, _ = self.run_test(
                f"Admin Access {endpoint}",
                "GET",
                endpoint,
                expected_status,
                token=self.admin_token
            )
            if not success:
                return False

        # Cashier should have limited access
        cashier_tests = [
            ("users", 403),  # Should fail
            ("outlets", 200),  # Should work
            ("products", 200),  # Should work
            ("customers", 200),  # Should work
            ("orders", 200)  # Should work
        ]

        for endpoint, expected_status in cashier_tests:
            success, _ = self.run_test(
                f"Cashier Access {endpoint}",
                "GET",
                endpoint,
                expected_status,
                token=self.cashier_token
            )
            if not success:
                return False

        return True

def main():
    print("🚀 Starting POS System Backend Testing...")
    tester = POSSystemTester()

    # Test sequence
    tests = [
        ("Seed Database", tester.test_seed_database),
        ("Admin Login", tester.test_admin_login),
        ("Cashier Login", tester.test_cashier_login),
        ("Invalid Login", tester.test_invalid_login),
        ("Get Current User", tester.test_get_me),
        ("Get Outlets", tester.test_get_outlets),
        ("Get Categories", tester.test_get_categories),
        ("Get Products", tester.test_get_products),
        ("Get Stock", tester.test_get_stock),
        ("Get Low Stock", tester.test_get_low_stock),
        ("Create Customer", tester.test_create_customer),
        ("Get Customers", tester.test_get_customers),
        ("Create Order", tester.test_create_order),
        ("Get Orders", tester.test_get_orders),
        ("Dashboard Analytics", tester.test_dashboard_analytics),
        ("User Management", tester.test_user_management),
        ("Role-Based Access", tester.test_role_based_access)
    ]

    failed_tests = []
    for test_name, test_func in tests:
        try:
            if not test_func():
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} failed with exception: {str(e)}")
            failed_tests.append(test_name)

    # Print results
    print(f"\n📊 Test Results:")
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run)*100:.1f}%")
    
    if failed_tests:
        print(f"\n❌ Failed tests: {', '.join(failed_tests)}")
        return 1
    else:
        print("\n✅ All tests passed!")
        return 0

if __name__ == "__main__":
    sys.exit(main())