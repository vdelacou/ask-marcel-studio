// mdast-util-to-markdown (the rich editor's serialiser, via @milkdown/crepe) escapes any
// `&` before `#` or a letter on every save, guarding against it being re-parsed as the start
// of a character reference (node_modules/mdast-util-to-markdown/lib/unsafe.js). Real entities
// are rare in this app's prose; the escape just litters skill and voice-profile files with
// backslashes. This reverses exactly that pattern, nothing else a backslash might precede.
export const unescapeAmpersands = (markdown: string): string => markdown.replace(/\\&(?=[#A-Za-z])/g, '&');
