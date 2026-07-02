import type { CSSProperties } from 'react';

export const iconMap: Record<string, string> = {
  總覽: '總覽.png',
  居留案件登記: '居留案件登記.png',
  居留證繳費: '居留證繳費.png',
  財務對帳確認: '財務對帳確認.png',
  財務查詢: '財務查詢.png',
  '傳真/領件': '傳真領件.png',
  傳真領件: '傳真領件.png',
  案件查詢: '案件查詢.png',
  統計資料: '統計資料.png',
  統計數據: '統計數據.png',
  匯出資料: '匯出資料.png',
  仲介與扣款帳號: '仲介與扣款帳號.png',
  移民署服務站: '移民署服務站.png',
  專勤隊聯絡資訊: '專勤隊聯絡資訊.png',
  操作紀錄: '操作紀錄.png',
  系統設定: '系統設定.png',
  公告事項: '公告事項.png',
  公告: '公告事項.png',
  提醒事項: '提醒事項.png'
};

export function getIconPath(name?: string | null) {
  if (!name) return '';
  const file = iconMap[name] ?? iconMap[name.replace('/', '')] ?? `${name}.png`;
  return `/icons/${file}`;
}

export function IconImage({
  name,
  size = 22,
  className = '',
  alt,
  style
}: {
  name?: string | null;
  size?: number;
  className?: string;
  alt?: string;
  style?: CSSProperties;
}) {
  const src = getIconPath(name);
  if (!src) return null;
  return (
    <img
      className={`app-icon ${className}`.trim()}
      src={src}
      width={size}
      height={size}
      alt={alt ?? name ?? ''}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
      }}
      style={{ width: size, height: size, ...style }}
    />
  );
}
