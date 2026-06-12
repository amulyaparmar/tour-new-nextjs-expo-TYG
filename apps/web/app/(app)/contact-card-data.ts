export const contactCard = {
  name: "Alex Johnson",
  initials: "A",
  title: "Sales Agent",
  company: "Tour.video",
  phoneDisplay: "(313) 555-0148",
  phoneValue: "+13135550148",
  email: "alex@tour.video",
  websiteDisplay: "tour.you/p/alex",
  website: "https://tour.you/p/alex",
  localPath: "/p/alex"
};

export const propertyTour = {
  name: "27 North",
  mediaUrl:
    "https://storage.googleapis.com/leasemagnets---dummy-db.appspot.com/community/44/intro_revamp_intro/27_North_intro_2024_mp4_1.mp4#t=8"
};

export const contactVcard = [
  "BEGIN:VCARD",
  "VERSION:3.0",
  "N:Johnson;Alex;;;",
  `FN:${contactCard.name}`,
  `ORG:${contactCard.company}`,
  `TITLE:${contactCard.title}`,
  `TEL;TYPE=CELL:${contactCard.phoneValue}`,
  `EMAIL:${contactCard.email}`,
  `URL:${contactCard.website}`,
  "END:VCARD"
].join("\n");

export const encodedContactCard = encodeURIComponent(contactVcard);
export const encodedLeadUrl = encodeURIComponent(contactCard.website);
export const contactCardDownloadUrl = `data:text/vcard;charset=utf-8,${encodedContactCard}`;
export const offlineContactCardQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=196x196&margin=12&format=svg&data=${encodedContactCard}`;
export const tourRequestQrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=196x196&margin=12&format=svg&data=${encodedLeadUrl}`;
export const contactCardShareUrl = `mailto:?subject=${encodeURIComponent(`${contactCard.name} contact card`)}&body=${encodeURIComponent(
  `${contactCard.name}\n${contactCard.title}, ${contactCard.company}\n${contactCard.phoneDisplay}\n${contactCard.email}\n${contactCard.website}`
)}`;
