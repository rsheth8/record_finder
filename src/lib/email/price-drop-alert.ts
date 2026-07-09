import { formatUsd } from "@/lib/commerce/pricing";

export interface PriceDropItem {
  discogsReleaseId: number;
  title: string;
  artist: string;
  oldPrice: number;
  newPrice: number;
}

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

function percentOff(oldPrice: number, newPrice: number): number {
  if (oldPrice <= 0) return 0;
  return Math.round(((oldPrice - newPrice) / oldPrice) * 100);
}

/** Pure template — no I/O, no Resend client — so the content can be unit
 * tested without mocking an email provider. See send.ts for the actual send. */
export function buildPriceDropEmail(items: PriceDropItem[]): {
  subject: string;
  html: string;
  text: string;
} {
  const subject =
    items.length === 1
      ? `Price drop: ${items[0].title} is now ${formatUsd(items[0].newPrice)}`
      : `${items.length} records on your wishlist just dropped in price`;

  const rows = items
    .map((item) => {
      const url = `${SITE_URL}/album/${item.discogsReleaseId}`;
      const off = percentOff(item.oldPrice, item.newPrice);
      return { item, url, off };
    })
    .sort((a, b) => b.off - a.off);

  const html = `
    <div>
      <p>Good news — prices dropped on ${items.length === 1 ? "a record" : "some records"} in your wishlist:</p>
      <ul>
        ${rows
          .map(
            ({ item, url, off }) => `
          <li>
            <a href="${url}">${item.artist} — ${item.title}</a>:
            ${formatUsd(item.oldPrice)} &rarr; <strong>${formatUsd(item.newPrice)}</strong>
            (${off}% off)
          </li>`,
          )
          .join("")}
      </ul>
    </div>
  `.trim();

  const text = [
    `Good news — prices dropped on ${items.length === 1 ? "a record" : "some records"} in your wishlist:`,
    "",
    ...rows.map(
      ({ item, url, off }) =>
        `${item.artist} — ${item.title}: ${formatUsd(item.oldPrice)} -> ${formatUsd(item.newPrice)} (${off}% off)\n${url}`,
    ),
  ].join("\n");

  return { subject, html, text };
}
