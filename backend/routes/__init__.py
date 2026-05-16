from fastapi import APIRouter

from routes.auth import router as auth_router
from routes.users import router as users_router
from routes.outlets import router as outlets_router
from routes.products import router as products_router
from routes.inventory import router as inventory_router
from routes.orders import router as orders_router
from routes.tables import router as tables_router
from routes.settings import router as settings_router
from routes.payments import router as payments_router
from routes.printers import router as printers_router
from routes.customers import router as customers_router
from routes.suppliers import router as suppliers_router
from routes.accounts import router as accounts_router
from routes.reports import router as reports_router
from routes.analytics import router as analytics_router
from routes.roles import router as roles_router
from routes.display import router as display_router
from routes.peripherals import router as peripherals_router
from routes.upload import router as upload_router
from routes.seed import router as seed_router
from routes.user_types import router as user_types_router
from routes.brands_units import router as brands_units_router
from routes.import_export import router as import_export_router
from routes.terminals import router as terminals_router
from routes.taxes import router as taxes_router
from routes.bar_tabs import router as bar_tabs_router

all_routers = [
    auth_router,
    users_router,
    outlets_router,
    products_router,
    inventory_router,
    orders_router,
    tables_router,
    settings_router,
    payments_router,
    printers_router,
    customers_router,
    suppliers_router,
    accounts_router,
    reports_router,
    analytics_router,
    roles_router,
    display_router,
    peripherals_router,
    upload_router,
    seed_router,
    user_types_router,
    brands_units_router,
    import_export_router,
    terminals_router,
    taxes_router,
    bar_tabs_router,
]
