import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let cachedParser: any = null;

export function getCSharpParser(): any {
  if (cachedParser) return cachedParser;
  const Parser = require("tree-sitter");
  const CSharp = require("tree-sitter-c-sharp");
  cachedParser = new Parser();
  cachedParser.setLanguage(CSharp);
  return cachedParser;
}

export function parseCSharp(content: string): any {
  return getCSharpParser().parse(content);
}
