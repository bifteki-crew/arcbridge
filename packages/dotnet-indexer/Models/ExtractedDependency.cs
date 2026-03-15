using System.Text.Json.Serialization;

namespace ArcBridge.DotnetIndexer.Models;

public sealed class ExtractedDependency
{
    [JsonPropertyName("sourceSymbolId")]
    public required string SourceSymbolId { get; set; }

    [JsonPropertyName("targetSymbolId")]
    public required string TargetSymbolId { get; set; }

    [JsonPropertyName("kind")]
    public required string Kind { get; set; }
}
