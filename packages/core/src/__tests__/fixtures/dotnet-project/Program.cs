using TestApi.Endpoints;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();

var app = builder.Build();

app.UseAuthorization();

app.MapControllers();
app.MapProductEndpoints();
app.MapInvoiceEndpoints();

app.Run();
