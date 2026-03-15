using TestApi.Models;

namespace TestApi.Services;

public interface IOrderService
{
    Task<Order?> GetByIdAsync(int id);
    Task<IReadOnlyList<Order>> GetAllAsync();
    Task<Order> CreateAsync(string customerName, decimal total);
}
