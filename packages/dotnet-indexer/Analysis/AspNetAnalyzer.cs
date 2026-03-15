using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;
using ArcBridge.DotnetIndexer.Models;

namespace ArcBridge.DotnetIndexer.Analysis;

/// <summary>
/// Detects ASP.NET Core routes from both controller attributes and minimal API mappings.
/// Controllers: [ApiController], [Route], [HttpGet/Post/Put/Delete/Patch], [Authorize].
/// Minimal APIs: app.MapGet/Post/Put/Delete/Patch(), MapGroup(), .RequireAuthorization().
/// </summary>
public static class AspNetAnalyzer
{
    private static readonly HashSet<string> HttpMethodAttributes = new(StringComparer.OrdinalIgnoreCase)
    {
        "HttpGet", "HttpGetAttribute",
        "HttpPost", "HttpPostAttribute",
        "HttpPut", "HttpPutAttribute",
        "HttpDelete", "HttpDeleteAttribute",
        "HttpPatch", "HttpPatchAttribute",
    };

    private static readonly Dictionary<string, string> AttributeToMethod = new(StringComparer.OrdinalIgnoreCase)
    {
        ["HttpGet"] = "GET", ["HttpGetAttribute"] = "GET",
        ["HttpPost"] = "POST", ["HttpPostAttribute"] = "POST",
        ["HttpPut"] = "PUT", ["HttpPutAttribute"] = "PUT",
        ["HttpDelete"] = "DELETE", ["HttpDeleteAttribute"] = "DELETE",
        ["HttpPatch"] = "PATCH", ["HttpPatchAttribute"] = "PATCH",
    };

    /// <summary>
    /// Map method names to HTTP verbs for minimal API detection.
    /// </summary>
    private static readonly Dictionary<string, string> MapMethodToVerb = new(StringComparer.Ordinal)
    {
        ["MapGet"] = "GET",
        ["MapPost"] = "POST",
        ["MapPut"] = "PUT",
        ["MapDelete"] = "DELETE",
        ["MapPatch"] = "PATCH",
    };

    public static List<RouteInfo> AnalyzeRoutes(
        SemanticModel model,
        SyntaxTree tree,
        string relativePath)
    {
        var routes = new List<RouteInfo>();
        var root = tree.GetRoot();

        // 1. Controller-based routes
        AnalyzeControllerRoutes(model, root, relativePath, routes);

        // 2. Minimal API routes
        AnalyzeMinimalApiRoutes(model, root, relativePath, routes);

        return routes;
    }

    #region Controller-based routing

    private static void AnalyzeControllerRoutes(
        SemanticModel model,
        SyntaxNode root,
        string relativePath,
        List<RouteInfo> routes)
    {
        foreach (var classNode in root.DescendantNodes().OfType<ClassDeclarationSyntax>())
        {
            if (!IsController(classNode, model)) continue;

            if (model.GetDeclaredSymbol(classNode) is not INamedTypeSymbol classSymbol) continue;

            var classRoute = GetRoutePrefix(classNode, classSymbol);
            var classHasAuth = HasAuthorizeAttribute(classNode);

            foreach (var method in classNode.Members.OfType<MethodDeclarationSyntax>())
            {
                var methodSymbol = model.GetDeclaredSymbol(method);
                if (methodSymbol is null) continue;
                if (methodSymbol.DeclaredAccessibility is not Accessibility.Public) continue;

                var httpMethods = GetHttpMethods(method);
                if (httpMethods.Count == 0) continue;

                var methodRoute = GetMethodRoute(method);
                // Expand [action] placeholder if present
                if (methodRoute?.Contains("[action]") == true)
                    methodRoute = methodRoute.Replace("[action]", methodSymbol.Name.ToLowerInvariant());
                var fullRoute = CombineRoutes(classRoute, methodRoute);
                var hasAuth = classHasAuth || HasAuthorizeAttribute(method);

                var qualifiedName = $"{GetQualifiedName((INamedTypeSymbol)classSymbol)}.{methodSymbol.Name}";
                var handlerSymbolId = SymbolIdGenerator.Generate(relativePath, qualifiedName, "function");

                foreach (var httpMethod in httpMethods)
                {
                    var routeId = $"route::{fullRoute}::{httpMethod}";
                    routes.Add(new RouteInfo
                    {
                        Id = routeId,
                        RoutePath = fullRoute,
                        Kind = "api-route",
                        HttpMethods = [httpMethod],
                        HasAuth = hasAuth,
                        HandlerSymbolId = handlerSymbolId,
                    });
                }
            }
        }
    }

