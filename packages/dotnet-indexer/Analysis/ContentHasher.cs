using System.Security.Cryptography;
using System.Text;

namespace ArcBridge.DotnetIndexer.Analysis;

/// <summary>
/// Produces content hashes identical to the TypeScript indexer:
/// SHA-256(utf8 bytes) → hex → first 16 chars.
/// </summary>
public static class ContentHasher
{
    public static string Hash(string content)
    {
        var bytes = Encoding.UTF8.GetBytes(content);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash)[..16].ToLowerInvariant();
    }
}
