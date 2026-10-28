namespace OrbitCord.App;

public sealed class ShortcutBinding
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public ShortcutAction Action { get; set; }
    public List<int> VirtualKeys { get; set; } = [];
    public bool Enabled { get; set; } = true;

    public ShortcutBinding Clone() => new()
    {
        Id = Id,
        Action = Action,
        VirtualKeys = [.. VirtualKeys],
        Enabled = Enabled
    };
}
