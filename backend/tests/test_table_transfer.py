"""
Test suite for Table Transfer Feature
Tests the POST /api/tables/{table_id}/transfer endpoint and GET /api/users/waiters endpoint
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://posx-suite.preview.emergentagent.com').rstrip('/')


class TestTableTransferFeature:
    """Tests for table transfer functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data - seed database and get tokens"""
        # Seed database first
        response = requests.post(f"{BASE_URL}/api/seed")
        print(f"Seed response: {response.status_code}")
        
        # Login as admin
        admin_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "123456"})
        assert admin_response.status_code == 200, f"Admin login failed: {admin_response.text}"
        admin_data = admin_response.json()
        self.admin_token = admin_data['token']
        self.admin_user = admin_data['user']
        
        # Login as waiter
        waiter_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "2222"})
        assert waiter_response.status_code == 200, f"Waiter login failed: {waiter_response.text}"
        waiter_data = waiter_response.json()
        self.waiter_token = waiter_data['token']
        self.waiter_user = waiter_data['user']
        
        # Login as cashier
        cashier_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "1111"})
        assert cashier_response.status_code == 200, f"Cashier login failed: {cashier_response.text}"
        cashier_data = cashier_response.json()
        self.cashier_token = cashier_data['token']
        self.cashier_user = cashier_data['user']
        
        # Get tables
        tables_response = requests.get(
            f"{BASE_URL}/api/tables",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert tables_response.status_code == 200
        self.tables = tables_response.json()
        
        yield
        
        # Cleanup - release any claimed tables
        for table in self.tables:
            if table.get('status') == 'occupied':
                try:
                    requests.post(
                        f"{BASE_URL}/api/tables/{table['id']}/release",
                        headers={"Authorization": f"Bearer {self.admin_token}"}
                    )
                except:
                    pass

    # ==================== GET /api/users/waiters Tests ====================
    
    def test_get_waiters_returns_active_waiters_and_cashiers(self):
        """GET /api/users/waiters - returns active waiters and cashiers"""
        response = requests.get(
            f"{BASE_URL}/api/users/waiters",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}: {response.text}"
        
        waiters = response.json()
        assert isinstance(waiters, list), "Response should be a list"
        assert len(waiters) >= 2, f"Expected at least 2 waiters/cashiers, got {len(waiters)}"
        
        # Verify structure
        for waiter in waiters:
            assert 'id' in waiter, "Waiter should have id"
            assert 'name' in waiter, "Waiter should have name"
            assert 'role' in waiter, "Waiter should have role"
            assert waiter['role'] in ['waiter', 'cashier'], f"Role should be waiter or cashier, got {waiter['role']}"
        
        print(f"Found {len(waiters)} waiters/cashiers: {[w['name'] for w in waiters]}")

    def test_get_waiters_requires_authentication(self):
        """GET /api/users/waiters - requires authentication"""
        response = requests.get(f"{BASE_URL}/api/users/waiters")
        
        # Should fail without auth
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"

    # ==================== POST /api/tables/{table_id}/transfer Tests ====================
    
    def test_waiter_can_transfer_own_occupied_table(self):
        """POST /api/tables/{table_id}/transfer - waiter can transfer their own occupied table"""
        # First, claim a table as waiter
        table = self.tables[0]
        claim_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/claim",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        assert claim_response.status_code == 200, f"Failed to claim table: {claim_response.text}"
        
        # Get cashier ID to transfer to
        waiters_response = requests.get(
            f"{BASE_URL}/api/users/waiters",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        waiters = waiters_response.json()
        target_waiter = next((w for w in waiters if w['id'] != self.waiter_user['id']), None)
        assert target_waiter is not None, "No other waiter/cashier found to transfer to"
        
        # Transfer the table
        transfer_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/transfer",
            json={"new_waiter_id": target_waiter['id']},
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert transfer_response.status_code == 200, f"Transfer failed: {transfer_response.text}"
        
        # Verify the transfer
        updated_table = transfer_response.json()
        assert updated_table['waiter_id'] == target_waiter['id'], "Table waiter_id should be updated"
        assert updated_table['waiter_name'] == target_waiter['name'], "Table waiter_name should be updated"
        
        print(f"Successfully transferred table {table['number']} to {target_waiter['name']}")

    def test_admin_can_transfer_any_occupied_table(self):
        """POST /api/tables/{table_id}/transfer - admin can transfer any occupied table"""
        # First, claim a table as waiter
        table = self.tables[1]
        claim_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/claim",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        assert claim_response.status_code == 200, f"Failed to claim table: {claim_response.text}"
        
        # Get cashier ID to transfer to
        waiters_response = requests.get(
            f"{BASE_URL}/api/users/waiters",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        waiters = waiters_response.json()
        target_waiter = next((w for w in waiters if w['id'] != self.waiter_user['id']), None)
        assert target_waiter is not None, "No other waiter/cashier found"
        
        # Admin transfers the table (not the owner)
        transfer_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/transfer",
            json={"new_waiter_id": target_waiter['id']},
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        
        assert transfer_response.status_code == 200, f"Admin transfer failed: {transfer_response.text}"
        
        # Verify the transfer
        updated_table = transfer_response.json()
        assert updated_table['waiter_id'] == target_waiter['id'], "Table waiter_id should be updated"
        
        print(f"Admin successfully transferred table {table['number']} to {target_waiter['name']}")

    def test_transfer_rejects_non_occupied_table(self):
        """POST /api/tables/{table_id}/transfer - should reject if table is not occupied"""
        # Find an available table
        available_table = next((t for t in self.tables if t['status'] == 'available'), None)
        
        if available_table is None:
            # Release a table first
            table = self.tables[2]
            requests.post(
                f"{BASE_URL}/api/tables/{table['id']}/release",
                headers={"Authorization": f"Bearer {self.admin_token}"}
            )
            available_table = table
        
        # Try to transfer an available table
        transfer_response = requests.post(
            f"{BASE_URL}/api/tables/{available_table['id']}/transfer",
            json={"new_waiter_id": self.cashier_user['id']},
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        
        assert transfer_response.status_code == 400, f"Expected 400 for non-occupied table, got {transfer_response.status_code}"
        
        error_detail = transfer_response.json().get('detail', '')
        assert 'not occupied' in error_detail.lower(), f"Error should mention table not occupied: {error_detail}"
        
        print(f"Correctly rejected transfer of non-occupied table: {error_detail}")

    def test_transfer_rejects_same_waiter(self):
        """POST /api/tables/{table_id}/transfer - should reject if target is the same waiter"""
        # Claim a table as waiter
        table = self.tables[3]
        claim_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/claim",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        assert claim_response.status_code == 200, f"Failed to claim table: {claim_response.text}"
        
        # Try to transfer to the same waiter
        transfer_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/transfer",
            json={"new_waiter_id": self.waiter_user['id']},
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert transfer_response.status_code == 400, f"Expected 400 for same waiter, got {transfer_response.status_code}"
        
        error_detail = transfer_response.json().get('detail', '')
        assert 'already assigned' in error_detail.lower(), f"Error should mention already assigned: {error_detail}"
        
        print(f"Correctly rejected transfer to same waiter: {error_detail}")

    def test_transfer_rejects_unauthorized_waiter(self):
        """POST /api/tables/{table_id}/transfer - waiter cannot transfer another waiter's table"""
        # Claim a table as cashier
        table = self.tables[4]
        claim_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/claim",
            headers={"Authorization": f"Bearer {self.cashier_token}"}
        )
        assert claim_response.status_code == 200, f"Failed to claim table: {claim_response.text}"
        
        # Waiter tries to transfer cashier's table (should fail)
        transfer_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/transfer",
            json={"new_waiter_id": self.waiter_user['id']},
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert transfer_response.status_code == 403, f"Expected 403 for unauthorized transfer, got {transfer_response.status_code}"
        
        error_detail = transfer_response.json().get('detail', '')
        assert 'not authorized' in error_detail.lower(), f"Error should mention not authorized: {error_detail}"
        
        print(f"Correctly rejected unauthorized transfer: {error_detail}")

    def test_transfer_rejects_invalid_target_waiter(self):
        """POST /api/tables/{table_id}/transfer - should reject invalid target waiter ID"""
        # Claim a table as waiter
        table = self.tables[5]
        claim_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/claim",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        assert claim_response.status_code == 200, f"Failed to claim table: {claim_response.text}"
        
        # Try to transfer to non-existent waiter
        transfer_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/transfer",
            json={"new_waiter_id": "non-existent-id-12345"},
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert transfer_response.status_code == 404, f"Expected 404 for invalid waiter, got {transfer_response.status_code}"
        
        print("Correctly rejected transfer to non-existent waiter")

    def test_transfer_rejects_non_waiter_target(self):
        """POST /api/tables/{table_id}/transfer - should reject if target is not a waiter/cashier"""
        # Claim a table as waiter
        table = self.tables[6]
        claim_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/claim",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        assert claim_response.status_code == 200, f"Failed to claim table: {claim_response.text}"
        
        # Try to transfer to admin (not a waiter/cashier)
        transfer_response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/transfer",
            json={"new_waiter_id": self.admin_user['id']},
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert transfer_response.status_code == 400, f"Expected 400 for non-waiter target, got {transfer_response.status_code}"
        
        error_detail = transfer_response.json().get('detail', '')
        assert 'waiter or cashier' in error_detail.lower(), f"Error should mention waiter or cashier: {error_detail}"
        
        print(f"Correctly rejected transfer to non-waiter: {error_detail}")

    def test_transfer_requires_authentication(self):
        """POST /api/tables/{table_id}/transfer - requires authentication"""
        table = self.tables[0]
        
        response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/transfer",
            json={"new_waiter_id": self.cashier_user['id']}
        )
        
        assert response.status_code in [401, 403], f"Expected 401/403 without auth, got {response.status_code}"
        
        print("Correctly requires authentication for transfer")

    def test_transfer_nonexistent_table(self):
        """POST /api/tables/{table_id}/transfer - should return 404 for non-existent table"""
        response = requests.post(
            f"{BASE_URL}/api/tables/non-existent-table-id/transfer",
            json={"new_waiter_id": self.cashier_user['id']},
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        
        assert response.status_code == 404, f"Expected 404 for non-existent table, got {response.status_code}"
        
        print("Correctly returns 404 for non-existent table")


class TestTableClaimAndRelease:
    """Additional tests for table claim and release to support transfer testing"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        # Seed database
        requests.post(f"{BASE_URL}/api/seed")
        
        # Login as waiter
        waiter_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "2222"})
        assert waiter_response.status_code == 200
        waiter_data = waiter_response.json()
        self.waiter_token = waiter_data['token']
        self.waiter_user = waiter_data['user']
        
        # Login as admin
        admin_response = requests.post(f"{BASE_URL}/api/auth/login", json={"pincode": "123456"})
        assert admin_response.status_code == 200
        admin_data = admin_response.json()
        self.admin_token = admin_data['token']
        
        # Get tables
        tables_response = requests.get(
            f"{BASE_URL}/api/tables",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        self.tables = tables_response.json()
        
        yield
        
        # Cleanup
        for table in self.tables:
            try:
                requests.post(
                    f"{BASE_URL}/api/tables/{table['id']}/release",
                    headers={"Authorization": f"Bearer {self.admin_token}"}
                )
            except:
                pass

    def test_waiter_can_claim_available_table(self):
        """Waiter can claim an available table"""
        # Find available table
        available_table = next((t for t in self.tables if t['status'] == 'available'), None)
        assert available_table is not None, "No available table found"
        
        response = requests.post(
            f"{BASE_URL}/api/tables/{available_table['id']}/claim",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert response.status_code == 200, f"Failed to claim table: {response.text}"
        
        claimed_table = response.json()
        assert claimed_table['status'] == 'occupied'
        assert claimed_table['waiter_id'] == self.waiter_user['id']
        assert claimed_table['waiter_name'] == self.waiter_user['name']
        
        print(f"Successfully claimed table {available_table['number']}")

    def test_waiter_can_release_own_table(self):
        """Waiter can release their own table"""
        # Claim a table first
        table = self.tables[0]
        requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/claim",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        # Release the table
        response = requests.post(
            f"{BASE_URL}/api/tables/{table['id']}/release",
            headers={"Authorization": f"Bearer {self.waiter_token}"}
        )
        
        assert response.status_code == 200, f"Failed to release table: {response.text}"
        
        released_table = response.json()
        assert released_table['status'] == 'available'
        assert released_table['waiter_id'] is None
        
        print(f"Successfully released table {table['number']}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
