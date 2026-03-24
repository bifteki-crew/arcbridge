# arcbridge-dotnet-indexer

Roslyn-based C# indexer for [ArcBridge](https://github.com/bifteki-crew/arcbridge) — provides deep semantic analysis for .NET projects.

## Installation

```bash
dotnet tool install -g arcbridge-dotnet-indexer
```

## What it does

This is the advanced C# indexing backend for ArcBridge. It uses the Roslyn compiler platform to extract:

- **Symbols** — classes, interfaces, enums, methods, properties with full type resolution
- **Dependencies** — inheritance, interface implementation, method calls, type usage (cross-file)
- **Routes** — ASP.NET controller routes and minimal API endpoints
- **Content hashes** — for incremental indexing (only re-process changed files)

## When to use it

ArcBridge ships with a built-in tree-sitter WASM indexer that works without .NET SDK. This Roslyn tool is for users who want deeper analysis:

| Feature | Tree-sitter (default) | Roslyn (this tool) |
|---------|----------------------|-------------------|
| Requires .NET SDK | No | Yes |
| Cross-file type resolution | No (name-based) | Yes |
| Overload resolution | No | Yes |
| Generic type tracking | No | Yes |
| Assembly-level filtering | No | Yes |

## Configuration

Once installed, ArcBridge auto-detects the tool and uses it. Or set explicitly in `.arcbridge/config.yaml`:

```yaml
indexing:
  csharp_indexer: roslyn  # or "auto" (default) or "tree-sitter"
```

## License

MIT
