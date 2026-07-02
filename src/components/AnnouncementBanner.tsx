import type { AnnouncementItem, AnnouncementPageName } from '../types';
import { todayTaipei } from '../utils/date';
import { IconImage } from '../utils/icons';

export function getVisibleAnnouncements(items: AnnouncementItem[], page: AnnouncementPageName) {
  const today = todayTaipei();
  return items
    .filter((item) => {
      if (!item.is_enabled || item.deleted_at) return false;
      const pages = item.display_pages ?? [];
      if (!pages.includes(page)) return false;
      if (item.start_date && item.start_date > today) return false;
      if (item.end_date && item.end_date < today) return false;
      return true;
    })
    .sort((a, b) => Number(b.is_pinned) - Number(a.is_pinned) || String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')));
}

export function AnnouncementBanner({ items, page }: { items: AnnouncementItem[]; page: AnnouncementPageName }) {
  const visible = getVisibleAnnouncements(items, page);
  if (!visible.length) return null;
  return (
    <section className="announcement-banner" aria-label="公告事項">
      {visible.map((item) => (
        <article className="announcement-item" key={item.id}>
          <IconImage name={item.icon || '公告事項'} size={22} className="announcement-icon" />
          <div className="announcement-body">
            <div className="announcement-title-row">
              {item.is_pinned ? <span className="pinned-tag">置頂</span> : null}
              <strong>{item.title}</strong>
            </div>
            <p>{item.content}</p>
          </div>
        </article>
      ))}
    </section>
  );
}
