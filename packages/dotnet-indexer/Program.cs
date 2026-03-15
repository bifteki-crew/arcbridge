using System.Diagnostics;
using System.Text.Json;
using Microsoft.Build.Locator;
using Microsoft.CodeAnalysis.MSBuild;
using ArcBridge.DotnetIndexer.Analysis;
using ArcBridge.DotnetIndexer.Models;

// Register MSBuild before any Roslyn workspace calls
MSBuildLocator.RegisterDefaults();

return await RunAsync(args);

static async Task<int> RunAsync(string[] args)
{
    if (args.Length < 1)
    {
        await Console.Error.WriteLineAsync("Usage: ArcBridge.DotnetIndexer <project-or-solution-path> [--existing-hashes <json>]");
        return 1;
    }

    var projectPath = Path.GetFullPath(args[0]);
    if (!File.Exists(projectPath))
    {
        await Console.Error.WriteLineAsync($"File not found: {projectPath}");
        return 1;
    }

    // Parse existing hashes for incremental indexing
    Dictionary<string, string>? existingHashes = null;
    for (var i = 1; i < args.Length; i++)
    {
        if (args[i] == "--existing-hashes" && i + 1 < args.Length)
        {
            try
            {
                existingHashes = JsonSerializer.Deserialize<Dictionary<string, string>>(args[i + 1]);
            }
            catch (JsonException ex)
            {
                await Console.Error.WriteLineAsync($"Failed to parse --existing-hashes JSON: {ex.Message}");
                return 1;
            }
            i++;
        }
    }

    var sw = Stopwatch.StartNew();
    var projectRoot = Path.GetDirectoryName(projectPath)!;

    // For .sln files, the project root is the solution directory
    // For .csproj files, we may need to go up if the csproj is in a subdirectory
    var output = new IndexerOutput();

    try
    {
        using var workspace = MSBuildWorkspace.Create();

        // Suppress MSBuild warnings on stderr to keep stdout clean for JSON
        workspace.WorkspaceFailed += (_, e) =>
        {
            if (e.Diagnostic.Kind == Microsoft.CodeAnalysis.WorkspaceDiagnosticKind.Failure)
                Console.Error.WriteLine($"Workspace: {e.Diagnostic.Message}");
        };

        Microsoft.CodeAnalysis.Solution solution;

        if (projectPath.EndsWith(".sln", StringComparison.OrdinalIgnoreCase))
        {
            solution = await workspace.OpenSolutionAsync(projectPath);
        }
        else
        {
            var project = await workspace.OpenProjectAsync(projectPath);
            solution = project.Solution;
        }

        var allSymbolIds = new HashSet<string>();
        var allSymbols = new List<ExtractedSymbol>();

        // First pass: extract symbols from all projects
        foreach (var project in solution.Projects)
        {
            var compilation = await project.GetCompilationAsync();
            if (compilation is null) continue;

            foreach (var tree in compilation.SyntaxTrees)
            {
                var filePath = tree.FilePath;
                if (string.IsNullOrEmpty(filePath)) continue;

                // Skip generated/obj files
                var normalizedPath = filePath.Replace('\\', '/');
                if (normalizedPath.Contains("/obj/") || normalizedPath.Contains("/bin/"))
                    continue;

                // Compute relative path from project root
                var relativePath = Path.GetRelativePath(projectRoot, filePath)
                    .Replace('\\', '/');

                // Skip files outside the project root
                if (relativePath.StartsWith(".."))
                    continue;

                // Content hash for incremental indexing
                var content = (await tree.GetRootAsync()).ToFullString();
                var contentHash = ContentHasher.Hash(content);

                // Check if file is unchanged
                if (existingHashes is not null &&
                    existingHashes.TryGetValue(relativePath, out var existingHash) &&
                    existingHash == contentHash)
                {
                    output.FilesSkipped++;
                    continue;
                }

                output.ChangedFiles.Add(relativePath);
                output.FilesProcessed++;

                var model = compilation.GetSemanticModel(tree);
                var extractor = new SymbolExtractor(model, relativePath, contentHash, project.Name);
                extractor.Visit(tree.GetRoot());

                foreach (var symbol in extractor.Symbols)
                {
                    allSymbols.Add(symbol);
                    allSymbolIds.Add(symbol.Id);
                }
            }
        }

        output.Symbols = allSymbols;

        // Second pass: extract dependencies (needs all symbol IDs for cross-file resolution)
        foreach (var project in solution.Projects)
        {
            var compilation = await project.GetCompilationAsync();
            if (compilation is null) continue;

            foreach (var tree in compilation.SyntaxTrees)
            {
                var filePath = tree.FilePath;
                if (string.IsNullOrEmpty(filePath)) continue;

                var normalizedPath = filePath.Replace('\\', '/');
                if (normalizedPath.Contains("/obj/") || normalizedPath.Contains("/bin/"))
                    continue;

                var relativePath = Path.GetRelativePath(projectRoot, filePath)
                    .Replace('\\', '/');

                if (relativePath.StartsWith(".."))
                    continue;

                // Only extract deps from changed files
                if (!output.ChangedFiles.Contains(relativePath))
                    continue;

                var model = compilation.GetSemanticModel(tree);
                var depExtractor = new DependencyExtractor(model, relativePath, allSymbolIds);
                depExtractor.Visit(tree.GetRoot());
                output.Dependencies.AddRange(depExtractor.Dependencies);
            }
        }

        // Third pass: ASP.NET route analysis
        foreach (var project in solution.Projects)
        {
            var compilation = await project.GetCompilationAsync();
            if (compilation is null) continue;

            foreach (var tree in compilation.SyntaxTrees)
            {
                var filePath = tree.FilePath;
                if (string.IsNullOrEmpty(filePath)) continue;

                var normalizedPath = filePath.Replace('\\', '/');
                if (normalizedPath.Contains("/obj/") || normalizedPath.Contains("/bin/"))
                    continue;

                var relativePath = Path.GetRelativePath(projectRoot, filePath)
                    .Replace('\\', '/');

                if (relativePath.StartsWith(".."))
                    continue;

                var model = compilation.GetSemanticModel(tree);
                var routes = AspNetAnalyzer.AnalyzeRoutes(model, tree, relativePath);
                output.Routes.AddRange(routes);
            }
        }

        // Detect removed files (in existing hashes but not seen in compilation)
        if (existingHashes is not null)
        {
            var seenFiles = new HashSet<string>(output.ChangedFiles);
            // Also include skipped files (they exist but are unchanged)
            foreach (var project in solution.Projects)
            {
                var compilation = await project.GetCompilationAsync();
                if (compilation is null) continue;
                foreach (var tree in compilation.SyntaxTrees)
                {
                    if (string.IsNullOrEmpty(tree.FilePath)) continue;
                    var rel = Path.GetRelativePath(projectRoot, tree.FilePath).Replace('\\', '/');
                    seenFiles.Add(rel);
                }
            }

            foreach (var existingFile in existingHashes.Keys)
            {
                if (!seenFiles.Contains(existingFile))
                    output.RemovedFiles.Add(existingFile);
            }
        }
    }
    catch (Exception ex)
    {
        await Console.Error.WriteLineAsync($"Error: {ex.Message}");
        return 1;
    }

    sw.Stop();
    output.DurationMs = sw.ElapsedMilliseconds;

    // Output JSON to stdout
    var jsonOptions = new JsonSerializerOptions
    {
        WriteIndented = false,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingNull,
    };
    Console.WriteLine(JsonSerializer.Serialize(output, jsonOptions));

    return 0;
}
