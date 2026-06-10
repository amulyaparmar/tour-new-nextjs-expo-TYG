import { recentRecordings, tourMetrics, tourWorkspace } from "@tour/shared";

export default function Page() {
  return (
    <main className="shell">
      <aside className="sidebar">
        <h1>{tourWorkspace.name}</h1>
        <nav>
          <a href="/">Dashboard</a>
          <a href="/tour-record">Tour Record</a>
          <a href="/tour-ridealong">Tour Ridealong</a>
          <a href="/">Knowledge</a>
          <a href="/">Sales Materials</a>
          <a href="/">Media</a>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Central workspace</p>
            <h2>Tour knowledge and recordings</h2>
          </div>
          <button>New upload</button>
        </header>

        <section className="metrics">
          {tourMetrics.map((metric) => (
            <article key={metric.label}>
              <strong>{metric.value}</strong>
              <span>{metric.label}</span>
            </article>
          ))}
        </section>

        <section className="grid">
          <article className="panel">
            <h3>Recent recordings</h3>
            {recentRecordings.map((recording) => (
              <div className="row" key={recording}>
                <span>{recording}</span>
                <button>Review</button>
              </div>
            ))}
          </article>

          <article className="panel">
            <h3>AI tour insights</h3>
            <p>
              Summarize transcripts, identify objections, capture questions, and
              turn each tour into follow-up tasks.
            </p>
          </article>

          <article className="panel">
            <h3>Knowledge library</h3>
            <p>
              Keep approved talk tracks, sales decks, media, and property facts
              in one searchable place.
            </p>
          </article>
        </section>
      </section>
    </main>
  );
}
