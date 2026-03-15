using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ArcBridge.DotnetIndexer.Models;

namespace ArcBridge.DotnetIndexer.Analysis;

/// <summary>
/// Extracts dependencies between C# symbols:
/// - class inheritance → extends
/// - interface implementation → implements
/// - method invocations → calls
/// - type references (params, returns, generics) → uses_type
///
/// Only tracks dependencies to project-defined types (not System/Microsoft framework types).
/// </summary>
public sealed class DependencyExtractor : CSharpSyntaxWalker
{
    private readonly SemanticModel _model;
    private readonly string _relativePath;
    private readonly HashSet<string> _knownSymbolIds;
    private readonly Dictionary<(string qualifiedName, string kind), string> _symbolLookup;
    private readonly List<ExtractedDependency> _dependencies = [];
    private readonly HashSet<string> _seen = []; // dedup
    private readonly string _projectAssemblyName;

    public DependencyExtractor(
        SemanticModel model,
        string relativePath,
        HashSet<string> knownSymbolIds)
    {
        _model = model;
        _relativePath = relativePath;
        _knownSymbolIds = knownSymbolIds;
        _projectAssemblyName = model.Compilation.AssemblyName ?? "";

        // Build O(1) lookup from symbol IDs
        _symbolLookup = new Dictionary<(string, string), string>();
        foreach (var id in knownSymbolIds)
        {
            var hashIdx = id.LastIndexOf('#');
            var colonIdx = id.IndexOf("::", StringComparison.Ordinal);
            if (hashIdx > 0 && colonIdx >= 0)
            {
                var qualName = id[(colonIdx + 2)..hashIdx];
                var kind = id[(hashIdx + 1)..];
                _symbolLookup.TryAdd((qualName, kind), id);
            }
        }
    }

    public IReadOnlyList<ExtractedDependency> Dependencies => _dependencies;

    public override void VisitClassDeclaration(ClassDeclarationSyntax node)
    {
        ExtractBaseTypeDeps(node);
        base.VisitClassDeclaration(node);
    }

    public override void VisitRecordDeclaration(RecordDeclarationSyntax node)
    {
        ExtractBaseTypeDeps(node);
        base.VisitRecordDeclaration(node);
    }

    public override void VisitStructDeclaration(StructDeclarationSyntax node)
    {
        ExtractBaseTypeDeps(node);
        base.VisitStructDeclaration(node);
    }

    public override void VisitInvocationExpression(InvocationExpressionSyntax node)
    {
        var symbolInfo = _model.GetSymbolInfo(node);
        if (symbolInfo.Symbol is IMethodSymbol method)
        {
            var sourceId = FindContainingSymbolId(node);
            if (sourceId is not null)
            {
                var targetType = method.ContainingType;
                if (targetType is not null && IsProjectType(targetType))
                {
                    var targetQualified = $"{GetQualifiedName(targetType)}.{method.Name}";
                    TryAddDep(sourceId, targetQualified, "function", "calls");
                }
            }
        }
        base.VisitInvocationExpression(node);
    }

    public override void VisitObjectCreationExpression(ObjectCreationExpressionSyntax node)
    {
        var symbolInfo = _model.GetSymbolInfo(node);
        if (symbolInfo.Symbol is IMethodSymbol ctor)
        {
            var sourceId = FindContainingSymbolId(node);
            if (sourceId is not null && IsProjectType(ctor.ContainingType))
            {
                var targetQualified = GetQualifiedName(ctor.ContainingType);
                TryAddDep(sourceId, targetQualified, "class", "uses_type");
            }
        }
        base.VisitObjectCreationExpression(node);
    }

    public override void VisitIdentifierName(IdentifierNameSyntax node)
    {
        // Track type references — only for project-defined types (skip System, Microsoft, etc.)
        var symbolInfo = _model.GetSymbolInfo(node);
        if (symbolInfo.Symbol is INamedTypeSymbol typeSymbol &&
            typeSymbol.TypeKind is not TypeKind.Error &&
            IsProjectType(typeSymbol))
        {
            var sourceId = FindContainingSymbolId(node);
            if (sourceId is not null)
            {
                var targetQualified = GetQualifiedName(typeSymbol);
                var kind = typeSymbol.TypeKind == TypeKind.Interface ? "interface" : "class";
                TryAddDep(sourceId, targetQualified, kind, "uses_type");
            }
        }
        base.VisitIdentifierName(node);
    }

