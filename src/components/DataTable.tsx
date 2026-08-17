'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { SearchIcon } from '@/components/icons';
import styles from './DataTable.module.css';

export interface Column {
  key: string;
  label: string;
  render?: (val: any, row: Record<string, any>) => React.ReactNode;
}

interface DataTableProps {
  columns?: Column[];
  data: Record<string, any>[];
  searchable?: boolean;
  searchPlaceholder?: string;
  emptyMessage?: string;
  pageSize?: number;
  loading?: boolean;
  onSearchChange?: (term: string) => void;
}

export default function DataTable({
  columns,
  data = [],
  searchable = false,
  searchPlaceholder = 'Tìm kiếm theo MSSV, họ tên, mã...',
  emptyMessage = 'Không có dữ liệu',
  pageSize = 50,
  loading = false,
  onSearchChange,
}: DataTableProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchTerm(val);
    setCurrentPage(1);

    if (onSearchChange) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        onSearchChange(val);
      }, 300);
    }
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const activeColumns = useMemo<Column[]>(() => {
    if (columns && columns.length > 0) return columns;
    if (data.length === 0) return [];
    return Object.keys(data[0]).map((key) => ({
      key,
      label: key.toUpperCase(),
    }));
  }, [columns, data]);

  const filteredData = useMemo(() => {
    if (onSearchChange) {
      return data;
    }
    if (!searchTerm.trim()) return data;
    const lower = searchTerm.toLowerCase();
    return data.filter((row) =>
      Object.values(row).some(
        (val) => val !== null && val !== undefined && String(val).toLowerCase().includes(lower)
      )
    );
  }, [data, searchTerm, onSearchChange]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / pageSize));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  return (
    <div className={styles.container}>
      {searchable && (
        <div className={styles.searchContainer}>
          <div className={styles.searchWrapper}>
            <SearchIcon className={styles.searchIcon} size={18} />
            <input
              type="text"
              className={styles.searchInput}
              placeholder={searchPlaceholder}
              value={searchTerm}
              onChange={handleInputChange}
            />
          </div>
        </div>
      )}

      <div className={styles.tableWrapper}>
        <table className={styles.table}>
          <thead>
            <tr>
              {activeColumns.map((col) => (
                <th key={col.key}>{col.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={activeColumns.length || 1} className={styles.emptyState}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '2rem 0', color: '#64748b' }}>
                    <div className={styles.spinner}></div>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Đang tải dữ liệu danh sách...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length > 0 ? (
              paginatedData.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {activeColumns.map((col) => (
                    <td key={col.key} data-label={col.label}>
                      {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '-')}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={activeColumns.length || 1} className={styles.emptyState}>
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className={styles.footer}>
        <div>
          Hiển thị {filteredData.length > 0 ? `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredData.length)}` : '0'} / Tổng {filteredData.length} kết quả
        </div>

        {totalPages > 1 && (
          <div className={styles.pagination}>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
            >
              ← Trước
            </button>
            <span className={styles.pageInfo}>
              Trang {currentPage} / {totalPages}
            </span>
            <button
              type="button"
              className={styles.pageBtn}
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
            >
              Tiếp →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
