namespace TestApi.Models;

/// <summary>
/// Represents a customer order.
/// </summary>
public class Order
{
    public int Id { get; set; }
    public required string CustomerName { get; set; }
    public decimal Total { get; set; }
    public OrderStatus Status { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public enum OrderStatus
{
    Pending,
    Confirmed,
    Shipped,
    Delivered,
    Cancelled
}
