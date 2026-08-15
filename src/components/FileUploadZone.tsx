'use client';

import React, { useRef, useState } from 'react';
import styles from './FileUploadZone.module.css';
import { UploadCloudIcon, CheckIcon, AlertTriangleIcon } from '@/components/icons';

interface FileUploadZoneProps {
  accept?: string;
  onFileSelected?: (file: File) => void;
  onUploadSuccess?: () => void;
  maxSizeMB?: number;
}

export default function FileUploadZone({
  accept = '.xlsx, .xls',
  onFileSelected,
  onUploadSuccess,
  maxSizeMB = 5,
}: FileUploadZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    setError(null);
    setSuccessMsg(null);

    // Check size
    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    if (file.size > maxSizeBytes) {
      setError(`Kích thước file không được vượt quá ${maxSizeMB}MB`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);

    if (onFileSelected) {
      onFileSelected(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setError(null);
    setSuccessMsg(null);
    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const res = await fetch('/api/admin/upload-users', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Tải file thất bại');
      }

      setSuccessMsg(data.message || `Đã nạp thành công ${data.data?.inserted || ''} sinh viên!`);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';

      if (onUploadSuccess) {
        onUploadSuccess();
      }
    } catch (err: any) {
      setError(err.message || 'Lỗi khi tải file lên');
    } finally {
      setUploading(false);
    }
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const onDragLeave = () => {
    setIsDragOver(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFileSelect(e.target.files[0]);
    }
  };

  const resetSelection = () => {
    setSelectedFile(null);
    setError(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className={styles.container}>
      <div
        className={`${styles.dropZone} ${isDragOver ? styles.dragOver : ''} ${uploading ? styles.disabled : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          className={styles.hiddenInput}
          accept={accept}
          onChange={onFileChange}
        />

        <UploadCloudIcon className={styles.icon} size={36} />

        <p className={styles.text}>
          {uploading ? 'Đang xử lý nạp dữ liệu...' : 'Kéo thả file vào đây hoặc '}
          {!uploading && <span className={styles.browse}>duyệt file</span>}
        </p>
        <p className={styles.hint}>
          Hỗ trợ: {accept} (Tối đa {maxSizeMB}MB)
        </p>
      </div>

      {/* Selected File Card with explicit Action Button */}
      {selectedFile && !uploading && (
        <div className={styles.selectedCard}>
          <div className={styles.selectedInfo}>
            <CheckIcon size={20} />
            <div>
              <strong>{selectedFile.name}</strong>
              <div style={{ fontSize: '0.775rem', color: '#15803d' }}>
                {(selectedFile.size / 1024).toFixed(1)} KB • Sẵn sàng nạp vào cơ sở dữ liệu
              </div>
            </div>
          </div>

          <div className={styles.selectedActions}>
            <button
              type="button"
              onClick={handleUpload}
              disabled={uploading}
              className={styles.uploadBtn}
            >
              <UploadCloudIcon size={16} />
              <span>Nạp Dữ Liệu Ngay</span>
            </button>
            <button
              type="button"
              onClick={resetSelection}
              disabled={uploading}
              className={styles.cancelBtn}
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      {uploading && (
        <div className={styles.selectedCard} style={{ background: '#eff6ff', borderColor: '#bfdbfe' }}>
          <div className={styles.selectedInfo} style={{ color: '#1e40af' }}>
            <div style={{ width: '18px', height: '18px', border: '2px solid #2563eb', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }}></div>
            <div>
              <strong>Đang nạp dữ liệu danh sách sinh viên...</strong>
              <div style={{ fontSize: '0.775rem', color: '#3b82f6' }}>Vui lòng chờ trong giây lát</div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className={styles.error}>
          <AlertTriangleIcon size={16} color="#dc2626" />
          <span>{error}</span>
        </div>
      )}

      {successMsg && (
        <div className={styles.success}>
          <CheckIcon size={20} />
          <span>{successMsg}</span>
        </div>
      )}
    </div>
  );
}
