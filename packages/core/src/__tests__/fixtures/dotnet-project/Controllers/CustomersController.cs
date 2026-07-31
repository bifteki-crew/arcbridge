using Microsoft.AspNetCore.Mvc;

namespace TestApi.Controllers;

/// <summary>
/// Endpoints whose response DTO is NOT in the declared signature. The tree-sitter
/// backend can only read the signature, so it records no response type for these;
/// the Roslyn backend reads the body through the semantic model.
/// </summary>
[ApiController]
[Route("api/[controller]")]
public class CustomersController : ControllerBase
{
    /// Declared IActionResult — opaque. The DTO is only visible in the body.
    [HttpGet]
    public IActionResult GetAll()
    {
        return Ok(new CustomerDto { Id = 1, FullName = "Ada" });
    }

    /// Expression-bodied, still opaque in the signature.
    [HttpGet("featured")]
    public IActionResult GetFeatured() => Ok(new CustomerDto { Id = 2, FullName = "Grace" });

    /// Multiple returns agreeing on one DTO — the early NotFound() carries no DTO
    /// and must not defeat the inference.
    [HttpGet("{id}")]
    public IActionResult GetById(int id)
    {
        if (id <= 0) return NotFound();
        return Ok(new CustomerDto { Id = id, FullName = "Alan" });
    }

    /// Returns disagree, so the resolver must yield nothing rather than pick one —
    /// a confidently wrong DTO would produce wrong field mismatches.
    [HttpGet("ambiguous")]
    public IActionResult GetAmbiguous(bool flag)
    {
        if (flag) return Ok(new CustomerDto { Id = 1, FullName = "Ada" });
        return Ok(new CustomerSummaryDto { Id = 1 });
    }

    /// No DTO anywhere — must stay null instead of inventing a framework type.
    [HttpDelete("{id}")]
    public IActionResult Delete(int id) => NoContent();
}

public class CustomerDto
{
    public int Id { get; set; }
    public string FullName { get; set; } = "";
}

public class CustomerSummaryDto
{
    public int Id { get; set; }
}
