import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
  "b","strong","i","em","u","s","strike","br","p","div","span",
  "ul","ol","li","a","code","pre","blockquote",
];

export function sanitizeRichText(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["href", "target", "rel"],
  });
}