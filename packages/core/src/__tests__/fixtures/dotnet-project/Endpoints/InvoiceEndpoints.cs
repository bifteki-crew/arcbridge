namespace TestApi.Endpoints;

/// <summary>
/// Minimal-API handlers carrying a real DTO. Method-group handlers
/// (MapGet("/x", Handler)) need cross-symbol resolution, which the tree-sitter
/// pass cannot do — those routes get endpoint-level checks only there.
/// </summary>
public static class InvoiceEndpoints
{
    public static void MapInvoiceEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/invoices");

        // Method group: the handler is a separate symbol, resolved semantically.
        group.MapGet("", GetAll);
        // Method group whose declared return type is opaque — body inference.
        group.MapGet("{id}", GetById);
        // Inline lambda returning a DTO.
        group.MapPost("", () => Results.Ok(new InvoiceDto { Number = "INV-1", AmountDue = 10m }));
    }

    private static InvoiceDto[] GetAll()
    {
        return [new InvoiceDto { Number = "INV-1", AmountDue = 10m }];
    }

    private static IResult GetById(int id)
    {
        return Results.Ok(new InvoiceDto { Number = $"INV-{id}", AmountDue = 5m });
    }
}

public class InvoiceDto
{
    public string Number { get; set; } = "";
    public decimal AmountDue { get; set; }
}
