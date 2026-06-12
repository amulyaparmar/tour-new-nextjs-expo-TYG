import type { AnalysisResult } from "@tour/shared";

type Props = {
  analysis: AnalysisResult;
};

export function SessionNotesPanel({ analysis }: Props) {
  return (
    <>
      <div className="sa-card">
        <h3 className="sa-card-title">Executive Summary</h3>
        <p className="sa-card-body">{analysis.summary}</p>
      </div>

      <div className="sa-two-col">
        <div className="sa-card sa-card--green">
          <h3 className="sa-card-title sa-card-title--green">Strengths</h3>
          <ul className="sa-list">
            {analysis.strengths.map((strength, index) => (
              <li key={index} className="sa-list-item sa-list-item--green">{strength}</li>
            ))}
          </ul>
        </div>
        <div className="sa-card sa-card--amber">
          <h3 className="sa-card-title sa-card-title--amber">Opportunities</h3>
          <ul className="sa-list">
            {analysis.opportunities.map((opportunity, index) => (
              <li key={index} className="sa-list-item sa-list-item--amber">{opportunity}</li>
            ))}
          </ul>
        </div>
      </div>

      {analysis.suggestedRewrite && (
        <div className="sa-card sa-card--blue">
          <h3 className="sa-card-title sa-card-title--blue">Coaching: Suggested Script</h3>
          <p className="sa-card-body" style={{ fontStyle: "italic" }}>
            &ldquo;{analysis.suggestedRewrite}&rdquo;
          </p>
        </div>
      )}
    </>
  );
}
