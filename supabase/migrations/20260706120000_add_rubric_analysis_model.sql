-- Per-rubric AI model selection (standardized id, resolved to provider at runtime).

alter table rubrics
  add column if not exists analysis_model text not null default 'claude-sonnet-5';

comment on column rubrics.analysis_model is
  'Standardized analysis model id (e.g. claude-sonnet-5), mapped to Bedrock/etc. at runtime.';
