"use client";

import styles from "./session-detail.module.css";

export function AiChatModelSelect({
  value,
  onChange,
  options,
  disabled,
  id,
  label = "Model",
}: {
  value: string;
  onChange: (value: string) => void;
  options: ReadonlyArray<{ id: string; label: string; group?: string }>;
  disabled?: boolean;
  id: string;
  label?: string;
}) {
  const groups = Array.from(
    new Set(options.map((option) => option.group).filter(Boolean))
  ) as string[];

  const ungrouped = options.filter((option) => !option.group);
  const hasGroups = groups.length > 0;

  return (
    <div className={styles.aiChatModelSelectWrap}>
      <label className={styles.aiChatModelSelectLabel} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className={styles.aiChatModelSelect}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {hasGroups ? (
          <>
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {options
                  .filter((option) => option.group === group)
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
              </optgroup>
            ))}
            {ungrouped.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </>
        ) : (
          options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))
        )}
      </select>
    </div>
  );
}
