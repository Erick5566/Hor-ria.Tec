export default function PanelLoading() {
  return (
    <section className="module panel-route-loading" aria-live="polite">
      <div className="panel-loading-heading">
        <span className="panel-loading-line short" />
        <span className="panel-loading-line title" />
        <span className="panel-loading-line medium" />
      </div>
      <div className="panel-loading-kpis">
        {Array.from({ length: 4 }, (_, index) => (
          <div className="panel-loading-card" key={index}>
            <span className="panel-loading-line short" />
            <span className="panel-loading-line value" />
            <span className="panel-loading-line medium" />
          </div>
        ))}
      </div>
      <div className="panel-loading-table">
        <span className="panel-loading-line title" />
        {Array.from({ length: 6 }, (_, index) => (
          <span className="panel-loading-row" key={index} />
        ))}
      </div>
    </section>
  );
}
