using System.Text.Json.Serialization;

namespace ArcBridge.DotnetIndexer.Models;

public sealed class RouteInfo
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("routePath")]
    public required string RoutePath { get; set; }

    [JsonPropertyName("kind")]
    public string Kind { get; set; } = "api-route";

    [JsonPropertyName("httpMethods")]
    public List<string> HttpMethods { get; set; } = [];

    [JsonPropertyName("hasAuth")]
    public bool HasAuth { get; set; }

    [JsonPropertyName("handlerSymbolId")]
    public string? HandlerSymbolId { get; set; }
}
