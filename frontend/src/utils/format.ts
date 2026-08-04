import { state } from '../config/state';

export function formatExactDate(isoDate: string, includeTime = true): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;

  const months = [
    "janeiro", "fevereiro", "março", "abril", "maio", "junho",
    "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"
  ];

  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  if (!includeTime) {
    return `${day} de ${month} de ${year}`;
  }

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day} de ${month} de ${year} às ${hours}:${minutes}`;
}

export function formatRelativeTime(isoDate: string): string {
  if (!isoDate) return "";
  const date = new Date(isoDate);
  if (isNaN(date.getTime())) return isoDate;

  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 10) {
    return "agora mesmo";
  }
  if (diffSec < 60) {
    return `há ${Math.max(1, diffSec)} segundos`;
  }
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return diffMin === 1 ? "há 1 minuto" : `há ${diffMin} minutos`;
  }
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) {
    return diffHours === 1 ? "há 1 hora" : `há ${diffHours} horas`;
  }
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) {
    return diffDays === 1 ? "há 1 dia" : `há ${diffDays} dias`;
  }
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffDays < 30) {
    return diffWeeks === 1 ? "há 1 semana" : `há ${diffWeeks} semanas`;
  }
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 365) {
    return diffMonths === 1 ? "há 1 mês" : `há ${diffMonths} meses`;
  }
  const diffYears = Math.floor(diffDays / 365);
  return diffYears === 1 ? "há 1 ano" : `há ${diffYears} anos`;
}

export function formatPostDate(isoDate: string, overrideFormat?: 'relative' | 'exact', includeTime = true): string {
  if (!isoDate) return "";
  const mode = overrideFormat || state.dateFormat || (localStorage.getItem('dateFormat') as 'relative' | 'exact') || 'relative';
  if (mode === 'exact') {
    return formatExactDate(isoDate, includeTime);
  }
  return formatRelativeTime(isoDate);
}

