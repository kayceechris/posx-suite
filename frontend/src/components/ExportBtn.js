import { useEffect, useRef, useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";

export default function ExportBtn({ onCSV, onPrint, label = "Export" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition-colors"
      >
        <Download size={16} />
        {label}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-48 bg-white rounded-xl shadow-lg border border-gray-200 z-50 overflow-hidden">
          {onCSV && (
            <button
              onClick={() => { setOpen(false); onCSV(); }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <FileSpreadsheet size={15} className="text-green-600" />
              Export CSV
            </button>
          )}
          {onPrint && (
            <button
              onClick={() => { setOpen(false); onPrint(); }}
              className="flex items-center gap-2 w-full px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <Printer size={15} className="text-blue-600" />
              Print / PDF
            </button>
          )}
        </div>
      )}
    </div>
  );
}
