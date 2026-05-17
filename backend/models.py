from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone
import uuid


# ==================== USER MODELS ====================

class User(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    pincode: str
    role: str
    role_id: Optional[str] = None
    outlet_id: Optional[str] = None
    permissions: Optional[List[str]] = None
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserCreate(BaseModel):
    name: str
    pincode: str
    role: str
    outlet_id: Optional[str] = None
    permissions: Optional[List[str]] = None


class UserLogin(BaseModel):
    pincode: str


# ==================== OUTLET MODELS ====================

class Outlet(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str
    address: str
    phone: Optional[str] = None
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OutletCreate(BaseModel):
    name: str
    type: str
    address: str
    phone: Optional[str] = None


# ==================== CATEGORY MODELS ====================

class Category(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    color: str = "#3B82F6"
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CategoryCreate(BaseModel):
    name: str
    color: Optional[str] = "#3B82F6"


# ==================== PRODUCT MODELS ====================

class TerminalPrice(BaseModel):
    outlet_id: Optional[str] = None
    terminal_id: Optional[str] = None
    price: float
    cost_price: float = 0.0


class Product(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    category_id: str
    brand_id: Optional[str] = None
    unit_id: Optional[str] = None
    outlet_id: Optional[str] = None
    terminal_id: Optional[str] = None
    cost_price: float = 0.0
    markup_percentage: float = 0.0
    price: float
    barcode: Optional[str] = None
    image: Optional[str] = None
    description: Optional[str] = None
    active: bool = True
    terminal_prices: List[TerminalPrice] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ProductCreate(BaseModel):
    name: str
    category_id: str
    brand_id: Optional[str] = None
    unit_id: Optional[str] = None
    outlet_id: Optional[str] = None
    terminal_id: Optional[str] = None
    cost_price: float = 0.0
    markup_percentage: float = 0.0
    price: float
    barcode: Optional[str] = None
    image: Optional[str] = None
    description: Optional[str] = None
    terminal_prices: List[TerminalPrice] = Field(default_factory=list)


# ==================== STOCK MODELS ====================

class Stock(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    outlet_id: str
    quantity: int
    min_quantity: int = 10
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StockUpdate(BaseModel):
    product_id: str
    outlet_id: str
    quantity: int
    min_quantity: Optional[int] = 10


class StockMovement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    product_id: str
    from_outlet_id: Optional[str] = None
    to_outlet_id: Optional[str] = None
    quantity: int
    type: str
    notes: Optional[str] = None
    created_by: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class StockMovementCreate(BaseModel):
    product_id: str
    from_outlet_id: Optional[str] = None
    to_outlet_id: Optional[str] = None
    quantity: int
    type: str
    notes: Optional[str] = None


# ==================== CUSTOMER MODELS ====================

class Customer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    total_orders: int = 0
    total_spent: float = 0.0
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CustomerCreate(BaseModel):
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None


# ==================== ORDER MODELS ====================

class OrderItem(BaseModel):
    product_id: str
    product_name: str
    quantity: int
    price: float
    total: float


class Order(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    order_number: str
    outlet_id: str
    terminal_id: Optional[str] = None
    table_id: Optional[str] = None
    table_number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: List[OrderItem]
    subtotal: float
    tax: float = 0.0
    discount: float = 0.0
    total: float
    payment_method: str
    status: str = "held"
    service_mode: str = "quick_service"
    created_by: str
    created_by_name: Optional[str] = None
    created_by_role: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class OrderCreate(BaseModel):
    outlet_id: str
    terminal_id: Optional[str] = None
    table_id: Optional[str] = None
    table_number: Optional[str] = None
    customer_id: Optional[str] = None
    customer_name: Optional[str] = None
    items: List[OrderItem]
    subtotal: float
    tax: float = 0.0
    discount: float = 0.0
    total: float
    payment_method: str
    status: str = "held"
    service_mode: str = "quick_service"


# ==================== TABLE MODELS ====================

class Table(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str
    outlet_id: str
    status: str = "available"
    waiter_id: Optional[str] = None
    waiter_name: Optional[str] = None
    current_order_id: Optional[str] = None
    seats: int = 4
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TableCreate(BaseModel):
    number: str
    outlet_id: str
    seats: int = 4


class TableTransferRequest(BaseModel):
    new_waiter_id: str


# ==================== BAR TAB MODELS ====================

class BarTab(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    number: str
    outlet_id: str
    tab_type: str = "regular"
    status: str = "available"
    current_order_id: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class BarTabCreate(BaseModel):
    number: str
    outlet_id: str
    tab_type: str = "regular"


# ==================== PAYMENT TYPE MODELS ====================

class PaymentType(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PaymentTypeCreate(BaseModel):
    name: str
    type: str


# ==================== CURRENCY MODELS ====================

class Currency(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    code: str
    symbol: str
    name: str
    exchange_rate: float = 1.0
    is_default: bool = False
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CurrencyCreate(BaseModel):
    code: str
    symbol: str
    name: str
    exchange_rate: float = 1.0
    is_default: bool = False


# ==================== PRINTER MODELS ====================

class Printer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    mode: str
    type: str
    ip_address: Optional[str] = None
    port: Optional[int] = None
    outlet_id: str
    terminal_id: Optional[str] = None
    windows_printer_name: Optional[str] = None
    printer_group_ids: List[str] = []
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PrinterCreate(BaseModel):
    name: str
    mode: str
    type: str
    ip_address: Optional[str] = None
    port: Optional[int] = None
    outlet_id: str
    terminal_id: Optional[str] = None
    windows_printer_name: Optional[str] = None
    printer_group_ids: List[str] = []


# ==================== SPLIT BILL MODELS ====================

class SplitBill(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    original_order_id: str
    split_number: int
    amount: float
    payment_method: str
    paid: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SplitBillCreate(BaseModel):
    original_order_id: str
    splits: List[Dict[str, float]]


# ==================== ROLE & PERMISSION MODELS ====================

class Permission(BaseModel):
    resource: str
    actions: List[str]


class Role(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    permissions: List[Permission]
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class RoleCreate(BaseModel):
    name: str
    permissions: List[Permission]


# ==================== BUSINESS SETTINGS MODELS ====================

class BusinessSettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = "business_settings"
    business_type: str
    business_name: str
    service_mode: str = "quick_service"
    default_currency: str = "USD"
    default_payment_type: str = "cash"
    company_logo: Optional[str] = None
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    tax_id: Optional[str] = None
    receipt_header: Optional[str] = None
    receipt_footer: Optional[str] = None
    setup_completed: bool = False
    tax_enabled: bool = False
    tax_mode: str = "exclusive"  # "inclusive" | "exclusive"


class BusinessSettingsCreate(BaseModel):
    business_type: str
    business_name: str
    service_mode: str = "both"
    company_logo: Optional[str] = None
    company_address: Optional[str] = None
    company_phone: Optional[str] = None
    company_email: Optional[str] = None
    tax_id: Optional[str] = None
    receipt_header: Optional[str] = None
    receipt_footer: Optional[str] = None


# ==================== SUPPLIER MODELS ====================

class Supplier(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SupplierCreate(BaseModel):
    name: str
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None


# ==================== EXPENSE MODELS ====================

class Expense(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    description: str
    amount: float
    date: str
    supplier_id: Optional[str] = None
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class ExpenseCreate(BaseModel):
    category: str
    description: str
    amount: float
    date: str
    supplier_id: Optional[str] = None


# ==================== PURCHASE ORDER MODELS ====================

class PurchaseOrderItem(BaseModel):
    product_id: Optional[str] = None
    description: str
    quantity: float
    unit: str = "pcs"
    unit_cost: float
    total: float = 0.0


class PurchaseOrder(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    po_number: str = ""
    supplier_id: str
    type: str = "external"
    items: List[PurchaseOrderItem] = []
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    status: str = "draft"
    notes: Optional[str] = None
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PurchaseOrderCreate(BaseModel):
    supplier_id: str
    type: str = "external"
    status: str = "pending"
    items: List[PurchaseOrderItem]
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    notes: Optional[str] = None


# ==================== PERIPHERAL MODELS ====================

class Peripheral(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str
    connection: str = "usb"
    ip_address: Optional[str] = None
    port: Optional[int] = None
    outlet_id: Optional[str] = None
    active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class PeripheralCreate(BaseModel):
    name: str
    type: str
    connection: str = "usb"
    ip_address: Optional[str] = None
    port: Optional[int] = None
    outlet_id: Optional[str] = None


# ==================== DISPLAY MODELS ====================

class DisplayUpdate(BaseModel):
    terminal_id: str = "default"
    business_name: Optional[str] = None
    company_logo: Optional[str] = None
    items: List[Dict[str, Any]] = []
    subtotal: float = 0.0
    tax: float = 0.0
    total: float = 0.0
    status: str = "idle"
    message: Optional[str] = None


# ==================== ACCOUNTING MODELS ====================

class Deposit(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str
    description: str
    amount: float
    date: str
    payment_method: str = "cash"
    reference: Optional[str] = None
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DepositCreate(BaseModel):
    category: str
    description: str
    amount: float
    date: str
    payment_method: str = "cash"
    reference: Optional[str] = None


class AccountCategory(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    type: str  # "expense" | "deposit"
    color: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AccountCategoryCreate(BaseModel):
    name: str
    type: str
    color: Optional[str] = None


class Transfer(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    from_account: str
    to_account: str
    amount: float
    description: Optional[str] = None
    date: str
    reference: Optional[str] = None
    created_by: str = ""
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class TransferCreate(BaseModel):
    from_account: str
    to_account: str
    amount: float
    description: Optional[str] = None
    date: str
    reference: Optional[str] = None


# ==================== REGISTRATION MODELS ====================

class RegisterAdmin(BaseModel):
    name: str
    pincode: str
    business_name: str
    business_type: str = "restaurant"
