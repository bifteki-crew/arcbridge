using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ArcBridge.DotnetIndexer.Models;

namespace ArcBridge.DotnetIndexer.Analysis;

/// <summary>
/// Walks C# syntax trees to extract symbols (classes, interfaces, methods, etc.)
/// and maps them to ArcBridge's symbol kinds.
/// </summary>
public sealed class SymbolExtractor : CSharpSyntaxWalker
{
    private readonly SemanticModel _model;
    private readonly string _relativePath;
    private readonly string _contentHash;
    private readonly string? _projectName;
    private readonly List<ExtractedSymbol> _symbols = [];

    public SymbolExtractor(SemanticModel model, string relativePath, string contentHash, string? projectName = null)
    {
        _model = model;
        _relativePath = relativePath;
        _contentHash = contentHash;
        _projectName = projectName;
    }

    public IReadOnlyList<ExtractedSymbol> Symbols => _symbols;

    public override void VisitClassDeclaration(ClassDeclarationSyntax node)
    {
        AddTypeSymbol(node, node.Identifier, "class");
        base.VisitClassDeclaration(node);
    }

    public override void VisitRecordDeclaration(RecordDeclarationSyntax node)
    {
        AddTypeSymbol(node, node.Identifier, "class");
        base.VisitRecordDeclaration(node);
    }

    public override void VisitStructDeclaration(StructDeclarationSyntax node)
    {
        AddTypeSymbol(node, node.Identifier, "class");
        base.VisitStructDeclaration(node);
    }

    public override void VisitInterfaceDeclaration(InterfaceDeclarationSyntax node)
    {
        AddTypeSymbol(node, node.Identifier, "interface");
        base.VisitInterfaceDeclaration(node);
    }

    public override void VisitEnumDeclaration(EnumDeclarationSyntax node)
    {
        var symbol = _model.GetDeclaredSymbol(node);
        if (symbol is null) { base.VisitEnumDeclaration(node); return; }

        var qualifiedName = GetQualifiedName(symbol);
        var lineSpan = node.SyntaxTree.GetLineSpan(node.Span);

        _symbols.Add(new ExtractedSymbol
        {
            Id = SymbolIdGenerator.Generate(_relativePath, qualifiedName, "enum"),
            Name = symbol.Name,
            QualifiedName = qualifiedName,
            Kind = "enum",
            FilePath = _relativePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            StartCol = lineSpan.StartLinePosition.Character + 1,
            EndCol = lineSpan.EndLinePosition.Character + 1,
            Signature = $"enum {symbol.Name}",
            ReturnType = null,
            DocComment = GetDocComment(symbol),
            IsExported = IsAccessible(symbol),
            IsAsync = false,
            ContentHash = _contentHash,
            ProjectName = _projectName,
        });
        base.VisitEnumDeclaration(node);
    }

    public override void VisitDelegateDeclaration(DelegateDeclarationSyntax node)
    {
        var symbol = _model.GetDeclaredSymbol(node);
        if (symbol is null) return;

        var qualifiedName = GetQualifiedName(symbol);
        var lineSpan = node.SyntaxTree.GetLineSpan(node.Span);

        _symbols.Add(new ExtractedSymbol
        {
            Id = SymbolIdGenerator.Generate(_relativePath, qualifiedName, "type"),
            Name = symbol.Name,
            QualifiedName = qualifiedName,
            Kind = "type",
            FilePath = _relativePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            StartCol = lineSpan.StartLinePosition.Character + 1,
            EndCol = lineSpan.EndLinePosition.Character + 1,
            Signature = node.ToString().Split('\n')[0].Trim(),
            ReturnType = symbol.DelegateInvokeMethod?.ReturnType.ToDisplayString(),
            DocComment = GetDocComment(symbol),
            IsExported = IsAccessible(symbol),
            IsAsync = false,
            ContentHash = _contentHash,
            ProjectName = _projectName,
        });
    }

