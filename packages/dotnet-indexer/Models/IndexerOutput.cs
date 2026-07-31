using System.Text.Json.Serialization;

namespace ArcBridge.DotnetIndexer.Models;

public sealed class IndexerOutput
{
    /// <summary>
    /// Features this build emits, so the TypeScript side can tell "the project
    /// genuinely has none of these" from "the installed tool is too old to
    /// produce them". Without it, an outdated global tool degrades silently —
    /// the npm package upgrades independently of this .NET tool.
    /// Add a name here when a new extraction capability ships.
    /// </summary>
    [JsonPropertyName("capabilities")]
    public List<string> Capabilities { get; set; } = ["responseType"];

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
