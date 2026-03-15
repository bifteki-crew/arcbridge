using TestApi.Models;

namespace TestApi.Services;

/// <summary>
/// In-memory implementation of the order service.
/// </summary>
public class OrderService : IOrderService
{
    private readonly List<Order> _orders = [];
    private int _nextId = 1;

    public Task<Order?> GetByIdAsync(int id)
    {
        return Task.FromResult(_orders.Find(o => o.Id == id));
    }

    public Task<IReadOnlyList<Order>> GetAllAsync()
    {
        return Task.FromResult<IReadOnlyList<Order>>(_orders.AsReadOnly());
    }

    public Task<Order> CreateAsync(string customerName, decimal total)
    {
        var order = new Order
        {
            Id = _nextId++,
            CustomerName = customerName,
            Total = total,
            Status = OrderStatus.Pending,
        };
        _orders.Add(order);
        return Task.FromResult(order);
    }
}