    #endregion

    #region Minimal API routing

    /// <summary>
    /// Detects minimal API routes: app.MapGet(), app.MapPost(), MapGroup(), etc.
    /// Handles route group prefixes and .RequireAuthorization() chains.
    /// </summary>
    private static void AnalyzeMinimalApiRoutes(
        SemanticModel model,
        SyntaxNode root,
        string relativePath,
        List<RouteInfo> routes)
    {
        // First, build a map of variable → group prefix for MapGroup calls
        // e.g. var ordersGroup = app.MapGroup("/api/orders") → ordersGroup = "/api/orders"
        var groupPrefixes = new Dictionary<string, string>();
        CollectGroupPrefixes(root, groupPrefixes);

        // Then scan all invocations for MapGet/Post/Put/Delete/Patch
        foreach (var invocation in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            if (!TryGetMapMethodInfo(invocation, out var methodName, out var receiverName))
                continue;

            if (!MapMethodToVerb.TryGetValue(methodName!, out var httpVerb))
                continue;

            // Extract route path from first argument
            var args = invocation.ArgumentList.Arguments;
            if (args.Count < 2) continue;

            var routePath = GetStringLiteral(args[0].Expression);
            if (routePath is null) continue;

            // Resolve group prefix if the receiver is a known group variable
            var prefix = receiverName is not null && groupPrefixes.TryGetValue(receiverName, out var gp) ? gp : "";
            var fullRoute = CombineRoutes(prefix, routePath);
            if (fullRoute == "/") fullRoute = prefix.Length > 0 ? $"/{prefix.TrimStart('/').TrimEnd('/')}" : "/";

            // Check for .RequireAuthorization() in the invocation chain
            var hasAuth = HasRequireAuthorizationChain(invocation);

            // Also inherit auth from group if the group has RequireAuthorization
            if (!hasAuth && receiverName is not null)
                hasAuth = GroupHasAuth(root, receiverName);

            // Try to resolve handler symbol from second argument
            string? handlerSymbolId = null;
            var handlerArg = args[1].Expression;
            var handlerSymbol = model.GetSymbolInfo(handlerArg).Symbol;
            if (handlerSymbol is IMethodSymbol handlerMethod)
            {
                var containingType = handlerMethod.ContainingType;
                var qualifiedName = containingType is not null
                    ? $"{GetQualifiedName(containingType)}.{handlerMethod.Name}"
                    : handlerMethod.Name;
                handlerSymbolId = SymbolIdGenerator.Generate(relativePath, qualifiedName, "function");
            }

            var routeId = $"route::{fullRoute}::{httpVerb}";
            routes.Add(new RouteInfo
            {
                Id = routeId,
                RoutePath = fullRoute,
                Kind = "api-route",
                HttpMethods = [httpVerb],
                HasAuth = hasAuth,
                HandlerSymbolId = handlerSymbolId,
            });
        }
    }

    /// <summary>
    /// Collect MapGroup variable assignments to resolve route prefixes.
    /// Handles: var g = app.MapGroup("/prefix");
    /// Also handles chained groups: var sub = g.MapGroup("/sub");
    /// </summary>
    private static void CollectGroupPrefixes(SyntaxNode root, Dictionary<string, string> prefixes)
    {
        foreach (var invocation in root.DescendantNodes().OfType<InvocationExpressionSyntax>())
        {
            if (!TryGetMapMethodInfo(invocation, out var methodName, out var receiverName))
                continue;

            if (methodName != "MapGroup") continue;

            var args = invocation.ArgumentList.Arguments;
            if (args.Count < 1) continue;

            var groupPath = GetStringLiteral(args[0].Expression);
            if (groupPath is null) continue;

            // Resolve parent group prefix
            var parentPrefix = receiverName is not null && prefixes.TryGetValue(receiverName, out var pp) ? pp : "";
            var fullPrefix = CombineRoutes(parentPrefix, groupPath);

            // Find the variable this is assigned to
            var varName = GetAssignedVariableName(invocation);
            if (varName is not null)
            {
                prefixes[varName] = fullPrefix;
            }
        }
    }