    public override void VisitMethodDeclaration(MethodDeclarationSyntax node)
    {
        var symbol = _model.GetDeclaredSymbol(node);
        if (symbol is null) return;

        var containingName = symbol.ContainingType?.Name;
        var qualifiedName = containingName is not null
            ? $"{GetQualifiedName(symbol.ContainingType!)}.{symbol.Name}"
            : symbol.Name;
        var lineSpan = node.SyntaxTree.GetLineSpan(node.Span);

        var paramList = string.Join(", ",
            symbol.Parameters.Select(p => $"{p.Type.ToDisplayString()} {p.Name}"));
        var generics = symbol.TypeParameters.Length > 0
            ? $"<{string.Join(", ", symbol.TypeParameters.Select(tp => tp.Name))}>"
            : "";
        var signature = $"{symbol.ReturnType.ToDisplayString()} {symbol.Name}{generics}({paramList})";

        _symbols.Add(new ExtractedSymbol
        {
            Id = SymbolIdGenerator.Generate(_relativePath, qualifiedName, "function"),
            Name = symbol.Name,
            QualifiedName = qualifiedName,
            Kind = "function",
            FilePath = _relativePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            StartCol = lineSpan.StartLinePosition.Character + 1,
            EndCol = lineSpan.EndLinePosition.Character + 1,
            Signature = signature,
            ReturnType = symbol.ReturnType.ToDisplayString(),
            DocComment = GetDocComment(symbol),
            IsExported = IsAccessible(symbol),
            IsAsync = symbol.IsAsync,
            ContentHash = _contentHash,
            ProjectName = _projectName,
        });
    }

    public override void VisitConstructorDeclaration(ConstructorDeclarationSyntax node)
    {
        var symbol = _model.GetDeclaredSymbol(node);
        if (symbol is null) return;

        var containingName = GetQualifiedName(symbol.ContainingType!);
        var qualifiedName = $"{containingName}..ctor";
        var lineSpan = node.SyntaxTree.GetLineSpan(node.Span);

        var paramList = string.Join(", ",
            symbol.Parameters.Select(p => $"{p.Type.ToDisplayString()} {p.Name}"));
        var signature = $"{symbol.ContainingType!.Name}({paramList})";

        _symbols.Add(new ExtractedSymbol
        {
            Id = SymbolIdGenerator.Generate(_relativePath, qualifiedName, "function"),
            Name = ".ctor",
            QualifiedName = qualifiedName,
            Kind = "function",
            FilePath = _relativePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            StartCol = lineSpan.StartLinePosition.Character + 1,
            EndCol = lineSpan.EndLinePosition.Character + 1,
            Signature = signature,
            ReturnType = null,
            DocComment = GetDocComment(symbol),
            IsExported = IsAccessible(symbol),
            IsAsync = false,
            ContentHash = _contentHash,
            ProjectName = _projectName,
        });
    }

    public override void VisitPropertyDeclaration(PropertyDeclarationSyntax node)
    {
        var symbol = _model.GetDeclaredSymbol(node);
        if (symbol is null) return;

        var containingName = GetQualifiedName(symbol.ContainingType!);
        var qualifiedName = $"{containingName}.{symbol.Name}";
        var lineSpan = node.SyntaxTree.GetLineSpan(node.Span);

        _symbols.Add(new ExtractedSymbol
        {
            Id = SymbolIdGenerator.Generate(_relativePath, qualifiedName, "variable"),
            Name = symbol.Name,
            QualifiedName = qualifiedName,
            Kind = "variable",
            FilePath = _relativePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            StartCol = lineSpan.StartLinePosition.Character + 1,
            EndCol = lineSpan.EndLinePosition.Character + 1,
            Signature = $"{symbol.Type.ToDisplayString()} {symbol.Name} {{ {GetAccessorSummary(node)} }}",
            ReturnType = symbol.Type.ToDisplayString(),
            DocComment = GetDocComment(symbol),
            IsExported = IsAccessible(symbol),
            IsAsync = false,
            ContentHash = _contentHash,
            ProjectName = _projectName,
        });
    }