    /// <summary>
    /// Returns true if the type is defined in the current project (not a framework/NuGet type).
    /// </summary>
    private bool IsProjectType(INamedTypeSymbol? symbol)
    {
        if (symbol is null) return false;

        // Check if the type's assembly matches the project's assembly
        var assemblyName = symbol.ContainingAssembly?.Name;
        if (assemblyName is null) return false;

        // If it's from our project assembly, it's a project type
        if (assemblyName == _projectAssemblyName) return true;

        // Also accept types from assemblies that are part of the solution
        // (the symbol lookup will filter out types we haven't indexed)
        return false;
    }

    private void ExtractBaseTypeDeps(TypeDeclarationSyntax node)
    {
        var symbol = _model.GetDeclaredSymbol(node);
        if (symbol is null || node.BaseList is null) return;

        var sourceQualified = GetQualifiedName(symbol);
        var sourceKind = node is InterfaceDeclarationSyntax ? "interface" : "class";
        var sourceId = SymbolIdGenerator.Generate(_relativePath, sourceQualified, sourceKind);

        if (!_knownSymbolIds.Contains(sourceId)) return;

        foreach (var baseType in node.BaseList.Types)
        {
            var typeInfo = _model.GetTypeInfo(baseType.Type);
            if (typeInfo.Type is not INamedTypeSymbol baseSymbol) continue;

            var targetQualified = GetQualifiedName(baseSymbol);
            var depKind = baseSymbol.TypeKind == TypeKind.Interface ? "implements" : "extends";
            var targetKind = baseSymbol.TypeKind == TypeKind.Interface ? "interface" : "class";

            TryAddDep(sourceId, targetQualified, targetKind, depKind);
        }
    }

    private string? FindContainingSymbolId(SyntaxNode node)
    {
        var current = node.Parent;
        while (current is not null)
        {
            switch (current)
            {
                case MethodDeclarationSyntax method:
                {
                    var sym = _model.GetDeclaredSymbol(method);
                    if (sym is null) return null;
                    var containingName = sym.ContainingType is not null
                        ? $"{GetQualifiedName(sym.ContainingType)}.{sym.Name}"
                        : sym.Name;
                    var id = SymbolIdGenerator.Generate(_relativePath, containingName, "function");
                    return _knownSymbolIds.Contains(id) ? id : null;
                }
                case ConstructorDeclarationSyntax ctor:
                {
                    var sym = _model.GetDeclaredSymbol(ctor);
                    if (sym?.ContainingType is null) return null;
                    var containingName = $"{GetQualifiedName(sym.ContainingType)}..ctor";
                    var id = SymbolIdGenerator.Generate(_relativePath, containingName, "function");
                    return _knownSymbolIds.Contains(id) ? id : null;
                }
                case TypeDeclarationSyntax type:
                {
                    var sym = _model.GetDeclaredSymbol(type);
                    if (sym is null) return null;
                    var qualName = GetQualifiedName(sym);
                    var kind = type is InterfaceDeclarationSyntax ? "interface" : "class";
                    var id = SymbolIdGenerator.Generate(_relativePath, qualName, kind);
                    return _knownSymbolIds.Contains(id) ? id : null;
                }
            }
            current = current.Parent;
        }
        return null;
    }

    private void TryAddDep(string sourceId, string targetQualified, string targetKind, string depKind)
    {
        var targetId = _symbolLookup.GetValueOrDefault((targetQualified, targetKind));
        if (targetId is null || sourceId == targetId) return;

        var key = $"{sourceId}|{targetId}|{depKind}";
        if (!_seen.Add(key)) return;

        _dependencies.Add(new ExtractedDependency
        {
            SourceSymbolId = sourceId,
            TargetSymbolId = targetId,
            Kind = depKind,
        });
    }

    private static string GetQualifiedName(INamedTypeSymbol symbol)
    {
        var parts = new List<string>();
        ISymbol? current = symbol;
        while (current is not null)
        {
            if (current is INamespaceSymbol ns && ns.IsGlobalNamespace)
                break;
            parts.Add(current.Name);
            current = current.ContainingSymbol;
        }
        parts.Reverse();
        return string.Join(".", parts);
    }
}
