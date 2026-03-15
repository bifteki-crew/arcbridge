using Microsoft.AspNetCore.Mvc;

namespace TestApi.Endpoints;

public static class ProductEndpoints
{
    public static void MapProductEndpoints(this WebApplication app)
    {
        var group = app.MapGroup("/api/products");

        group.MapGet("", GetAll);
        group.MapGet("{id}", GetById);
        group.MapPost("", Create).RequireAuthorization();
        group.MapDelete("{id}", Delete).RequireAuthorization("AdminOnly");
    }

    private static IResult GetAll()
    {
        return Results.Ok(new[] { "Product A", "Product B" });
    }

    private static IResult GetById(int id)
    {
        return Results.Ok($"Product {id}");
    }

    private static IResult Create([FromBody] string name)
    {
        return Results.Created($"/api/products/1", name);
    }

    private static IResult Delete(int id)
    {
        return Results.NoContent();
    }
}
