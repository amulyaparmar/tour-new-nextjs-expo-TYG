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
};

export const dynamic = "force-dynamic";

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
      ...(card.property.mediaUrl ? { images: [{ url: card.property.mediaUrl }] } : {}),
    },
    twitter: {
      card: card.property.mediaUrl ? "summary_large_image" : "summary",
      title,
      description,
      ...(card.property.mediaUrl ? { images: [card.property.mediaUrl] } : {}),
    },
  };
}

export default async function PropertyMemberPage({ params }: PropertyMemberPageProps) {
  const { slug, member } = await params;
  const card = await getPropertyRepCard(slug, member);
  if (!card) notFound();

  return (
    <CheckInCard
      card={card}
      vCardUrl={vCardDownloadUrl(card.rep)}
      offlineQrUrl={offlineContactQrUrl(card.rep)}
    />
  );
}