    public override void VisitFieldDeclaration(FieldDeclarationSyntax node)
    {
        foreach (var variable in node.Declaration.Variables)
        {
            var symbol = _model.GetDeclaredSymbol(variable) as IFieldSymbol;
            if (symbol is null) continue;

            var containingName = GetQualifiedName(symbol.ContainingType!);
            var qualifiedName = $"{containingName}.{symbol.Name}";
            var lineSpan = node.SyntaxTree.GetLineSpan(variable.Span);

            var kind = symbol.IsConst ? "constant" : "variable";

            _symbols.Add(new ExtractedSymbol
            {
                Id = SymbolIdGenerator.Generate(_relativePath, qualifiedName, kind),
                Name = symbol.Name,
                QualifiedName = qualifiedName,
                Kind = kind,
                FilePath = _relativePath,
                StartLine = lineSpan.StartLinePosition.Line + 1,
                EndLine = lineSpan.EndLinePosition.Line + 1,
                StartCol = lineSpan.StartLinePosition.Character + 1,
                EndCol = lineSpan.EndLinePosition.Character + 1,
                Signature = $"{symbol.Type.ToDisplayString()} {symbol.Name}",
                ReturnType = symbol.Type.ToDisplayString(),
                DocComment = GetDocComment(symbol),
                IsExported = IsAccessible(symbol),
                IsAsync = false,
                ContentHash = _contentHash,
            });
        }
    }

    private void AddTypeSymbol(TypeDeclarationSyntax node, SyntaxToken identifier, string kind)
    {
        var symbol = _model.GetDeclaredSymbol(node);
        if (symbol is null) return;

        var qualifiedName = GetQualifiedName(symbol);
        var lineSpan = node.SyntaxTree.GetLineSpan(node.Span);

        // Build signature from declaration (first line)
        var firstLine = node.ToString().Split('\n')[0].Trim();

        _symbols.Add(new ExtractedSymbol
        {
            Id = SymbolIdGenerator.Generate(_relativePath, qualifiedName, kind),
            Name = symbol.Name,
            QualifiedName = qualifiedName,
            Kind = kind,
            FilePath = _relativePath,
            StartLine = lineSpan.StartLinePosition.Line + 1,
            EndLine = lineSpan.EndLinePosition.Line + 1,
            StartCol = lineSpan.StartLinePosition.Character + 1,
            EndCol = lineSpan.EndLinePosition.Character + 1,
            Signature = firstLine,
            ReturnType = null,
            DocComment = GetDocComment(symbol),
            IsExported = IsAccessible(symbol),
            IsAsync = false,
            ContentHash = _contentHash,
            ProjectName = _projectName,
        });
    }

    private static string GetQualifiedName(ISymbol symbol)
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

    private static bool IsAccessible(ISymbol symbol)
    {
        return symbol.DeclaredAccessibility is
            Accessibility.Public or Accessibility.Internal or Accessibility.ProtectedOrInternal;
    }

    private static string? GetDocComment(ISymbol symbol)
    {
        var xml = symbol.GetDocumentationCommentXml();
        if (string.IsNullOrWhiteSpace(xml)) return null;

        // Extract summary text from XML doc comment
        try
        {
            var doc = System.Xml.Linq.XDocument.Parse(xml);
            var summary = doc.Descendants("summary").FirstOrDefault()?.Value?.Trim();
            return string.IsNullOrWhiteSpace(summary) ? null : summary;
        }
        catch
        {
            return null;
        }
    }

    private static string GetAccessorSummary(PropertyDeclarationSyntax node)
    {
        if (node.AccessorList is null)
            return node.ExpressionBody is not null ? "get;" : "";

        var accessors = node.AccessorList.Accessors
            .Select(a => a.Keyword.Text + ";")
            .ToArray();
        return string.Join(" ", accessors);
    }
}
