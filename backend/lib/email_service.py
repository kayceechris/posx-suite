import asyncio
import logging
import os

logger = logging.getLogger(__name__)

RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL = os.environ.get("NOTIFICATION_FROM_EMAIL", "POSx Suite <onboarding@resend.dev>")
ADMIN_EMAIL = os.environ.get("ADMIN_ALERT_EMAIL", "")


def _enabled() -> bool:
    return bool(RESEND_API_KEY and ADMIN_EMAIL)


def _recipients() -> list[str]:
    return [e.strip() for e in ADMIN_EMAIL.split(",") if e.strip()]


def _base_html(title: str, body_html: str) -> str:
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Segoe UI',Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr><td style="background:#1d4ed8;padding:20px 28px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:-0.3px;">POSx Suite</span>
          <span style="color:#93c5fd;font-size:13px;font-weight:400;margin-left:12px;">{title}</span>
        </td></tr>
        <tr><td style="padding:28px;">
          {body_html}
        </td></tr>
        <tr><td style="background:#f8fafc;padding:16px 28px;border-top:1px solid #e2e8f0;">
          <p style="margin:0;font-size:12px;color:#94a3b8;">Automated notification from POSx Suite. Do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>"""


def _send_sync(payload: dict):
    """Run in thread pool — Resend SDK is synchronous."""
    try:
        import resend  # type: ignore
        resend.api_key = RESEND_API_KEY
        resend.Emails.send(payload)
    except Exception as e:
        logger.error("Resend email failed: %s", e)


async def _send(payload: dict):
    await asyncio.to_thread(_send_sync, payload)


# ── Public senders ─────────────────────────────────────────────────────────────

async def send_new_requisition_email(requisition: dict):
    if not _enabled():
        return
    items_html = "".join(
        f"<tr style='border-bottom:1px solid #f1f5f9;'>"
        f"<td style='padding:8px 12px;font-size:14px;color:#374151;'>{i.get('product_name', '—')}</td>"
        f"<td style='padding:8px 12px;font-size:14px;color:#374151;text-align:center;'>{i.get('quantity_requested', 0)}</td>"
        f"</tr>"
        for i in requisition.get("items", [])
    )
    body = f"""
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">New Requisition Request</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">A stock requisition is awaiting your review.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;">
        <tr>
          <td style="padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Requested By</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">{requisition.get('created_by_name', '—')}</p>
          </td>
          <td style="padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Store</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">{requisition.get('from_store', '—').title()} Store</p>
          </td>
          <td style="padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Status</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#d97706;">Pending</p>
          </td>
        </tr>
      </table>
      <h3 style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;">Items Requested</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:16px;">
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Product</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Qty</th>
        </tr>
        {items_html}
      </table>
      <p style="margin:0;font-size:13px;color:#6b7280;">Log in to POSx Suite to approve or reject this requisition.</p>
    """
    await _send({
        "from": FROM_EMAIL,
        "to": _recipients(),
        "subject": f"New Requisition — {requisition.get('from_store', '').title()} Store | POSx Suite",
        "html": _base_html("New Requisition", body),
    })


async def send_new_order_email(order: dict):
    if not _enabled():
        return
    items_html = "".join(
        f"<tr style='border-bottom:1px solid #f1f5f9;'>"
        f"<td style='padding:8px 12px;font-size:14px;color:#374151;'>{i.get('product_name', '—')}</td>"
        f"<td style='padding:8px 12px;font-size:14px;color:#374151;text-align:center;'>{i.get('quantity', 0)}</td>"
        f"<td style='padding:8px 12px;font-size:14px;color:#374151;text-align:right;'>&#8358;{i.get('total', 0):,.0f}</td>"
        f"</tr>"
        for i in order.get("items", [])
    )
    total = order.get("total", 0)
    body = f"""
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">New Order Completed</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">Order {order.get('order_number', '—')} has been placed.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;border:1px solid #e2e8f0;margin-bottom:20px;">
        <tr>
          <td style="padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Order #</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">{order.get('order_number', '—')}</p>
          </td>
          <td style="padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Staff</p>
            <p style="margin:0;font-size:14px;font-weight:600;color:#111827;">{order.get('created_by_name', '—')}</p>
          </td>
          <td style="padding:12px 16px;">
            <p style="margin:0 0 4px;font-size:12px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;">Total</p>
            <p style="margin:0;font-size:16px;font-weight:700;color:#059669;">&#8358;{total:,.0f}</p>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Item</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Qty</th>
          <th style="padding:8px 12px;text-align:right;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Amount</th>
        </tr>
        {items_html}
        <tr style="background:#f0fdf4;">
          <td colspan="2" style="padding:10px 12px;font-size:14px;font-weight:600;color:#374151;">Total</td>
          <td style="padding:10px 12px;font-size:15px;font-weight:700;color:#059669;text-align:right;">&#8358;{total:,.0f}</td>
        </tr>
      </table>
    """
    await _send({
        "from": FROM_EMAIL,
        "to": _recipients(),
        "subject": f"Order {order.get('order_number', '—')} — ₦{total:,.0f} | POSx Suite",
        "html": _base_html("New Order", body),
    })


async def send_low_stock_email(low_items: list):
    if not _enabled() or not low_items:
        return
    rows_html = "".join(
        f"<tr style='border-bottom:1px solid #f1f5f9;'>"
        f"<td style='padding:8px 12px;font-size:14px;color:#374151;'>{i.get('product_name', '—')}</td>"
        f"<td style='padding:8px 12px;font-size:14px;text-align:center;color:#dc2626;font-weight:600;'>{i.get('quantity', 0)}</td>"
        f"<td style='padding:8px 12px;font-size:14px;text-align:center;color:#6b7280;'>{i.get('min_quantity', 0)}</td>"
        f"<td style='padding:8px 12px;font-size:14px;text-align:center;color:#6b7280;'>{i.get('store', 'main').title()}</td>"
        f"</tr>"
        for i in low_items
    )
    n = len(low_items)
    body = f"""
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Low Stock Alert</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">{n} product{'s' if n != 1 else ''} {'are' if n != 1 else 'is'} below minimum stock levels.</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#fef2f2;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Product</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Current</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Min</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Store</th>
        </tr>
        {rows_html}
      </table>
      <p style="margin:20px 0 0;font-size:13px;color:#6b7280;">Log in to POSx Suite to create a purchase order or transfer stock via requisitions.</p>
    """
    await _send({
        "from": FROM_EMAIL,
        "to": _recipients(),
        "subject": f"Low Stock Alert — {n} item{'s' if n != 1 else ''} need restocking | POSx Suite",
        "html": _base_html("Low Stock Alert", body),
    })


async def send_daily_digest_email(db):
    if not _enabled():
        return
    from datetime import datetime, timezone, timedelta
    today = datetime.now(timezone.utc).date()
    start = datetime.combine(today, datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()
    end = datetime.combine(today + timedelta(days=1), datetime.min.time()).replace(tzinfo=timezone.utc).isoformat()

    # Today's revenue
    totals = {"count": 0, "revenue": 0.0}
    async for row in db.orders.aggregate([
        {"$match": {"status": "completed", "created_at": {"$gte": start, "$lt": end}}},
        {"$group": {"_id": None, "count": {"$sum": 1}, "revenue": {"$sum": "$total"}}},
    ]):
        totals = {"count": row["count"], "revenue": row["revenue"]}

    pending_reqs = await db.requisitions.count_documents({"status": "pending"})

    # Low stock
    low_rows = []
    async for s in db.stock.find(
        {"$expr": {"$and": [{"$gt": ["$min_quantity", 0]}, {"$lte": ["$quantity", "$min_quantity"]}]}},
        {"_id": 0, "product_id": 1, "quantity": 1, "min_quantity": 1, "store": 1},
    ):
        prod = await db.products.find_one({"id": s["product_id"]}, {"_id": 0, "name": 1})
        if prod:
            low_rows.append({**s, "product_name": prod["name"]})

    stock_rows_html = "".join(
        f"<tr><td style='padding:6px 12px;font-size:13px;color:#374151;'>{i.get('product_name','—')}</td>"
        f"<td style='padding:6px 12px;font-size:13px;text-align:center;color:#dc2626;font-weight:600;'>{i.get('quantity',0)}</td></tr>"
        for i in low_rows[:10]
    ) or "<tr><td colspan='2' style='padding:12px;text-align:center;color:#6b7280;font-size:13px;'>All items adequately stocked ✓</td></tr>"

    pending_color = "#d97706" if pending_reqs > 0 else "#94a3b8"
    pending_bg = "#fffbeb" if pending_reqs > 0 else "#f8fafc"
    pending_border = "#fde68a" if pending_reqs > 0 else "#e2e8f0"

    body = f"""
      <h2 style="margin:0 0 4px;font-size:20px;font-weight:700;color:#111827;">Daily Digest</h2>
      <p style="margin:0 0 20px;font-size:14px;color:#6b7280;">{today.strftime("%A, %B %d, %Y")}</p>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
        <tr>
          <td style="width:50%;padding-right:8px;">
            <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:12px;color:#16a34a;text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Today's Revenue</p>
              <p style="margin:0;font-size:22px;font-weight:700;color:#111827;">&#8358;{totals['revenue']:,.0f}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">{totals['count']} completed orders</p>
            </div>
          </td>
          <td style="width:50%;padding-left:8px;">
            <div style="background:{pending_bg};border:1px solid {pending_border};border-radius:8px;padding:16px 20px;">
              <p style="margin:0 0 4px;font-size:12px;color:{pending_color};text-transform:uppercase;letter-spacing:.5px;font-weight:600;">Pending Requisitions</p>
              <p style="margin:0;font-size:22px;font-weight:700;color:#111827;">{pending_reqs}</p>
              <p style="margin:4px 0 0;font-size:12px;color:#6b7280;">awaiting approval</p>
            </div>
          </td>
        </tr>
      </table>
      <h3 style="margin:0 0 8px;font-size:14px;font-weight:600;color:#374151;">Low Stock Items</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr style="background:#fef2f2;">
          <th style="padding:8px 12px;text-align:left;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Product</th>
          <th style="padding:8px 12px;text-align:center;font-size:12px;color:#6b7280;font-weight:600;text-transform:uppercase;">Stock</th>
        </tr>
        {stock_rows_html}
      </table>
    """
    await _send({
        "from": FROM_EMAIL,
        "to": _recipients(),
        "subject": f"Daily Digest — ₦{totals['revenue']:,.0f} revenue · {pending_reqs} pending reqs | POSx Suite",
        "html": _base_html("Daily Digest", body),
    })
