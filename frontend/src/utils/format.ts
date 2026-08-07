import { state } from '../config/state';
import { i18n } from './i18n';

export function formatExactDate(isoDate: string, includeTime = true): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;

  const locale = (i18n.getLanguage() || 'pt_br').replace('_', '-');
  const options: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  };
  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }
  return new Intl.DateTimeFormat(locale, options).format(date);
}

export function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;

  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 10) {
    return i18n.t('time.justNow');
  }

  const locale = (i18n.getLanguage() || 'pt_br').replace('_', '-');
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });

  if (diffSec < 60) {
    return rtf.format(-Math.max(1, diffSec), 'second');
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return rtf.format(-diffMin, 'minute');
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return rtf.format(-diffHours, 'hour');
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return rtf.format(-diffDays, 'day');
  }
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 30) {
    return rtf.format(-diffWeeks, 'week');
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 365) {
    return rtf.format(-diffMonths, 'month');
  }
  const diffYears = Math.floor(diffDays / 365);
  return rtf.format(-diffYears, 'year');
}

export function formatPostDate(isoDate: string, overrideFormat?: 'relative' | 'exact', includeTime = true): string {
  if (!isoDate) return "";
  const mode = overrideFormat || state.dateFormat || (localStorage.getItem('dateFormat') as 'relative' | 'exact') || 'relative';
  if (mode === 'exact') {
    return formatExactDate(isoDate, includeTime);
  }
  return formatRelativeTime(isoDate);
}

