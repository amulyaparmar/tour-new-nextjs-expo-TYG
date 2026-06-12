import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { contactCard, propertyTour } from "../../(app)/contact-card-data";
import { TourLeadForm } from "./TourLeadForm";

type LeadPageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export async function generateMetadata({ params }: LeadPageProps): Promise<Metadata> {
  const { slug } = await params;

  if (slug !== "alex") {
    return {
      title: "Tour contact"
    };
  }

  return {
    title: `${propertyTour.name} tour with ${contactCard.name}`,
    description: `Share your contact info and request a recorded tour summary from ${contactCard.name}.`
  };
}

export default async function LeadPage({ params }: LeadPageProps) {
  const { slug } = await params;

  if (slug !== "alex") {
    notFound();
  }

  return <TourLeadForm />;
}
