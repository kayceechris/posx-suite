export function downloadCSV(filename, headers, rows) {
  const escape = (v) => {
    if (v === null || v === undefined) return "";
    const s = String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(escape).join(","), ...rows.map((r) => r.map(escape).join(","))];
  const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function printReport({ title, subtitle, summaryRows = [], headers, rows, landscape = false }) {
  const escape = (v) => String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const w = window.open("", "_blank");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8">
<title>${escape(title)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  @page{size:${landscape ? "landscape" : "portrait"};margin:18mm}
  body{font-family:Arial,sans-serif;font-size:11px;color:#111}
  h1{font-size:18px;margin-bottom:4px}
  .sub{font-size:12px;color:#555;margin-bottom:12px}
  .summary{display:flex;flex-wrap:wrap;gap:12px;margin-bottom:16px}
  .summary .item{background:#f4f4f4;border-radius:6px;padding:8px 14px;min-width:140px}
  .summary .item .lbl{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:.5px}
  .summary .item .val{font-size:15px;font-weight:700;margin-top:2px}
  table{width:100%;border-collapse:collapse;margin-top:8px}
  th{background:#1f2937;color:#fff;padding:6px 8px;text-align:left;font-size:11px}
  td{padding:5px 8px;border-bottom:1px solid #e5e7eb;font-size:11px}
  tr:nth-child(even) td{background:#f9fafb}
  .footer{margin-top:20px;font-size:10px;color:#888;text-align:right}
  @media print{button{display:none}}
</style>
</head><body>
<h1>${escape(title)}</h1>
${subtitle ? `<div class="sub">${escape(subtitle)}</div>` : ""}
${summaryRows.length ? `<div class="summary">${summaryRows.map(([lbl, val]) =>
  `<div class="item"><div class="lbl">${escape(lbl)}</div><div class="val">${escape(val)}</div></div>`
).join("")}</div>` : ""}
<table>
  <thead><tr>${headers.map((h) => `<th>${escape(h)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${escape(c)}</td>`).join("")}</tr>`).join("")}</tbody>
</table>
<div class="footer">Generated ${new Date().toLocaleString()}</div>
</body></html>`);
  w.document.close();
  w.onload = () => { w.focus(); w.print(); };
}
