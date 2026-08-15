'use client';

import React, { useEffect, useState } from 'react';
import styles from './MaintenanceToggle.module.css';

interface MaintenanceToggleProps {
  isEnabled?: boolean;
  message?: string;
  onToggle?: (enabled: boolean, message: string) => Promise<void>;
}

export default function MaintenanceToggle({
  isEnabled: propIsEnabled,
  message: propMessage,
  onToggle
}: MaintenanceToggleProps = {}) {
  const [isEnabled, setIsEnabled] = useState(propIsEnabled ?? false);
  const [currentMessage, setCurrentMessage] = useState(propMessage ?? '');
  const [savedMessage, setSavedMessage] = useState(propMessage ?? '');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (propIsEnabled !== undefined) {
      setIsEnabled(propIsEnabled);
    }
    if (propMessage !== undefined) {
      setCurrentMessage(propMessage);
      setSavedMessage(propMessage);
    }
  }, [propIsEnabled, propMessage]);

  useEffect(() => {
    // If props are not provided, fetch from API
    if (propIsEnabled === undefined) {
      fetch('/api/admin/maintenance')
        .then(res => res.json())
        .then(data => {
          if (data.success && data.data) {
            setIsEnabled(!!data.data.maintenance_mode);
            const msg = data.data.maintenance_message || '';
            setCurrentMessage(msg);
            setSavedMessage(msg);
          }
        })
        .catch(console.error);
    }
  }, [propIsEnabled]);

  const updateMaintenance = async (newStatus: boolean, msg: string) => {
    if (onToggle) {
      await onToggle(newStatus, msg);
      return;
    }
    const res = await fetch('/api/admin/maintenance', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: newStatus, message: msg }),
    });
    if (!res.ok) {
      throw new Error('Lỗi khi cập nhật');
    }
  };

  const handleToggle = async () => {
    const newStatus = !isEnabled;
    
    if (newStatus) {
      if (!window.confirm('Cảnh báo: Bật chế độ bảo trì sẽ chặn tất cả người dùng truy cập ứng dụng. Bạn có chắc chắn?')) {
        return;
      }
    }

    try {
      setIsLoading(true);
      await updateMaintenance(newStatus, currentMessage);
      setIsEnabled(newStatus);
    } catch (error) {
      console.error('Failed to toggle maintenance mode', error);
      alert('Đã xảy ra lỗi khi cập nhật chế độ bảo trì');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveMessage = async () => {
    try {
      setIsLoading(true);
      await updateMaintenance(isEnabled, currentMessage);
      setSavedMessage(currentMessage);
      alert('Đã lưu lời nhắn bảo trì');
    } catch (error) {
      console.error('Failed to save maintenance message', error);
      alert('Đã xảy ra lỗi khi lưu lời nhắn');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`${styles.container} ${isEnabled ? styles.active : ''}`}>
      <div className={styles.header}>
        <div>
          <h3 className={styles.title}>Chế độ bảo trì</h3>
          <p className={styles.subtitle}>
            {isEnabled 
              ? 'Hệ thống đang tạm khóa. Người dùng sẽ không thể điểm danh.' 
              : 'Bật chế độ này khi cần bảo trì hệ thống hoặc ngừng nhận điểm danh khẩn cấp.'}
          </p>
        </div>
        
        <button 
          className={`${styles.toggle} ${isEnabled ? styles.toggleOn : styles.toggleOff}`}
          onClick={handleToggle}
          disabled={isLoading}
          type="button"
          role="switch"
          aria-checked={isEnabled}
        >
          <span className={`${styles.toggleKnob} ${isEnabled ? styles.knobOn : styles.knobOff}`} />
        </button>
      </div>

      {isEnabled && (
        <div className={styles.messageSection}>
          <label className={styles.label} htmlFor="maintenance-message">
            Lời nhắn hiển thị cho người dùng:
          </label>
          <textarea
            id="maintenance-message"
            className={styles.textarea}
            value={currentMessage}
            onChange={(e) => setCurrentMessage(e.target.value)}
            rows={3}
            placeholder="Nhập lời nhắn..."
          />
          <button 
            className={styles.saveBtn} 
            onClick={handleSaveMessage}
            disabled={isLoading || currentMessage === savedMessage}
          >
            Lưu lời nhắn
          </button>
        </div>
      )}
    </div>
  );
}
