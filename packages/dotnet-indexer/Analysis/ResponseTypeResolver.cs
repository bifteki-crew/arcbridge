using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace ArcBridge.DotnetIndexer.Analysis;

/// <summary>
/// Resolves the DTO an endpoint actually returns, for field-level contract checks.
///
/// Emits the type with SIMPLE names ("Task&lt;ActionResult&lt;UserDto&gt;&gt;") rather than
/// a pre-unwrapped name. The TypeScript side already owns the unwrap table
/// (contracts/types.ts unwrapToTypeName peels Task/ActionResult/List/arrays/…),
/// so handing it the shaped type keeps the Roslyn and tree-sitter backends
/// consistent by construction instead of by two tables kept in sync by hand.
///
/// Where this beats the tree-sitter backend, using semantics it cannot reach:
///  - `public IActionResult Get() => Ok(new UserDto())` — the *declared* type is
///    opaque, so tree-sitter yields nothing; the semantic model sees the body.
///  - `MapGet("/users", GetUsers)` method-group handlers, including a handler
///    declared in another file: the symbol resolves and its syntax is reachable.
/// </summary>
public static class ResponseTypeResolver
{
    /// <summary>Simple type names, generics preserved — e.g. Task&lt;ActionResult&lt;UserDto&gt;&gt;.</summary>
    private static readonly SymbolDisplayFormat NameOnly = new(
        globalNamespaceStyle: SymbolDisplayGlobalNamespaceStyle.Omitted,
        typeQualificationStyle: SymbolDisplayTypeQualificationStyle.NameOnly,
        genericsOptions: SymbolDisplayGenericsOptions.IncludeTypeParameters,
        miscellaneousOptions: SymbolDisplayMiscellaneousOptions.UseSpecialTypes);

    /// <summary>
    /// Response type for a handler method. Prefers the declared signature; falls
    /// back to what the body returns when the signature carries no DTO.
    /// </summary>
    public static string? ForMethod(IMethodSymbol method, Compilation compilation)
    {
        if (DescribesDto(method.ReturnType)) return Format(method.ReturnType);

        // Declared type is opaque (IActionResult, Task<IResult>, object…). Find
        // the method body — possibly in another file — and read the returns.
        foreach (var reference in method.DeclaringSyntaxReferences)
        {
            var node = reference.GetSyntax();
            if (node is not MethodDeclarationSyntax declaration) continue;

            var model = SemanticModelFor(reference.SyntaxTree, compilation);
            if (model is null) continue;

            var body = (SyntaxNode?)declaration.Body ?? declaration.ExpressionBody?.Expression;
            var inferred = InferFromBody(body, model);
            if (inferred is not null) return Format(inferred);
        }

        return null;
    }

    /// <summary>
    /// Response type for a minimal-API lambda handler:
    /// <c>MapGet("/users", () =&gt; Results.Ok(new UserDto()))</c>. An explicit
    /// return type on the lambda wins; otherwise the body is inspected.
    /// </summary>
    public static string? ForLambda(AnonymousFunctionExpressionSyntax lambda, SemanticModel model)
    {
        // An explicitly typed lambda — (): UserDto => … isn't C#, but
        // `static UserDto () => …` and delegate-typed lambdas surface here.
        if (model.GetSymbolInfo(lambda).Symbol is IMethodSymbol lambdaSymbol &&
            DescribesDto(lambdaSymbol.ReturnType))
        {
            return Format(lambdaSymbol.ReturnType);
        }

        var body = (SyntaxNode?)lambda.Block ?? lambda.ExpressionBody;
        var inferred = InferFromBody(body, model);
        return inferred is not null ? Format(inferred) : null;
    }

    /// <summary>
    /// The DTO a body returns, or null when it can't be determined or the returns
    /// disagree. Ambiguity yields null deliberately: the drift detector's rule is
    /// to stay silent rather than guess, and a wrong DTO would produce confidently
    /// wrong field mismatches — worse than no check at all.
    /// </summary>
    private static ITypeSymbol? InferFromBody(SyntaxNode? body, SemanticModel model)
    {
        if (body is null) return null;

        var returned = new List<ExpressionSyntax>();

        if (body is ExpressionSyntax expressionBody)
        {
            returned.Add(expressionBody);
        }
        else
        {
            foreach (var statement in body.DescendantNodes().OfType<ReturnStatementSyntax>())
            {
                // Skip returns inside nested lambdas/local functions — those belong
                // to the inner callable, not to this endpoint.
                if (BelongsToNestedFunction(statement, body)) continue;
                if (statement.Expression is not null) returned.Add(statement.Expression);
            }
        }

        var candidates = new List<ITypeSymbol>();
        foreach (var expression in returned)
        {
            var dto = ResolveDto(expression, model, out var ambiguous);
            // A single return can disagree with itself — `flag ? Ok(a) : Ok(b)` —
            // which is no less ambiguous than two separate return statements.
            if (ambiguous) return null;
            if (dto is not null) candidates.Add(dto);
        }

        if (candidates.Count == 0) return null;

        var first = candidates[0];
        foreach (var candidate in candidates)
        {
            if (!SymbolEqualityComparer.Default.Equals(candidate, first)) return null;
        }
        return first;
    }

