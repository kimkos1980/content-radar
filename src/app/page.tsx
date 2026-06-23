import Link from "next/link";

export default function HomePage() {
  return (
    <main className="home">
      <section>
        <p className="eyebrow">Content Radar</p>
        <h1>Радар мамского и детского контента</h1>
        <p>
          Сервис собирает свежие ссылки из YouTube, Google News RSS и RSS-лент,
          оценивает их по ключевым словам и отправляет сильные находки в Telegram.
        </p>
        <Link className="primaryLink" href="/dashboard/content">
          Открыть админку
        </Link>
      </section>
    </main>
  );
}
