import React from 'react';
import styles from './StatCard.module.css';

interface StatCardProps {
  title: string;
  value: number | string;
  color?: 'primary' | 'success' | 'warning' | 'error';
  type?: 'primary' | 'success' | 'warning' | 'error';
  icon?: React.ReactNode;
  subtitle?: string;
  onClick?: () => void;
  isActive?: boolean;
  loading?: boolean;
}

export default function StatCard({
  title,
  value,
  color = 'primary',
  type,
  icon,
  subtitle,
  onClick,
  isActive = false,
  loading = false,
}: StatCardProps) {
  const cardColor = type || color;

  return (
    <div
      onClick={!loading ? onClick : undefined}
      role={onClick && !loading ? 'button' : undefined}
      tabIndex={onClick && !loading ? 0 : undefined}
      onKeyDown={
        onClick && !loading
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`${styles.card} ${styles[cardColor]} ${onClick && !loading ? styles.clickable : ''} ${isActive ? styles.active : ''}`}
    >
      <div className={styles.topRow}>
        <span className={styles.title}>{title}</span>
        {icon && <div className={styles.iconCircle}>{icon}</div>}
      </div>
      {loading ? (
        <div className={styles.skeletonContainer}>
          <div className={styles.skeletonValue} />
          {subtitle && <div className={styles.skeletonSubtitle} />}
        </div>
      ) : (
        <>
          <div className={styles.value}>{value}</div>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </>
      )}
    </div>
  );
}
