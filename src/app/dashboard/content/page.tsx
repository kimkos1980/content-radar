import { revalidatePath } from "next/cache";
import Link from "next/link";
import { getStatusLabel, contentStatuses, isContentStatus } from "@/lib/content/statuses";
import type { ContentItem, ContentItemStatus } from "@/lib/content/types";
import { getSupabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams?: {
    status?: string;
    category?: string;
  };
};

async function updateStatus(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");

  if (!id || !isContentStatus(status)) {
    return;
  }

  const supabase = getSupabaseAdmin();
  await supabase.from("content_items").update({ status }).eq("id", id);
  revalidatePath("/dashboard/content");
}

async function updateNote(formData: FormData) {
  "use server";

  const id = String(formData.get("id") ?? "");
  const editorNote = String(formData.get("editor_note") ?? "");

  if (!id) {
    return;
  }

  const supabase = getSupabaseAdmin();
  await supabase
    .from("content_items")
    .update({ editor_note: editorNote })
    .eq("id", id);
  revalidatePath("/dashboard/content");
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusButtonLabel(status: ContentItemStatus) {
  if (status === "in_work") {
    return "В работу";
  }

  if (status === "rejected") {
    return "Мусор";
  }

  if (status === "urgent") {
    return "Срочно";
  }

  if (status === "remake") {
    return "Переснять";
  }

  if (status === "used") {
    return "Использовано";
  }

  return getStatusLabel(status);
}

export default async function ContentDashboardPage({ searchParams }: PageProps) {
  const supabase = getSupabaseAdmin();
  const selectedStatus = searchParams?.status ?? "";
  const selectedCategory = searchParams?.category ?? "";

  let itemsQuery = supabase
    .from("content_items")
    .select("*")
    .order("found_at", { ascending: false })
    .limit(100);

  if (selectedStatus && isContentStatus(selectedStatus)) {
    itemsQuery = itemsQuery.eq("status", selectedStatus);
  }

  if (selectedCategory) {
    itemsQuery = itemsQuery.eq("category", selectedCategory);
  }

  const [itemsResponse, categoriesResponse] = await Promise.all([
    itemsQuery.returns<ContentItem[]>(),
    supabase.from("content_items").select("category").not("category", "is", null)
  ]);

  if (itemsResponse.error) {
    throw itemsResponse.error;
  }

  if (categoriesResponse.error) {
    throw categoriesResponse.error;
  }

  const categories = Array.from(
    new Set(
      (categoriesResponse.data ?? [])
        .map((row) => row.category as string | null)
        .filter(Boolean) as string[]
    )
  ).sort((a, b) => a.localeCompare(b, "ru"));

  const items = itemsResponse.data ?? [];
  const quickStatuses: ContentItemStatus[] = [
    "in_work",
    "rejected",
    "urgent",
    "remake",
    "used"
  ];

  return (
    <main className="dashboard">
      <header className="dashboardHeader">
        <div>
          <h1>Content Radar</h1>
          <p>Свежие находки, ручная разметка и заметки редактора.</p>
        </div>
        <Link className="primaryLink" href="/">
          На главную
        </Link>
      </header>

      <form className="filters">
        <div className="field">
          <label htmlFor="status">Статус</label>
          <select id="status" name="status" defaultValue={selectedStatus}>
            <option value="">Все</option>
            {contentStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="category">Категория</label>
          <select id="category" name="category" defaultValue={selectedCategory}>
            <option value="">Все</option>
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <button className="button" type="submit">
          Применить
        </button>
      </form>

      <section className="tableWrap">
        {items.length === 0 ? (
          <div className="emptyState">Материалов пока нет.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Материал</th>
                <th>Источник</th>
                <th>Категория</th>
                <th>Оценка</th>
                <th>Статус</th>
                <th>Найдено</th>
                <th>Действия</th>
                <th>Заметка</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td>
                    <div className="titleCell">
                      <strong>{item.title}</strong>
                      {item.description ? <span>{item.description}</span> : null}
                      <a href={item.source_url} target="_blank" rel="noreferrer">
                        Открыть источник
                      </a>
                    </div>
                  </td>
                  <td>
                    <div>{item.source_name}</div>
                    <div className="meta">{item.source_type}</div>
                  </td>
                  <td>{item.category ?? "—"}</td>
                  <td>
                    <span className="score">{item.score}</span>
                    <span className="meta">/20</span>
                  </td>
                  <td>
                    <span className="statusBadge">{getStatusLabel(item.status)}</span>
                  </td>
                  <td>
                    <div>{formatDate(item.found_at)}</div>
                    <div className="meta">Публикация: {formatDate(item.published_at)}</div>
                  </td>
                  <td>
                    <div className="actions">
                      {quickStatuses.map((status) => (
                        <form action={updateStatus} key={status}>
                          <input type="hidden" name="id" value={item.id} />
                          <input type="hidden" name="status" value={status} />
                          <button className="smallButton" type="submit">
                            {statusButtonLabel(status)}
                          </button>
                        </form>
                      ))}
                    </div>
                  </td>
                  <td>
                    <form action={updateNote} className="noteForm">
                      <input type="hidden" name="id" value={item.id} />
                      <textarea
                        aria-label="Заметка редактора"
                        name="editor_note"
                        defaultValue={item.editor_note ?? ""}
                      />
                      <button className="smallButton" type="submit">
                        Сохранить
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
