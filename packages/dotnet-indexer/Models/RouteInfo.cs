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

    /// <summary>
    /// The response DTO, with simple names and generics intact
    /// ("Task&lt;ActionResult&lt;UserDto&gt;&gt;"). The TypeScript side unwraps it — see
    /// ResponseTypeResolver for why the shaping is left there. Null when no DTO
    /// could be determined, which makes field-level contract checks stay silent
    /// for that route rather than guess.
    /// </summary>
    [JsonPropertyName("responseType")]
    public string? ResponseType { get; set; }
}
