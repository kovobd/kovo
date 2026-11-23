import { CURRENCY_SYMBOL } from "@/lib/currency";
import { supabase } from "@/integrations/supabase/client";
import logoUrl from "@/assets/kovo-logo.png";
import { resolveImageSrc } from "@/lib/cdnImage";

interface InvoiceData {
  order: any;
  storeName?: string;
  storeAddress?: string;
  storePhone?: string;
  storeEmail?: string;
  logoUrl?: string;
  footerText?: string;
  signatureLabel?: string;
  termsText?: string;
}

const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

/**
 * Turn any logo reference (R2 marker, absolute URL, relative asset path)
 * into a base64 data URL so it survives being written into a popup document
 * and is guaranteed to be decoded before print(). Falls back to the bundled
 * Kovo wordmark whenever the configured logo can't be fetched.
 */
async function toDataUrl(src: string): Promise<string | null> {
  try {
    const abs = new URL(src, window.location.origin).href;
    const res = await fetch(abs, { mode: "cors", cache: "force-cache" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.size || !blob.type.startsWith("image/")) return null;
    return await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function resolveLogoDataUrl(configured?: string | null): Promise<string> {
  const candidates = [configured ? resolveImageSrc(configured, 800) : null, logoUrl].filter(
    (v): v is string => !!v && v !== "/placeholder.svg",
  );
  for (const candidate of candidates) {
    const dataUrl = await toDataUrl(candidate);
    if (dataUrl) return dataUrl;
  }
  return logoUrl;
}

const money = (n: unknown) => `${CURRENCY_SYMBOL}${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

/**
 * Kovo invoice.
 *
 * Print-friendly by design: parchment-white paper, ink-black type, deep-violet
 * brand accents, Cinzel display headings + Inter body. Colour is limited to
 * hairlines and small accents so it reads perfectly on a monochrome printer.
 */
const generateInvoiceHTML = (data: InvoiceData, format: "a4" | "receipt" = "a4"): string => {
  const {
    order,
    storeName = "Kovo",
    storeAddress = "",
    storePhone = "",
    storeEmail = "",
    logoUrl: logo,
    footerText = "Thank you for shopping with Kovo.",
    signatureLabel = "",
    termsText = "",
  } = data;

  const brandLogo = logo || logoUrl;
  const items = (order.items as any[]) || [];
  const addr = order.shipping_address || {};
  const date = new Date(order.created_at).toLocaleDateString("en-GB", {
    year: "numeric",
    month: "long",
    day: "2-digit",
  });

  const fonts =
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">';

  if (format === "receipt") {
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Receipt ${esc(order.order_number)}</title>${fonts}
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',ui-monospace,'Courier New',monospace;width:302px;padding:14px 12px;font-size:11.5px;color:#111;background:#fff;-webkit-font-smoothing:antialiased}
  .brand{text-align:center;margin-bottom:8px}
  .brand img{max-height:56px;width:auto;object-fit:contain;margin:0 auto 6px;display:block}
  .name{font-family:'Cinzel',Georgia,serif;font-size:16px;font-weight:700;letter-spacing:.16em;text-transform:uppercase}
  .tag{font-size:9px;letter-spacing:.28em;text-transform:uppercase;color:#666;margin-top:3px}
  .rule{border-top:1px dashed #999;margin:9px 0}
  .rule-orn{text-align:center;font-size:9px;letter-spacing:.4em;color:#777;margin:9px 0}
  .row{display:flex;justify-content:space-between;gap:8px;line-height:1.6}
  .row span:last-child{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap}
  .muted{color:#555}
  .item{margin-bottom:3px}
  .item .sub{font-size:9.5px;color:#666}
  .total{font-family:'Cinzel',Georgia,serif;font-size:14px;font-weight:700;letter-spacing:.04em}
  .foot{text-align:center;font-size:9.5px;color:#555;line-height:1.6;margin-top:10px}
  @media print{body{padding:6px}}
</style></head><body>
  <div class="brand">
    ${brandLogo ? `<img src="${esc(brandLogo)}" alt="${esc(storeName)}" />` : ""}
    <div class="name">${esc(storeName)}</div>
    ${storePhone ? `<div class="tag">${esc(storePhone)}</div>` : ""}
  </div>
  <div class="rule-orn">— ✦ —</div>
  <div class="row"><span class="muted">Receipt</span><span>#${esc(order.order_number)}</span></div>
  <div class="row"><span class="muted">Date</span><span>${esc(date)}</span></div>
  ${order.customer_name ? `<div class="row"><span class="muted">Customer</span><span>${esc(order.customer_name)}</span></div>` : ""}
  ${order.customer_phone ? `<div class="row"><span class="muted">Phone</span><span>${esc(order.customer_phone)}</span></div>` : ""}
  <div class="rule"></div>
  ${items
    .map(
      (item: any) => `<div class="item">
      <div class="row"><span>${esc(item.name)}</span><span>${money(Number(item.price) * (item.quantity || 1))}</span></div>
      <div class="sub">${item.variant ? `${esc(item.variant)} · ` : ""}${item.quantity || 1} × ${money(item.price)}</div>
    </div>`,
    )
    .join("")}
  <div class="rule"></div>
  <div class="row"><span class="muted">Subtotal</span><span>${money(order.subtotal)}</span></div>
  ${Number(order.discount_amount) > 0 ? `<div class="row"><span class="muted">Discount${order.coupon_code ? ` (${esc(order.coupon_code)})` : ""}</span><span>−${money(order.discount_amount)}</span></div>` : ""}
  <div class="row"><span class="muted">Shipping</span><span>${money(order.shipping_cost)}</span></div>
  <div class="rule"></div>
  <div class="row total"><span>Total</span><span>${money(order.total)}</span></div>
  <div class="rule-orn">— ✦ —</div>
  <div class="foot">${esc(footerText || "Thank you for your purchase!")}</div>
</body></html>`;
  }

  // ── A4 invoice ────────────────────────────────────────────────────────────
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${esc(order.order_number)}</title>${fonts}
<style>
  :root{
    --ink:#14101c;
    --ink-soft:#5a5368;
    --line:#ded8ea;
    --violet:#4b2f7a;
    --violet-soft:#f4f0fb;
  }
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:'Inter',Helvetica,Arial,sans-serif;color:var(--ink);background:#fff;-webkit-font-smoothing:antialiased;font-size:13px;line-height:1.55}
  .sheet{max-width:820px;margin:0 auto;padding:44px 46px 36px}

  /* Header */
  .top{display:flex;justify-content:space-between;align-items:flex-start;gap:28px;padding-bottom:22px;border-bottom:2px solid var(--ink)}
  .brand img{max-height:82px;max-width:230px;width:auto;height:auto;object-fit:contain;display:block}
  .brand .name{font-family:'Cinzel',Georgia,serif;font-size:26px;font-weight:700;letter-spacing:.1em;text-transform:uppercase}
  .brand .tag{font-size:9.5px;letter-spacing:.34em;text-transform:uppercase;color:var(--ink-soft);margin-top:8px}
  .doc{text-align:right;flex-shrink:0}
  .doc h2{font-family:'Cinzel',Georgia,serif;font-size:30px;font-weight:600;letter-spacing:.22em;text-transform:uppercase;line-height:1}
  .doc .meta{margin-top:12px;font-size:11.5px;color:var(--ink-soft);line-height:1.85}
  .doc .meta b{color:var(--ink);font-weight:600;font-variant-numeric:tabular-nums}

  .orn{display:flex;align-items:center;gap:12px;margin:20px 0 24px;color:var(--violet)}
  .orn span{flex:1;height:1px;background:linear-gradient(90deg,transparent,var(--line),transparent)}
  .orn i{font-style:normal;font-size:11px;letter-spacing:.3em}

  /* Parties */
  .parties{display:flex;gap:26px;margin-bottom:26px}
  .party{flex:1;border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--violet-soft)}
  .party h4{font-family:'Cinzel',Georgia,serif;font-size:9.5px;letter-spacing:.24em;text-transform:uppercase;color:var(--violet);margin-bottom:8px}
  .party p{font-size:12.5px;line-height:1.75;color:var(--ink)}
  .party .sub{color:var(--ink-soft);font-size:11.5px}

  /* Items */
  table{width:100%;border-collapse:collapse;margin-bottom:22px}
  thead th{font-family:'Cinzel',Georgia,serif;text-align:left;font-size:9.5px;letter-spacing:.2em;text-transform:uppercase;color:var(--ink-soft);padding:0 10px 9px;border-bottom:1.5px solid var(--ink)}
  thead th:first-child{padding-left:0}
  thead th:last-child,tbody td:last-child{text-align:right;padding-right:0}
  thead th.num,tbody td.num{text-align:right}
  tbody td{padding:12px 10px;font-size:12.5px;border-bottom:1px solid var(--line);vertical-align:top}
  tbody td:first-child{padding-left:0}
  tbody tr:nth-child(even) td{background:#faf8fd}
  .pname{font-weight:600}
  .pvar{display:block;font-size:11px;color:var(--ink-soft);margin-top:2px}
  .num{font-variant-numeric:tabular-nums;white-space:nowrap}

  /* Totals */
  .totals{width:300px;margin-left:auto}
  .totals .row{display:flex;justify-content:space-between;gap:16px;font-size:12.5px;padding:6px 0;color:var(--ink-soft)}
  .totals .row b{color:var(--ink);font-weight:500;font-variant-numeric:tabular-nums}
  .totals .grand{margin-top:8px;padding:12px 14px;border-radius:10px;background:var(--ink);color:#fff;display:flex;justify-content:space-between;align-items:baseline}
  .totals .grand span{font-family:'Cinzel',Georgia,serif;font-size:11px;letter-spacing:.22em;text-transform:uppercase}
  .totals .grand b{font-size:19px;font-weight:700;font-variant-numeric:tabular-nums;color:#fff}

  /* Footer blocks */
  .terms{margin-top:30px;border-top:1px solid var(--line);padding-top:14px;font-size:11px;color:var(--ink-soft);line-height:1.75}
  .terms b{font-family:'Cinzel',Georgia,serif;letter-spacing:.14em;text-transform:uppercase;font-size:9.5px;color:var(--violet)}
  .sign{margin-top:46px;text-align:right}
  .sign div{display:inline-block;min-width:220px;border-top:1px solid var(--ink-soft);padding-top:7px;font-size:11px;color:var(--ink-soft)}
  .foot{margin-top:34px;text-align:center;font-size:10.5px;color:var(--ink-soft);letter-spacing:.06em}
  .foot .mark{font-family:'Cinzel',Georgia,serif;letter-spacing:.3em;text-transform:uppercase;font-size:9px;color:var(--violet);margin-top:7px}

  @page{size:A4;margin:12mm}
  @media print{
    body{font-size:12px}
    .sheet{padding:0;max-width:none}
    .party,.totals .grand,tbody tr:nth-child(even) td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .brand img{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    tbody tr{page-break-inside:avoid}
  }
</style></head><body>
  <div class="sheet">
    <div class="top">
      <div class="brand">
        ${brandLogo ? `<img src="${esc(brandLogo)}" alt="${esc(storeName)}" />` : `<div class="name">${esc(storeName)}</div>`}
        <div class="tag">${esc(storeName)}</div>
      </div>
      <div class="doc">
        <h2>Invoice</h2>
        <div class="meta">
          No. <b>${esc(order.order_number)}</b><br/>
          Issued <b>${esc(date)}</b>${order.payment_method ? `<br/>Payment <b>${esc(String(order.payment_method).toUpperCase())}</b>` : ""}
        </div>
      </div>
    </div>

    <div class="orn"><span></span><i>✦</i><span></span></div>

    <div class="parties">
      <div class="party">
        <h4>Billed To</h4>
        <p>
          <strong>${esc(order.customer_name)}</strong><br/>
          <span class="sub">
            ${order.customer_phone ? `${esc(order.customer_phone)}<br/>` : ""}
            ${order.customer_email ? `${esc(order.customer_email)}<br/>` : ""}
            ${[addr.line1, addr.line2, addr.city, addr.district, addr.state, addr.country].filter(Boolean).map(esc).join(", ")}
          </span>
        </p>
      </div>
      <div class="party">
        <h4>From</h4>
        <p>
          <strong>${esc(storeName)}</strong><br/>
          <span class="sub">
            ${storeAddress ? `${esc(storeAddress)}<br/>` : ""}
            ${storePhone ? `${esc(storePhone)}<br/>` : ""}
            ${storeEmail ? esc(storeEmail) : ""}
          </span>
        </p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>SKU</th>
          <th class="num">Qty</th>
          <th class="num">Unit</th>
          <th class="num">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items
          .map(
            (item: any) => `<tr>
          <td>
            <span class="pname">${esc(item.name)}</span>
            ${item.variant ? `<span class="pvar">${esc(item.variant)}</span>` : ""}
            ${item.is_free_gift ? `<span class="pvar">Free gift</span>` : ""}
          </td>
          <td class="num">${esc(item.sku || "—")}</td>
          <td class="num">${item.quantity || 1}</td>
          <td class="num">${money(item.price)}</td>
          <td class="num">${money(Number(item.price) * (item.quantity || 1))}</td>
        </tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <div class="totals">
      <div class="row"><span>Subtotal</span><b>${money(order.subtotal)}</b></div>
      ${Number(order.discount_amount) > 0 ? `<div class="row"><span>Discount${order.coupon_code ? ` (${esc(order.coupon_code)})` : ""}</span><b>−${money(order.discount_amount)}</b></div>` : ""}
      <div class="row"><span>Shipping</span><b>${money(order.shipping_cost)}</b></div>
      <div class="grand"><span>Grand Total</span><b>${money(order.total)}</b></div>
    </div>

    ${termsText ? `<div class="terms"><b>Terms</b><br/>${esc(termsText)}</div>` : ""}
    ${signatureLabel ? `<div class="sign"><div>${esc(signatureLabel)}</div></div>` : ""}

    <div class="foot">
      ${esc(footerText)}
      <div class="mark">${esc(storeName)}</div>
    </div>
  </div>
</body></html>`;
};

export const printInvoice = async (data: InvoiceData, format: "a4" | "receipt" = "a4") => {
  // Always load invoice settings; explicitly passed values still win.
  try {
    const { data: settings } = await supabase
      .from("invoice_settings")
      .select("*")
      .eq("id", "default")
      .maybeSingle();
    if (settings) {
      const s = settings as any;
      data.storeName = data.storeName || s.store_name || undefined;
      data.storeAddress = data.storeAddress || s.store_address || undefined;
      data.storePhone = data.storePhone || s.store_phone || undefined;
      data.storeEmail = data.storeEmail || s.store_email || undefined;
      data.logoUrl = data.logoUrl || s.logo_url || undefined;
      data.footerText = data.footerText || s.footer_text || s.footer_note || undefined;
      data.signatureLabel = data.signatureLabel || s.signature_label || undefined;
      data.termsText = data.termsText || s.terms_text || undefined;
    }
  } catch {}

  // Inline the brand logo as a data URL. A popup document written with
  // document.write has no origin/base URL, and remote (R2/CDN) logos are
  // often blocked or still loading when print() fires — embedding the bytes
  // guarantees the mark renders on screen AND on paper.
  data.logoUrl = await resolveLogoDataUrl(data.logoUrl);

  const html = generateInvoiceHTML(data, format);
  const win = window.open("", "_blank", format === "receipt" ? "width=360,height=640" : "width=900,height=760");
  if (!win) return;
  win.document.write(html);
  win.document.close();

  // Wait for the logo (and any other images) to finish loading before printing,
  // otherwise the browser prints an empty logo slot.
  const waitForImages = async () => {
    const imgs = Array.from(win.document.images || []);
    await Promise.all(
      imgs.map((img) =>
        img.complete && img.naturalWidth > 0
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            }),
      ),
    );
  };

  const waitForFonts = async () => {
    try { await (win.document as any).fonts?.ready; } catch { /* ignore */ }
  };

  const timeout = new Promise<void>((r) => setTimeout(r, 4000));
  await Promise.race([Promise.all([waitForImages(), waitForFonts()]), timeout]);
  setTimeout(() => { try { win.focus(); win.print(); } catch {} }, 180);
};

export default generateInvoiceHTML;
