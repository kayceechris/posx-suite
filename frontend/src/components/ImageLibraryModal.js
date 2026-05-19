import React, { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Images, Search, Trash2, X } from "lucide-react";
import { api } from "../lib/api";

const BASE_URL = process.env.REACT_APP_BACKEND_URL || "https://posx-suite.vercel.app";

function imgUrl(id) {
  return `${BASE_URL}/api/images/${id}`;
}

function formatSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ImageLibraryModal({ onSelect, onClose }) {
  const [items, setItems]       = useState([]);
  const [page, setPage]         = useState(1);
  const [pages, setPages]       = useState(1);
  const [total, setTotal]       = useState(0);
  const [search, setSearch]     = useState("");
  const [loading, setLoading]   = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [selected, setSelected] = useState(null);
  const searchTimeout           = useRef(null);

  const load = useCallback(async (p, q) => {
    setLoading(true);
    try {
      const res = await api.getImages(p, q);
      setItems(res.items);
      setPages(res.pages);
      setTotal(res.total);
    } catch {
      // silently ignore — network error shows empty grid
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(1, ""); }, [load]);

  const handleSearch = (val) => {
    setSearch(val);
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => {
      setPage(1);
      load(1, val);
    }, 350);
  };

  const handlePageChange = (p) => {
    setPage(p);
    load(p, search);
  };

  const handleDelete = async (e, item) => {
    e.stopPropagation();
    if (!window.confirm(`Delete "${item.name}"? Products using this image will lose it.`)) return;
    setDeleting(item.id);
    try {
      await api.deleteImage(item.id);
      if (selected?.id === item.id) setSelected(null);
      load(page, search);
    } catch {
      alert("Failed to delete image.");
    } finally {
      setDeleting(null);
    }
  };

  const handleConfirm = () => {
    if (!selected) return;
    onSelect({ url: `/api/images/${selected.id}`, fullUrl: imgUrl(selected.id) });
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
              <Images size={18} className="text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 dark:text-white">Image Library</h3>
              <p className="text-xs text-gray-400">{total} image{total !== 1 ? "s" : ""}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
            <X size={20} />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-gray-100 dark:border-gray-700 flex-shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by filename…"
              className="w-full pl-8 pr-3 py-2 border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-700 dark:text-white rounded-xl text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <Images size={40} className="mb-3 opacity-30" />
              <p className="text-sm">{search ? "No images match your search" : "No images uploaded yet"}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
              {items.map((item) => {
                const isSelected = selected?.id === item.id;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelected(isSelected ? null : item)}
                    className={[
                      "relative group cursor-pointer rounded-xl overflow-hidden border-2 transition-all",
                      isSelected
                        ? "border-indigo-500 ring-2 ring-indigo-400/40"
                        : "border-gray-200 dark:border-gray-700 hover:border-indigo-300",
                    ].join(" ")}
                  >
                    <div className="aspect-square bg-gray-100 dark:bg-gray-700">
                      <img
                        src={imgUrl(item.id)}
                        alt={item.name}
                        loading="lazy"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    {/* Overlay on hover */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                    {/* Selected checkmark */}
                    {isSelected && (
                      <div className="absolute top-1.5 left-1.5 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center">
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l2.5 2.5L9 1" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </div>
                    )}
                    {/* Delete button */}
                    <button
                      onClick={(e) => handleDelete(e, item)}
                      disabled={deleting === item.id}
                      className="absolute top-1.5 right-1.5 w-6 h-6 bg-black/60 hover:bg-red-600 rounded-full items-center justify-center hidden group-hover:flex transition-colors"
                    >
                      {deleting === item.id
                        ? <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        : <Trash2 size={11} className="text-white" />}
                    </button>
                    {/* Name tooltip */}
                    <div className="absolute bottom-0 inset-x-0 bg-black/60 text-white text-[9px] px-1 py-0.5 truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {item.name} {item.size ? `· ${formatSize(item.size)}` : ""}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Pagination + footer */}
        <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-700 flex-shrink-0 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1 || loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <ChevronLeft size={15} />
            </button>
            <span className="text-xs text-gray-500 dark:text-gray-400 px-2">
              {page} / {pages}
            </span>
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= pages || loading}
              className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-40 transition-colors"
            >
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border-2 border-gray-200 dark:border-gray-700 text-sm font-semibold text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selected}
              className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Use This Image
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
