import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { getRepCard, offlineContactQrUrl, vCardDownloadUrl } from "@/lib/reps";
import { CheckInCard } from "./CheckInCard";

type LeadPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: LeadPageProps): Promise<Metadata> {
  const { slug } = await params;
  const card = getRepCard(slug);

  if (!card) {
    return { title: "Tour contact" };
  }

  const { rep, property } = card;
  const title = `${property.name} tour with ${rep.name}`;
  const description = `Check in for your tour at ${property.name} with ${rep.name}, ${rep.title}.`;
  const cardImage = `/api/p/${rep.slug}/card`;

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3002";

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    openGraph: {
      title,
      description,
      images: [{ url: cardImage, width: 1200, height: 630, alt: `${rep.name} tour card` }]
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [cardImage]
    }
  };
}

export default async function LeadPage({ params }: LeadPageProps) {
  const { slug } = await params;
  const card = getRepCard(slug);

  if (!card) {
    notFound();
  }

  return (
    <CheckInCard
      card={card}
      vCardUrl={vCardDownloadUrl(card.rep)}
      offlineQrUrl={offlineContactQrUrl(card.rep)}
    />
  );
}
