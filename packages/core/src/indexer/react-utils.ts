import ts from "typescript";

/**
 * Check if a node's subtree contains JSX elements (JsxElement, JsxSelfClosingElement, JsxFragment).
 * Used to classify functions as React components.
 */
export function containsJsx(node: ts.Node): boolean {
  let found = false;
  function walk(n: ts.Node): void {
    if (found) return;
    if (
      ts.isJsxElement(n) ||
      ts.isJsxSelfClosingElement(n) ||
      ts.isJsxFragment(n)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(n, walk);
  }
  walk(node);
  return found;
}
