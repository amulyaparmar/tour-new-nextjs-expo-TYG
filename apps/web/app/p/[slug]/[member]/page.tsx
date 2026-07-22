import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getPropertyRepCard } from "@/lib/property-reps";
import { offlineContactQrUrl, vCardDownloadUrl } from "@/lib/reps";
import { CheckInCard } from "../CheckInCard";

type PropertyMemberPageProps = {
  params: Promise<{
    slug: string;
    member: string;
  }>;
  searchParams: Promise<{
    "check-in"?: string | string[];
  }>;
};

export const dynamic = "force-dynamic";

function wantsCheckIn(value: string | string[] | undefined) {
  const raw = Array.isArray(value) ? value[0] : value;
  const normalized = (raw ?? "").trim().toLowerCase();
  return normalized === "true" || normalized === "1" || normalized === "yes";
}

export async function generateMetadata({ params }: PropertyMemberPageProps): Promise<Metadata> {
  const { slug, member } = await params;
  const card = await getPropertyRepCard(slug, member);
  if (!card) return { title: "Tour check-in" };

  const title = `${card.property.name} tour with ${card.rep.name}`;
  const description = `Check in for your tour at ${card.property.name} with ${card.rep.name}, ${card.rep.title}.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: "website",
      ...(card.property.mediaUrl && card.property.mediaKind === "image"
        ? { images: [{ url: card.property.mediaUrl }] }
        : {}),
    },
    twitter: {
      card: card.property.mediaUrl && card.property.mediaKind === "image" ? "summary_large_image" : "summary",
      title,
      description,
      ...(card.property.mediaUrl && card.property.mediaKind === "image"
        ? { images: [card.property.mediaUrl] }
        : {}),
    },
  };
}

export default async function PropertyMemberPage({ params, searchParams }: PropertyMemberPageProps) {
  const { slug, member } = await params;
  const query = await searchParams;
  const card = await getPropertyRepCard(slug, member);
  if (!card) notFound();

  return (
    <CheckInCard
      card={card}
      vCardUrl={vCardDownloadUrl(card.rep)}
      offlineQrUrl={offlineContactQrUrl(card.rep)}
      initialSheet={wantsCheckIn(query["check-in"]) ? "contact" : "none"}
    />
  );
}
