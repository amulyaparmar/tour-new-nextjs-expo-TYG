import type { AdminWorkspace } from "./admin-auth";

export function buildWorkspaceContactCard(workspace: AdminWorkspace) {
  const name = workspace.teamMember.name
    || workspace.user.fullName
    || workspace.user.email.split("@")[0]
    || "Property team member";
  const phone = workspace.teamMember.phone || workspace.user.phone || "";
  const propertyAlias = workspace.community.alias || workspace.community.propertyTygId;
  const memberAlias = workspace.teamMember.alias || workspace.teamMember.id || workspace.user.id;
  const localPath = `/p/${encodeURIComponent(propertyAlias.replace(/^@/, ""))}/${encodeURIComponent(memberAlias.replace(/^@/, ""))}`;
  return {
    name,
    initials: initialsFor(name),
    title: workspace.teamMember.title || workspace.user.title || workspace.teamMember.role || "Property Team",
    company: workspace.community.companyName || workspace.community.name,
    phoneDisplay: formatPhone(phone),
    phoneValue: phone,
    email: workspace.user.email,
    websiteDisplay: `tour.you${localPath}`,
    website: localPath,
    localPath,
  };
}

function initialsFor(name: string) {
  return name.split(/\s+/).filter(Boolean).map((part) => part[0]).join("").slice(0, 2).toUpperCase() || "T";
}

function formatPhone(value: string) {
  const digits = value.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  if (digits.length === 10) return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  return value || "Phone not provided";
}
