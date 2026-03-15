using System.Text.Json.Serialization;

namespace ArcBridge.DotnetIndexer.Models;

public sealed class IndexerOutput
{
    [JsonPropertyName("symbols")]
    public List<ExtractedSymbol> Symbols { get; set; } = [];

    [JsonPropertyName("dependencies")]
    public List<ExtractedDependency> Dependencies { get; set; } = [];

    [JsonPropertyName("routes")]
    public List<RouteInfo> Routes { get; set; } = [];

    [JsonPropertyName("changedFiles")]
    public List<string> ChangedFiles { get; set; } = [];

    [JsonPropertyName("removedFiles")]
    public List<string> RemovedFiles { get; set; } = [];

    [JsonPropertyName("filesProcessed")]
    public int FilesProcessed { get; set; }

    [JsonPropertyName("filesSkipped")]
    public int FilesSkipped { get; set; }

    [JsonPropertyName("durationMs")]
    public long DurationMs { get; set; }
}
