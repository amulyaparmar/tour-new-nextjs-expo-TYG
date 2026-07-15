/** URL-safe public check-in alias from a human label (property or person name). */
export function toPublicAlias(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

export function defaultPropertyPublicAlias(input: {
  alias?: string | null;
  name?: string | null;
  propertyTygId?: string | null;
}) {
  return toPublicAlias(input.alias)
    || toPublicAlias(input.name)
    || (input.propertyTygId ?? "").trim();
}

export function defaultMemberPublicAlias(input: {
  alias?: string | null;
  name?: string | null;
  email?: string | null;
  id?: string | null;
}) {
  return toPublicAlias(input.alias)
    || toPublicAlias(input.name)
    || toPublicAlias((input.email ?? "").split("@")[0])
    || (input.id ?? "").trim();
}
