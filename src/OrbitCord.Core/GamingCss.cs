namespace OrbitCord.Core;

public static class GamingCss
{
    public const string ElementId = "orbitcord-gaming-style";

    public static string EnableScript => $$"""
        (() => {
          const id = '{{ElementId}}';
          let style = document.getElementById(id);
          if (!style) {
            style = document.createElement('style');
            style.id = id;
            document.documentElement.appendChild(style);
          }
          style.textContent = `
            *, *::before, *::after {
              animation-duration: 0.001ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.001ms !important;
              scroll-behavior: auto !important;
            }
          `;
          document.documentElement.dataset.orbitcordGaming = '1';
        })();
        """;

    public static string DisableScript => $$"""
        (() => {
          document.getElementById('{{ElementId}}')?.remove();
          delete document.documentElement.dataset.orbitcordGaming;
        })();
        """;
}
