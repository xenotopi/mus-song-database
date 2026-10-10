const PRODUCT_DATA_URL = "data/amazon-products.json";
const AMAZON_TAG = "mussongdb-22";

export function validAmazonProduct(product) {
  if (!product || typeof product !== "object" || Array.isArray(product)) return false;
  const asin = String(product.asin || "").trim();
  if (!/^[A-Z0-9]{10}$/.test(asin)) return false;
  try {
    const url = new URL(String(product.url || ""));
    if (url.protocol !== "https:") return false;
    // SiteStripe short links hide the tracking tag and ASIN until Amazon redirects.
    // Both values must be verified before adding an entry to amazon-products.json.
    if (url.hostname === "link.amazon") return /^\/[A-Za-z0-9]+$/.test(url.pathname) && !url.search && !url.hash;
    if (!["amazon.co.jp", "www.amazon.co.jp"].includes(url.hostname)) return false;
    if (url.searchParams.get("tag") !== AMAZON_TAG) return false;
    const segments = url.pathname.split("/").filter(Boolean);
    return segments.some((segment, index) => (segment === "dp" && segments[index + 1] === asin)
      || (segment === "gp" && segments[index + 1] === "product" && segments[index + 2] === asin));
  } catch {
    return false;
  }
}

export async function renderAmazonProduct(releaseId, anchor) {
  if (!/^R\d{4}$/.test(releaseId) || !anchor) return;
  if (anchor.nextElementSibling?.classList.contains("release-amazon")) anchor.nextElementSibling.remove();
  let products;
  try {
    const response = await fetch(PRODUCT_DATA_URL);
    if (!response.ok) return;
    products = await response.json();
  } catch {
    return;
  }
  const product = products && typeof products === "object" && !Array.isArray(products) ? products[releaseId] : null;
  if (!validAmazonProduct(product)) return;
  if (!document.querySelector('link[data-release-amazon-style]')) {
    const style = document.createElement("link");
    style.rel = "stylesheet";
    style.href = new URL("../css/release-amazon.css", import.meta.url).href;
    style.dataset.releaseAmazonStyle = "";
    document.head.append(style);
  }
  const region = document.createElement("div");
  region.className = "release-amazon";
  const link = document.createElement("a");
  link.className = "release-amazon-link";
  link.href = product.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer sponsored";
  link.textContent = "Amazon.co.jpで見る";
  region.append(link);
  anchor.after(region);
}