    /// <summary>
    /// Extract method name and receiver variable name from an invocation like app.MapGet(...).
    /// Also handles chained calls like app.MapGet(...).RequireAuthorization() by unwinding to the
    /// innermost Map* call.
    /// </summary>
    private static bool TryGetMapMethodInfo(
        InvocationExpressionSyntax invocation,
        out string? methodName,
        out string? receiverName)
    {
        methodName = null;
        receiverName = null;

        if (invocation.Expression is not MemberAccessExpressionSyntax memberAccess)
            return false;

        methodName = memberAccess.Name.Identifier.Text;

        // Get receiver (the thing before the dot)
        switch (memberAccess.Expression)
        {
            case IdentifierNameSyntax id:
                receiverName = id.Identifier.Text;
                return true;
            case InvocationExpressionSyntax chainedInvocation:
                // Could be a chained call like app.MapGroup("/prefix").MapGet(...)
                // or group.MapGet(...).RequireAuthorization()
                // Unwrap one level
                if (chainedInvocation.Expression is MemberAccessExpressionSyntax chainedMember)
                {
                    if (chainedMember.Expression is IdentifierNameSyntax chainedId)
                        receiverName = chainedId.Identifier.Text;
                }
                return true;
            default:
                return true;
        }
    }

    /// <summary>
    /// Check if an invocation has .RequireAuthorization() anywhere in its fluent chain.
    /// e.g. app.MapPost("/x", handler).RequireAuthorization()
    /// </summary>
    private static bool HasRequireAuthorizationChain(InvocationExpressionSyntax invocation)
    {
        // Walk up the syntax tree to find chained method calls
        SyntaxNode? current = invocation.Parent;
        while (current is not null)
        {
            if (current is MemberAccessExpressionSyntax memberAccess &&
                memberAccess.Name.Identifier.Text == "RequireAuthorization")
                return true;

            // Stop walking when we leave the expression statement
            if (current is ExpressionStatementSyntax or LocalDeclarationStatementSyntax)
                break;

            current = current.Parent;
        }

        return false;
    }

    /// <summary>
    /// Check if a MapGroup variable has .RequireAuthorization() in its declaration chain.
    /// </summary>
    private static bool GroupHasAuth(SyntaxNode root, string variableName)
    {
        foreach (var declarator in root.DescendantNodes().OfType<VariableDeclaratorSyntax>())
        {
            if (declarator.Identifier.Text != variableName) continue;

            // Check if the initializer chain contains RequireAuthorization
            var initializer = declarator.Initializer?.Value;
            if (initializer is null) continue;

            foreach (var inv in initializer.DescendantNodesAndSelf().OfType<InvocationExpressionSyntax>())
            {
                if (inv.Expression is MemberAccessExpressionSyntax ma &&
                    ma.Name.Identifier.Text == "RequireAuthorization")
                    return true;
            }
        }

        return false;
    }

    /// <summary>
    /// Find the variable name an invocation result is assigned to.
    /// e.g. var group = app.MapGroup("/api") → returns "group"
    /// </summary>
    private static string? GetAssignedVariableName(InvocationExpressionSyntax invocation)
    {
        // Walk up to find the variable declarator
        // Pattern: var x = expr.MapGroup(...) or var x = expr.MapGroup(...).RequireAuthorization()
        SyntaxNode? current = invocation;
        while (current is not null)
        {
            if (current is VariableDeclaratorSyntax declarator)
                return declarator.Identifier.Text;

            if (current is LocalDeclarationStatementSyntax or GlobalStatementSyntax)
                break;

            current = current.Parent;
        }

        // Check if it's an assignment: x = expr.MapGroup(...)
        current = invocation;
        while (current is not null)
        {
            if (current is AssignmentExpressionSyntax assignment &&
                assignment.Left is IdentifierNameSyntax id)
                return id.Identifier.Text;

            if (current is ExpressionStatementSyntax)
                break;

            current = current.Parent;
        }

        return null;
    }

