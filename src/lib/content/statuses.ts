import type { ContentItemStatus } from "./types";

export const contentStatuses: Array<{
  value: ContentItemStatus;
  label: string;
}> = [
  { value: "new", label: "Новые" },
  { value: "approved", label: "Одобрено" },
  { value: "rejected", label: "Мусор" },
  { value: "in_work", label: "В работе" },
  { value: "urgent", label: "Срочно" },
  { value: "remake", label: "Переснять" },
  { value: "used", label: "Использовано" }
];

export function isContentStatus(value: string): value is ContentItemStatus {
  return contentStatuses.some((status) => status.value === value);
}

export function getStatusLabel(value: string) {
  return contentStatuses.find((status) => status.value === value)?.label ?? value;
}
