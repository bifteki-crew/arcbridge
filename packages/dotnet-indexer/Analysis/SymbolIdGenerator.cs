namespace ArcBridge.DotnetIndexer.Analysis;

/// <summary>
/// Generates symbol IDs matching the TypeScript indexer format:
/// {relativePath}::{qualifiedName}#{kind}
/// </summary>
public static class SymbolIdGenerator
{
    public static string Generate(string relativePath, string qualifiedName, string kind)
    {
        // Normalize to forward slashes (same as TS indexer)
        var normalizedPath = relativePath.Replace('\\', '/');
        return $"{normalizedPath}::{qualifiedName}#{kind}";
    }
}