    #endregion

    private static bool IsController(ClassDeclarationSyntax node, SemanticModel model)
    {
        // Check for [ApiController] attribute
        if (node.AttributeLists.SelectMany(al => al.Attributes)
            .Any(a => GetAttributeName(a) is "ApiController" or "ApiControllerAttribute"))
            return true;

        // Check if inherits from ControllerBase or Controller
        var baseType = (model.GetDeclaredSymbol(node) as INamedTypeSymbol)?.BaseType;
        while (baseType is not null)
        {
            var name = baseType.Name;
            if (name is "ControllerBase" or "Controller")
                return true;
            baseType = baseType.BaseType;
        }

        return false;
    }

    private static string GetRoutePrefix(ClassDeclarationSyntax node, INamedTypeSymbol symbol)
    {
        var routeAttr = node.AttributeLists
            .SelectMany(al => al.Attributes)
            .FirstOrDefault(a => GetAttributeName(a) is "Route" or "RouteAttribute");

        if (routeAttr?.ArgumentList?.Arguments.Count > 0)
        {
            var template = GetStringLiteral(routeAttr.ArgumentList.Arguments[0].Expression);
            if (template is not null)
            {
                // Replace [controller] placeholder with actual controller name
                var controllerName = symbol.Name;
                if (controllerName.EndsWith("Controller"))
                    controllerName = controllerName[..^"Controller".Length];

                return template
                    .Replace("[controller]", controllerName.ToLowerInvariant())
                    .Replace("[Controller]", controllerName.ToLowerInvariant());
            }
        }

        // Convention-based: /api/{ControllerName}
        var name = symbol.Name;
        if (name.EndsWith("Controller"))
            name = name[..^"Controller".Length];
        return $"api/{name.ToLowerInvariant()}";
    }

    private static List<string> GetHttpMethods(MethodDeclarationSyntax method)
    {
        var methods = new List<string>();
        foreach (var attr in method.AttributeLists.SelectMany(al => al.Attributes))
        {
            var name = GetAttributeName(attr);
            if (name is not null && AttributeToMethod.TryGetValue(name, out var httpMethod))
            {
                methods.Add(httpMethod);
            }
        }
        return methods;
    }

    private static string? GetMethodRoute(MethodDeclarationSyntax method)
    {
        foreach (var attr in method.AttributeLists.SelectMany(al => al.Attributes))
        {
            var name = GetAttributeName(attr);
            if (name is not null && HttpMethodAttributes.Contains(name) &&
                attr.ArgumentList?.Arguments.Count > 0)
            {
                return GetStringLiteral(attr.ArgumentList.Arguments[0].Expression);
            }
        }
        return null;
    }

    private static string CombineRoutes(string prefix, string? suffix)
    {
        prefix = prefix.TrimStart('/').TrimEnd('/');
        if (string.IsNullOrEmpty(suffix))
            return $"/{prefix}";

        suffix = suffix.TrimStart('/').TrimEnd('/');
        return $"/{prefix}/{suffix}";
    }

    private static bool HasAuthorizeAttribute(MemberDeclarationSyntax node)
    {
        return node.AttributeLists
            .SelectMany(al => al.Attributes)
            .Any(a => GetAttributeName(a) is "Authorize" or "AuthorizeAttribute");
    }

    private static string? GetAttributeName(AttributeSyntax attr)
    {
        return attr.Name switch
        {
            IdentifierNameSyntax id => id.Identifier.Text,
            QualifiedNameSyntax q => q.Right.Identifier.Text,
            _ => null,
        };
    }

    private static string? GetStringLiteral(ExpressionSyntax expr)
    {
        return expr switch
        {
            LiteralExpressionSyntax literal => literal.Token.ValueText,
            _ => null,
        };
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
