using System.Text.Json.Serialization;

namespace ArcBridge.DotnetIndexer.Models;

public sealed class ExtractedSymbol
{
    [JsonPropertyName("id")]
    public required string Id { get; set; }

    [JsonPropertyName("name")]
    public required string Name { get; set; }

    [JsonPropertyName("qualifiedName")]
    public required string QualifiedName { get; set; }

    [JsonPropertyName("kind")]
    public required string Kind { get; set; }

    [JsonPropertyName("filePath")]
    public required string FilePath { get; set; }

    [JsonPropertyName("startLine")]
    public int StartLine { get; set; }

    [JsonPropertyName("endLine")]
    public int EndLine { get; set; }

    [JsonPropertyName("startCol")]
    public int StartCol { get; set; }

    [JsonPropertyName("endCol")]
    public int EndCol { get; set; }

    [JsonPropertyName("signature")]
    public string? Signature { get; set; }

    [JsonPropertyName("returnType")]
    public string? ReturnType { get; set; }

    [JsonPropertyName("docComment")]
    public string? DocComment { get; set; }

    [JsonPropertyName("isExported")]
    public bool IsExported { get; set; }

    [JsonPropertyName("isAsync")]
    public bool IsAsync { get; set; }

    [JsonPropertyName("contentHash")]
    public required string ContentHash { get; set; }

    [JsonPropertyName("projectName")]
    public string? ProjectName { get; set; }
}
