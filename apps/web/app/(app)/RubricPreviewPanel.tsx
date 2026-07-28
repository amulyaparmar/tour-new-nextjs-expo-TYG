import type { ReactNode } from "react";
import { Building2, ChevronDown, ClipboardList, ListChecks, ShieldCheck, Star, X } from "lucide-react";

import type { Rubric } from "@tour/shared";
import { rubricItemCount, rubricTotalPoints } from "@tour/shared";

export function RubricPreviewPanel({
  rubric,
  titleId,
  onClose,
  closeLabel = "Close rubric preview",
  footer,
}: {
  rubric: Rubric;
  titleId?: string;
  onClose?: () => void;
  closeLabel?: string;
  footer?: ReactNode;
}) {
  const totalPoints = rubricTotalPoints(rubric.definition);
  const totalItems = rubricItemCount(rubric.definition);

  return (
    <div className="rubric-modal-preview">
      {onClose ? (
        <button type="button" className="rubric-preview-close" aria-label={closeLabel} onClick={onClose}>
          <X size={15} />
        </button>
      ) : null}
      <div className="rubric-preview-heading">
        <span className="rubric-preview-icon" aria-hidden="true">
          <Building2 size={22} />
        </span>
        <div>
          <strong id={titleId}>{rubric.name}</strong>
          <div className="rubric-preview-badges">
            <span><Star size={13} /> {totalPoints} pts</span>
            <span><ListChecks size={13} /> {totalItems} items</span>
            <span>{rubric.definition.sections.length} categories</span>
          </div>
        </div>
      </div>
      <div className="rubric-preview-section-heading">
        <div>
          <strong>Scoring categories</strong>
          <span>Open a category to review its criteria.</span>
        </div>
      </div>
      <div className="rubric-preview-accordions">
        {rubric.definition.sections.map((section, sectionIndex) => {
          const sectionPoints = section.items.reduce((sum, item) => sum + item.points, 0);
          return (
            <details
              key={section.name}
              className="rubric-preview-accordion"
              open={sectionIndex === 0}
            >
              <summary>
                <span className="rubric-preview-accordion-icon" aria-hidden="true">
                  <ClipboardList size={15} />
                </span>
                <span className="rubric-preview-accordion-copy">
                  <strong>{section.name}</strong>
                  <small>{section.items.length} criteria</small>
                </span>
                <span className="rubric-preview-accordion-points">{sectionPoints} pts</span>
                <ChevronDown className="rubric-preview-accordion-chevron" size={16} aria-hidden="true" />
              </summary>
              <div className="rubric-preview-accordion-body">
                {section.items.map((item, itemIndex) => (
                  <div key={item.id} className="rubric-preview-question-row">
                    <span className="rubric-preview-question-number">{itemIndex + 1}</span>
                    <div className="rubric-preview-question-copy">
                      <p>{item.text}</p>
                      {item.note ? <small>{item.note}</small> : null}
                    </div>
                    <strong>{item.points} pts</strong>
                  </div>
                ))}
              </div>
            </details>
          );
        })}
        {rubric.definition.compliance?.length ? (
          <details className="rubric-preview-accordion">
            <summary>
              <span className="rubric-preview-accordion-icon rubric-preview-accordion-icon-compliance" aria-hidden="true">
                <ShieldCheck size={15} />
              </span>
              <span className="rubric-preview-accordion-copy">
                <strong>Compliance flags</strong>
                <small>{rubric.definition.compliance.length} checks</small>
              </span>
              <span className="rubric-preview-accordion-points">Flag only</span>
              <ChevronDown className="rubric-preview-accordion-chevron" size={16} aria-hidden="true" />
            </summary>
            <div className="rubric-preview-accordion-body">
              {rubric.definition.compliance.map((item, itemIndex) => (
                <div key={item.id} className="rubric-preview-question-row">
                  <span className="rubric-preview-question-number">{itemIndex + 1}</span>
                  <div className="rubric-preview-question-copy">
                    <p>{item.text}</p>
                    {item.note ? <small>{item.note}</small> : null}
                  </div>
                  <strong>{item.points} pts</strong>
                </div>
              ))}
            </div>
          </details>
        ) : null}
      </div>
      {footer ? <div className="rubric-preview-actions">{footer}</div> : null}
    </div>
  );
}