    /// <summary>
    /// The DTO a single returned expression yields. The expression's own type is
    /// preferred; failing that — `Ok(dto)`, `Results.Ok(dto)` and
    /// `CreatedAtAction(nameof(Get), new { id }, dto)` all have a framework type —
    /// the search widens one nesting level at a time.
    ///
    /// Level order matters, and taking the first match in document order does not
    /// work. In `Ok(order.Customer)` both `order.Customer` and `order` are DTOs,
    /// but the shallower one is the payload; whereas in
    /// `flag ? Ok(a) : Ok(b)` the two DTOs sit at the SAME level and genuinely
    /// disagree. Searching level by level distinguishes those: one distinct type
    /// at the shallowest level that has any is the answer, more than one is
    /// ambiguous.
    /// </summary>
    private static ITypeSymbol? ResolveDto(ExpressionSyntax expression, SemanticModel model, out bool ambiguous)
    {
        ambiguous = false;

        var ownType = model.GetTypeInfo(expression).Type;
        if (ownType is not null && DescribesDto(ownType)) return ownType;

        var level = new List<SyntaxNode> { expression };
        while (level.Count > 0)
        {
            var next = new List<SyntaxNode>();
            var found = new List<ITypeSymbol>();

            foreach (var node in level)
            {
                foreach (var child in node.ChildNodes())
                {
                    if (child is ExpressionSyntax childExpression)
                    {
                        var type = model.GetTypeInfo(childExpression).Type;
                        if (type is not null && DescribesDto(type))
                        {
                            if (!found.Any(f => SymbolEqualityComparer.Default.Equals(f, type)))
                                found.Add(type);
                            // Don't descend past a match: nested types belong to it.
                            continue;
                        }
                    }
                    next.Add(child);
                }
            }

            if (found.Count == 1) return found[0];
            if (found.Count > 1)
            {
                ambiguous = true;
                return null;
            }

            level = next;
        }

        return null;
    }

    private static bool BelongsToNestedFunction(SyntaxNode statement, SyntaxNode body)
    {
        for (var current = statement.Parent; current is not null && current != body; current = current.Parent)
        {
            if (current is AnonymousFunctionExpressionSyntax or LocalFunctionStatementSyntax) return true;
        }
        return false;
    }

    private static SemanticModel? SemanticModelFor(SyntaxTree tree, Compilation compilation)
    {
        // A handler can live in a tree outside the one being analyzed; only trees
        // belonging to this compilation can produce a model.
        return compilation.SyntaxTrees.Contains(tree) ? compilation.GetSemanticModel(tree) : null;
    }

    /// <summary>
    /// Whether a type carries application shape worth diffing — directly or as a
    /// type argument / array element, so Task&lt;ActionResult&lt;UserDto&gt;&gt; qualifies.
    /// Framework and primitive types don't: they'd unwrap to nothing useful, and
    /// treating them as a payload would produce noise.
    /// </summary>
    private static bool DescribesDto(ITypeSymbol type)
    {
        if (type is IArrayTypeSymbol array) return DescribesDto(array.ElementType);

        if (IsDtoLike(type)) return true;

        if (type is INamedTypeSymbol named)
        {
            foreach (var argument in named.TypeArguments)
            {
                if (DescribesDto(argument)) return true;
            }
        }

        return false;
    }

    private static bool IsDtoLike(ITypeSymbol type)
    {
        // string/int/bool/object/void and friends carry no shape.
        if (type.SpecialType != SpecialType.None) return false;
        if (type.TypeKind is not (TypeKind.Class or TypeKind.Struct or TypeKind.Interface or TypeKind.Enum))
            return false;

        // Anonymous types and tuples are Roslyn classes/structs in NO namespace, so
        // the namespace filter below lets them through. `CreatedAtAction(nameof(Get),
        // new { id }, dto)` — the standard ASP.NET create — puts an anonymous
        // route-value object ahead of the payload, and it was being reported as the
        // response type ("<anonymous type: int id>"). They are call-site plumbing,
        // never a named contract a frontend can be checked against.
        if (type is INamedTypeSymbol { IsAnonymousType: true } or INamedTypeSymbol { IsTupleType: true })
            return false;

        // Namespace-based rather than source-based on purpose: a DTO shared through
        // a referenced contracts assembly is metadata, not source, but is exactly
        // the type we most want to diff.
        var ns = type.ContainingNamespace?.ToDisplayString() ?? "";
        if (ns == "System" || ns.StartsWith("System.", StringComparison.Ordinal)) return false;
        if (ns == "Microsoft" || ns.StartsWith("Microsoft.", StringComparison.Ordinal)) return false;

        return true;
    }

    private static string Format(ITypeSymbol type) => type.ToDisplayString(NameOnly);
}
